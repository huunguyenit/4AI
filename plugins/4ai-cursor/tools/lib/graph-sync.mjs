// graph-sync.mjs — dataset rà soát UR → node/cạnh tầng dự án cho đồ thị.
//
// Đây là thứ làm cho câu chuyện nhiều người dùng chạy được: user A chạy báo cáo N1-N3,
// user B chạy N4-N6, quản lý C chạy cả sáu và ĐỌC NGAY phần A với B đã tổng kết chứ không
// dựng lại. Mỗi lần chạy báo cáo tự đẩy phần dự án của mình lên DB, `scope` = mã dự án nên
// không ai đạp lên phạm vi của ai (xem reloadStrategy `upsert-scoped` ở graph-schema.json).
//
// PHÂN TẦNG THEO GIÁ, không theo sở thích:
//   Tầng RẺ  — Project, Phase, Request, trạng thái: có sẵn trong dataset mà báo cáo VỐN ĐÃ
//              đọc từ QLDA. Đẩy lại mỗi lần chạy, không tốn thêm truy vấn nào.
//   Tầng ĐẮT — phân giải menu → controller → table, và ExperienceFact rút từ nội dung UR.
//              KHÔNG làm ở đây: nó cần tra chỉ mục FBO và LLM, chậm hơn nhiều bậc. Việc đó
//              chạy riêng và kết quả nằm lại trong DB để lần sau đọc thẳng.
//
// Thuần hàm: vào là dataset đã lấy sẵn, ra là {nodes, edges, scopes}. Không chạm DB, không
// chạm đĩa — caller quyết định đẩy hay không.

import { toExperienceFacts } from './experience-extract.mjs';

const chuan = (v) => String(v ?? '').trim();
const ngay = (v) => chuan(v).slice(0, 10) || undefined;

/** Trạng thái coi là đã làm xong — chỉ những UR này mới sinh kinh nghiệm. Xem graph-schema. */
export const TRANG_THAI_DA_XONG = ['HT', 'DT', 'OK', 'UP'];

/**
 * `1`/`0`/`true` → boolean; rỗng → undefined. Không ép rỗng thành `false`: "chưa khai" và
 * "khai là không" là hai chuyện khác nhau, gộp lại thì mất thông tin ngay ở tầng dữ liệu.
 */
function bit(v) {
  if (v === undefined || v === null || chuan(v) === '') return undefined;
  return /^(1|true|yes)$/i.test(chuan(v));
}

/**
 * Dataset → node/cạnh tầng dự án.
 *
 * @param {object} dataset - kết quả fetchReviewDataset: { projects[], yeuCau[] }
 * @param {{boi?: string}} [opts] - `boi` là mã người chạy, ghi vào cột audit
 * @returns {{nodes: Array, edges: Array, scopes: string[], boQua: string[]}}
 */
export function datasetToGraph(dataset = {}, opts = {}) {
  const nodes = [];
  const edges = [];
  const boQua = [];
  const boi = chuan(opts.boi) || undefined;

  // Phạm vi = đúng các dự án có mặt trong lần chạy này. Đây là thứ giới hạn mọi phép ghi/xoá,
  // nên suy từ dữ liệu thật chứ không nhận từ tham số: truyền nhầm một mã dự án vào đây là
  // cho phép lần chạy này xoá dữ liệu của dự án đó.
  const scopes = [...new Set(
    (dataset.yeuCau ?? []).map((u) => chuan(u.ma_da)).filter(Boolean),
  )].sort();

  const them = (kind, obj, scope) => {
    nodes.push({ _: 'node', kind, scope, capNhatBoi: boi, ...obj });
  };

  // ---- Project. Chỉ lấy dự án CÓ UR trong lần chạy này: dự án rỗng không thuộc phạm vi,
  // đẩy lên sẽ thành sở hữu một scope mà lần sau không ai dựng lại.
  const trongPhamVi = new Set(scopes);
  for (const p of dataset.projects ?? []) {
    const maDa = chuan(p.ma_da);
    if (!maDa || !trongPhamVi.has(maDa)) continue;
    them('Project', {
      ma_da: maDa,
      ten_da: chuan(p.ten_da) || undefined,
      ten_ngan: chuan(p.ten_ngan) || undefined,
      ma_pbsp: chuan(p.ma_pbsp) || undefined,
    }, maDa);
  }

  // ---- Phase. Hạn của giai đoạn đã được dataset gộp sẵn theo (ma_da, giai_doan_da) —
  // dùng lại đúng con số báo cáo đang hiện, không tính lại kiểu khác.
  const phaseDaCo = new Set();
  for (const u of dataset.yeuCau ?? []) {
    const maDa = chuan(u.ma_da);
    const gd = chuan(u.giai_doan_da);
    if (!maDa || !gd) continue;
    const id = `${maDa}|${gd}`;
    if (phaseDaCo.has(id)) continue;
    phaseDaCo.add(id);
    them('Phase', {
      id,
      ma_da: maDa,
      giai_doan_da: gd,
      deadline: ngay(u.ngay_ht),
      completionRequired: bit(u.xac_nhan_da_hen_yn),
      noi_dung: chuan(u.giai_doan_noi_dung) || undefined,
    }, maDa);
  }

  // ---- Request + ba cạnh khung. `trang_thai` KHÔNG nằm trên node: nó là quan hệ HAS_STATUS
  // tới node Status dùng chung (lookup tĩnh, scope `system`) — xem propsNote của schema.
  for (const u of dataset.yeuCau ?? []) {
    const maDa = chuan(u.ma_da);
    const stt = chuan(u.stt_rec);
    if (!stt) continue;
    if (!maDa) { boQua.push(`UR ${stt} không có ma_da — bỏ qua, không đoán dự án`); continue; }

    them('Request', {
      stt_rec: stt,
      fcode1: chuan(u.fcode1) || undefined,
      noi_dung: chuan(u.noi_dung) || undefined,
      tg_dk_th: u.tg_dk_th,
      ma_lt1: chuan(u.ur_ma_lt1) || undefined,
    }, maDa);

    edges.push({ _: 'edge', type: 'BELONGS_TO', from: `Request:${stt}`, to: `Project:${maDa}`, nguon: 'qlda' });

    const gd = chuan(u.giai_doan_da);
    if (gd) {
      edges.push({ _: 'edge', type: 'IN_PHASE', from: `Request:${stt}`, to: `Phase:${maDa}|${gd}`, nguon: 'qlda' });
    }
    const tt = chuan(u.trang_thai);
    if (tt) {
      // Status là lookup tĩnh đã nạp sẵn từ hạt giống. Cạnh trỏ tới mã không có trong lookup
      // sẽ bị validateGraph bắt — đúng ý: mã trạng thái lạ phải lộ ra chứ không im lặng trôi.
      edges.push({ _: 'edge', type: 'HAS_STATUS', from: `Request:${stt}`, to: `Status:${tt}`, nguon: 'qlda' });
    }
  }

  // ExperienceFact CỐ TÌNH không dựng ở đây. Dataset rà soát chỉ lấy UR ở DD/XN/TH (phạm vi
  // cổng PM), còn kinh nghiệm chỉ tính từ UR đã xong HT/DT/OK/UP — hai tập KHÔNG giao nhau.
  // Nối vào đây thì mã trông như đang chạy nhưng vĩnh viễn cho ra rỗng. Việc đó nằm ở
  // `4ai graph experience`, có phạm vi dữ liệu riêng.

  return { nodes, edges, scopes, boQua };
}

/**
 * UR đã xong → node Request + ExperienceFact + cạnh, cho `4ai graph experience`.
 *
 * Có dựng cả node Request vì đồ thị chỉ chứa UR ở DD/XN/TH (do đường báo cáo nộp); UR đã xong
 * chưa từng có mặt, mà cạnh PRODUCED_EXPERIENCE thì phải có đầu Request để bám vào.
 *
 * @param {Array} yeuCau - UR của MỘT dự án, mọi trạng thái (hàm tự lọc)
 * @param {Map} tuDien
 * @param {{maDa: string, boi?: string}} args
 */
export function doThiKinhNghiem(yeuCau = [], tuDien = new Map(), args = {}) {
  const maDa = chuan(args.maDa);
  const boi = chuan(args.boi) || undefined;
  const { nodes: factNodes, edges, thongKe } = kinhNghiemCuaDuAn(yeuCau, tuDien, { maDa, boi });

  const canRequest = new Set(factNodes.map((n) => n.stt_rec));
  const nodes = [];
  for (const u of urDaXong(yeuCau)) {
    const stt = chuan(u.stt_rec);
    if (!canRequest.has(stt)) continue;
    nodes.push({
      _: 'node', kind: 'Request', scope: maDa, capNhatBoi: boi,
      stt_rec: stt,
      fcode1: chuan(u.fcode1) || undefined,
      noi_dung: chuan(u.noi_dung) || undefined,
      ma_lt1: chuan(u.ur_ma_lt1 ?? u.ma_lt1) || undefined,
    });
  }
  nodes.push(...factNodes);
  return { nodes, edges, scopes: maDa ? [maDa] : [], thongKe };
}

/**
 * UR nào trong dataset đủ điều kiện sinh kinh nghiệm.
 *
 * Cổng trạng thái chỉ khai MỘT chỗ — phần rút hiện vật phải dùng đúng danh sách này, không
 * được tự lọc kiểu khác.
 */
export function urDaXong(yeuCau = []) {
  return yeuCau.filter((u) => TRANG_THAI_DA_XONG.includes(chuan(u.trang_thai)));
}

/**
 * Kinh nghiệm rút từ UR đã xong của MỘT dự án, gắn vào đồ thị.
 *
 * Cần từ điển màn hình của CHÍNH chương trình đó (`wcommand`, db sys) — mỗi khách một cây menu
 * riêng, dùng từ điển của khách khác sẽ phân giải ra `sysid` không tồn tại ở đây.
 *
 * @param {Array} yeuCau - UR của một dự án (chưa lọc trạng thái)
 * @param {Map} tuDien - buildTuDien() từ wcommand của chương trình đó
 * @param {{maDa: string, boi?: string}} args
 */
export function kinhNghiemCuaDuAn(yeuCau = [], tuDien = new Map(), args = {}) {
  const { nodes, edges, thongKe } = toExperienceFacts(urDaXong(yeuCau), tuDien, args);
  // Cạnh EXPERIENCE_ON nối kinh nghiệm tới chính controller — chỉ dựng khi node Controller của
  // scope đó đã có trong đồ thị, nếu không sẽ thành cạnh treo. Phần đó thuộc tầng cấu trúc,
  // chạy riêng; ở đây chỉ giữ PRODUCED_EXPERIENCE về Request vốn luôn có mặt.
  return { nodes, edges, thongKe };
}
