// recommendation-log.mjs — gợi ý đã đưa ra, và điều PM thật sự làm sau đó.
//
// KHÔNG hỏi PM câu nào. PM duyệt trên web QLDA, không mở repo, không chạy script — nên mọi
// cơ chế đòi PM xác nhận vào git sẽ vĩnh viễn rỗng. Thay vào đó: ghi lại gợi ý mỗi lần chạy
// báo cáo, rồi lần chạy sau ĐỌC LẠI `nbphyc.ma_lt1` (vốn đã có trong dataset) để biết PM đã
// giao cho ai. Kết quả tự suy ra, không ai phải gõ thêm gì.
//
//   chạy hôm nay   → UR ở DD chưa giao, gợi ý NV01 → ghi snapshot
//   PM giao trên web QLDA cho PM01            → 4AI không biết, không cần biết
//   chạy hôm sau   → dataset cho thấy ma_lt1 = PM01 → đối chiếu → override
//
// Lưu trong ĐỒ THỊ (`node_RecommendationLog`, scope = mã dự án), không phải file cục bộ.
// Bản đầu ghi ra `ledgerRoot()/recommendations.jsonl` — chạy được với một người, nhưng hub
// dùng cho nhiều người: user A không đọc được file trên máy user B, nên quản lý C mở báo cáo
// chung sẽ chỉ thấy phần mình từng chạy. Cùng lý do đã chuyển cả đồ thị vào DB ở lược đồ v3.
//
// Không có đường nào từ file này tới `UPDATE nbphyc`, và cũng không có lệnh ghi DB nào —
// `toGraphNodes()` TRẢ VỀ node, đường đẩy chung của đồ thị mới ghi.

import { laChuaPhanCong } from './assignee.mjs';

const chuan = (v) => String(v ?? '').trim();
const khop = (a, b) => chuan(a) !== '' && chuan(a).toLowerCase() === chuan(b).toLowerCase();

/** Đọc log đã ghi của các dự án trong phạm vi. Lọc theo scope để không kéo về cả kho. */
export function sqlDocLog(maDas = []) {
  const ds = maDas.map((m) => `'${String(m).replace(/'/g, "''")}'`).join(', ');
  return `
SELECT RTRIM(stt_rec) AS stt_rec, RTRIM(ma_da) AS ma_da, RTRIM(menu_id) AS menu_id,
       RTRIM(ngayGoiY) AS ngayGoiY, RTRIM(policyVersion) AS policyVersion,
       RTRIM(chamTheo) AS chamTheo, RTRIM(goiYTop1) AS goiYTop1, daGoiY
FROM dbo.node_RecommendationLog
WHERE RTRIM(ma_da) IN (${ds})`.trim();
}

/**
 * Đọc log từ đồ thị.
 *
 * Hỏng thì trả rỗng chứ không ném: log là dữ liệu phụ trợ cho một mục trên dashboard, mất nó
 * không được phép làm sập báo cáo — thứ PM cần sáng nay là bảng hạn, không phải tỉ lệ trúng.
 *
 * @param {{runGraphSql: Function}} deps
 * @param {string[]} maDas
 */
export function docLog(deps, maDas = []) {
  if (!maDas.length || typeof deps?.runGraphSql !== 'function') return [];
  try {
    const res = deps.runGraphSql({ sql: sqlDocLog(maDas), maxRows: 20000 });
    return (res.rows ?? []).map((r) => ({
      ...r,
      // `daGoiY` lưu dạng chuỗi JSON trong NVARCHAR(MAX) — SQL Server graph không có kiểu mảng.
      daGoiY: (() => { try { return JSON.parse(r.daGoiY || '[]'); } catch { return []; } })(),
    }));
  } catch {
    return [];
  }
}

/**
 * Snapshot gợi ý của MỘT lần chạy báo cáo.
 *
 * Chỉ ghi UR thật sự có gợi ý (DD, chưa phân công) — UR không qua bước gợi ý thì không có gì
 * để đối chiếu sau này. `daGoiY` giữ nguyên thứ hạng lúc đó: trọng số có thể đổi về sau, và
 * khi đó chấm lại sẽ ra số khác, không còn là cái PM đã nhìn thấy.
 *
 * @param {Array<{ur: object, goiY: object}>} goiYs  kết quả goiYPhanCong()
 * @param {{ngayChay: string}} args
 * @returns {Array<object>} bản ghi mới (chưa ghi đĩa)
 */
export function snapshotGoiY(goiYs = [], args = {}) {
  const ngay = chuan(args.ngayChay);
  const out = [];
  for (const { ur, goiY } of goiYs) {
    const sttRec = chuan(ur.stt_rec);
    if (!sttRec || !goiY?.ungVien?.length) continue;
    out.push({
      stt_rec: sttRec,
      ma_da: chuan(ur.ma_da) || undefined,
      menu_id: chuan(ur.menu_id) || undefined,
      ngayGoiY: ngay,
      policyVersion: goiY.policyVersion,
      // Thang chấm đi cùng thứ hạng: so hai lần gợi ý mà không biết cái nào chấm theo hiện
      // vật, cái nào rơi về menu_id, thì mọi kết luận về "gợi ý tốt lên hay xấu đi" đều vô nghĩa.
      chamTheo: goiY.chamTheo,
      daGoiY: goiY.ungVien.map((c) => ({ ma_lt1: c.ma_lt1, diem: c.diem, doTinCay: c.doTinCay })),
    });
  }
  return out;
}

/**
 * Bản ghi snapshot → node đồ thị + cạnh về Request.
 *
 * Khoá `<stt_rec>|<ngày>` nên chạy report hai lần trong một ngày ghi đè chính nó thay vì đẻ
 * node thứ hai — không cần lọc trùng ở tầng ứng dụng, `MERGE` của đồ thị lo phần đó.
 *
 * @returns {{nodes: Array, edges: Array}}
 */
export function toGraphNodes(banGhi = [], opts = {}) {
  const boi = chuan(opts.boi) || undefined;
  const nodes = [];
  const edges = [];
  for (const r of banGhi) {
    const stt = chuan(r.stt_rec);
    const maDa = chuan(r.ma_da);
    const ngay = chuan(r.ngayGoiY);
    if (!stt || !maDa || !ngay) continue;
    const id = `${stt}|${ngay}`;
    nodes.push({
      _: 'node', kind: 'RecommendationLog', scope: maDa, capNhatBoi: boi,
      id,
      stt_rec: stt,
      ma_da: maDa,
      menu_id: chuan(r.menu_id) || undefined,
      ngayGoiY: ngay,
      policyVersion: chuan(r.policyVersion) || undefined,
      chamTheo: chuan(r.chamTheo) || undefined,
      goiYTop1: r.daGoiY?.[0]?.ma_lt1 ?? undefined,
      daGoiY: r.daGoiY ?? [],
    });
    edges.push({ _: 'edge', type: 'HAS_RECOMMENDATION',
      from: `Request:${stt}`, to: `RecommendationLog:${maDa}|${id}`, nguon: 'goi-y-tu-dong' });
  }
  return { nodes, edges };
}

/**
 * Đối chiếu gợi ý cũ với trạng thái HIỆN TẠI của UR trong dataset.
 *
 * Ba kết cục, và cái thứ ba là lý do hàm này tồn tại:
 *   `chua-giao`  — UR vẫn ở DD chưa phân công: PM chưa quyết, chưa kết luận được gì.
 *   `trung`      — PM giao đúng người đứng đầu gợi ý.
 *   `khac`       — PM giao người khác. KHÔNG suy ra vì sao: lý do nằm trong đầu PM, không
 *                  nằm trong `nbphyc`. Ghi nhận sự việc, để trống động cơ.
 *
 * UR biến mất khỏi dataset (đóng, đổi phạm vi rà soát) thì không có kết cục — bỏ qua, chứ
 * không đoán là đã giao cho ai.
 *
 * @param {Array} logs      docLog()
 * @param {Array} yeuCau    dataset.yeuCau[] hiện tại
 * @param {Map<string,string>} pmTheoDuAn  ma_da -> mã PM (để nhận ra ma_lt1 mặc định của BA)
 * @returns {Array<object>} một phần tử cho mỗi snapshot có đối chiếu được
 */
export function doiChieu(logs = [], yeuCau = [], pmTheoDuAn = new Map()) {
  const theoStt = new Map();
  for (const u of yeuCau) {
    const stt = chuan(u.stt_rec);
    if (stt) theoStt.set(stt, u);
  }

  const out = [];
  for (const log of logs) {
    const ur = theoStt.get(chuan(log.stt_rec));
    if (!ur) continue;

    const top1 = log.daGoiY?.[0]?.ma_lt1 ?? '';
    const thucTe = chuan(ur.ur_ma_lt1 ?? ur.ma_lt1);
    const pm = pmTheoDuAn.get(chuan(log.ma_da ?? ur.ma_da)) ?? '';

    // `ma_lt1` mang đúng mã PM là giá trị mặc định màn hình BA để lại, không phải đã giao —
    // dùng chung một định nghĩa với báo cáo, đừng đẻ định nghĩa thứ hai ở đây.
    const ketCuc = laChuaPhanCong(thucTe, pm) ? 'chua-giao' : khop(thucTe, top1) ? 'trung' : 'khac';

    out.push({
      stt_rec: log.stt_rec,
      ma_da: log.ma_da,
      menu_id: log.menu_id,
      ngayGoiY: log.ngayGoiY,
      policyVersion: log.policyVersion,
      goiYTop1: top1,
      daGoiY: log.daGoiY ?? [],
      thucTe: ketCuc === 'chua-giao' ? '' : thucTe,
      ketCuc,
    });
  }
  return out;
}

/**
 * Tổng hợp cho dashboard: gợi ý có đáng tin không, và ai hay được chọn thay.
 *
 * `tiLeTrung` chỉ tính trên UR ĐÃ được giao — gộp cả UR PM chưa quyết vào mẫu số sẽ làm tỉ lệ
 * trông tệ đi chỉ vì báo cáo chạy sớm.
 */
export function tongHop(doiChieuList = []) {
  const daQuyet = doiChieuList.filter((d) => d.ketCuc !== 'chua-giao');
  const trung = daQuyet.filter((d) => d.ketCuc === 'trung');

  // Ai được PM chọn dù không phải người gợi ý đứng đầu — tín hiệu trọng số đang lệch.
  const thayThe = new Map();
  for (const d of daQuyet) {
    if (d.ketCuc !== 'khac' || !d.thucTe) continue;
    const cu = thayThe.get(d.thucTe) ?? { ma_lt1: d.thucTe, soLan: 0, trongGoiY: 0 };
    cu.soLan += 1;
    // Có mặt trong danh sách gợi ý nhưng không đứng đầu ≠ hoàn toàn ngoài tầm nhìn thuật toán.
    if (d.daGoiY.some((c) => khop(c.ma_lt1, d.thucTe))) cu.trongGoiY += 1;
    thayThe.set(d.thucTe, cu);
  }

  return {
    soGoiY: doiChieuList.length,
    soDaQuyet: daQuyet.length,
    soChuaGiao: doiChieuList.length - daQuyet.length,
    soTrung: trung.length,
    tiLeTrung: daQuyet.length ? Math.round((trung.length / daQuyet.length) * 1000) / 10 : null,
    thayThe: [...thayThe.values()].sort((a, b) => b.soLan - a.soLan || a.ma_lt1.localeCompare(b.ma_lt1)),
  };
}
