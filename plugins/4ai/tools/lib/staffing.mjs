// staffing.mjs — nhân sự phòng lập trình cho gợi ý phân công UR.
//
// Trả lời BỐN câu mà `assignee.mjs` cần dữ kiện mới chấm được điểm:
//   ai còn ở phòng · ai đã từng làm menu đó · ai đang gánh bao nhiêu việc sắp tới hạn ·
//   ai đóng góp UR đầu vào liên quan (chỉ áp cho UR là báo cáo đầu ra).
//
// HAI NGUỒN, HAI DATABASE KHÁC NHAU — đừng gộp:
//   `userinfo2` (DB **sys**, mặc định QLDA_SYS) là danh sách người: còn làm không (`status`),
//       đang ở phòng nào (`ma_bo_phan`), cấp bậc gì (`ma_chv`), ai quản lý trực tiếp (`s1`).
//   `nbphyc`/`nbctdaumuc` (DB **app**, mặc định QLDA_APP) là lịch sử: ai đã làm bao nhiêu UR
//       ở menu nào, và loại đầu mục nào (chứng từ/danh mục/import = đầu vào; báo cáo/mẫu in =
//       đầu ra — xem MA_DAUMUC_DAU_VAO/MA_DAUMUC_DAU_RA ở assignee.mjs).
//
// TẢI HIỆN TẠI KHÔNG HỎI SQL. Nó suy từ chính dataset đang rà soát, đi qua đúng
// `workdays.classifyDeadline` mà báo cáo dùng — nếu hỏi SQL riêng thì "sắp tới hạn" ở đây
// và "sắp tới hạn" trên báo cáo sẽ là hai định nghĩa khác nhau, lệch nhau lúc nào không hay.
//
// Không có đường nào từ file này tới `UPDATE nbphyc`. Toàn bộ là dữ kiện để ĐỀ XUẤT.

import { runSql, runGraphSql, sqlLiteral } from '../../mcp/fbo/lib/sql.mjs';
import { loadQldaConfig } from '../../src/database/qlda-metadata.mjs';
import { loadHolidays, classifyDeadline } from './workdays.mjs';
import { MA_DAUMUC_DAU_VAO } from './assignee.mjs';

const chuan = (v) => String(v ?? '').trim();
const khop = (a, b) => chuan(a) !== '' && chuan(a).toLowerCase() === chuan(b).toLowerCase();

/**
 * Cấp bậc trong phòng (`userinfo2.ma_chv`). PP = Phó phòng, quản lý nhân viên và TOÀN BỘ dự
 * án của phòng, nên PP là người đứng thay khi LTQL ghi trên dự án đã rời phòng. Số càng lớn
 * càng cao — dùng để chọn người thay, không dùng để chấm điểm ứng viên.
 */
export const CAP_BAC = { PP: 2, NV: 1 };

/** Mã bộ phận lập trình đang rà soát: filter truyền vào thắng, không có mới rớt về cấu hình. */
export function boPhanCuaPhien(hub, pmDept) {
  const dept = chuan(pmDept);
  if (dept) return dept;
  const cfg = loadQldaConfig(hub);
  const boPhan = chuan(cfg?.review?.pm?.boPhanLt);
  return /^\{[A-Za-z0-9_]+\}$/.test(boPhan) ? '' : boPhan;
}

/**
 * Roster phòng: người CÒN LÀM (`status='1'`) và CÒN Ở PHÒNG (`ma_bo_phan=<dept>`).
 * Hai điều kiện này chính là định nghĩa "chưa off, chưa chuyển công tác" — ai rớt khỏi câu
 * này thì không được đề xuất nhận việc mới, dù tên vẫn còn nằm trên dự án cũ.
 */
export function sqlRoster(dept) {
  return `
SELECT
  RTRIM(name)        AS ma_nv,
  RTRIM(comment)     AS ten,
  RTRIM(s1)          AS quan_ly,
  RTRIM(ma_bo_phan)  AS ma_bo_phan,
  RTRIM(ma_kcv)      AS ma_kcv,
  RTRIM(ma_chv)      AS ma_chv
FROM userinfo2
WHERE RTRIM(ma_bo_phan) = '${sqlLiteral(dept)}' AND status = '1'
ORDER BY ma_chv DESC, name`.trim();
}

/**
 * Lịch sử "ai đã làm menu này bao nhiêu lần", CHỈ cho các menu đang cần gợi ý và CHỈ cho
 * người còn trong roster.
 *
 * Hai giới hạn đó không phải để chạy nhanh mà để câu trả lời còn nghĩa: toàn bộ cặp
 * (người × menu) của một phòng là hơn ba vạn dòng, kéo hết về rồi lọc ở JS chỉ tổ tốn
 * đường truyền cho phần không ai đọc tới.
 *
 * KHÔNG lọc `trang_thai`: kinh nghiệm là chuyện đã làm rồi, UR đã UP mới đúng là bằng chứng
 * mạnh nhất. Cũng KHÔNG lọc `bp_lt` — người ở phòng này từng làm UR mang mã phòng khác thì
 * kinh nghiệm đó vẫn là của họ.
 */
export function sqlLichSuMenu(menuIds, maNvs) {
  const menus = menuIds.map((m) => `'${sqlLiteral(m)}'`).join(', ');
  const nguoi = maNvs.map((m) => `'${sqlLiteral(m)}'`).join(', ');
  return `
SELECT
  RTRIM(ma_lt1)  AS ma_lt1,
  RTRIM(menu_id) AS menu_id,
  COUNT(*)       AS so_ur
FROM nbphyc
WHERE RTRIM(menu_id) IN (${menus})
  AND RTRIM(ma_lt1) IN (${nguoi})
GROUP BY RTRIM(ma_lt1), RTRIM(menu_id)
ORDER BY RTRIM(menu_id), COUNT(*) DESC`.trim();
}

/**
 * "Ai đã làm bao nhiêu UR đầu vào trên đúng menu này" — dữ kiện cho tiêu chí 3 (báo cáo đầu
 * ra ưu tiên người đóng góp UR đầu vào liên quan).
 *
 * Nguồn là chính đầu mục công việc (`nbctdaumuc.ma_daumuc`), KHÔNG phải đoán qua nội dung UR
 * — xem MA_DAUMUC_DAU_VAO ở assignee.mjs cho ý nghĩa từng mã. `ma_lt` lấy trên ĐẦU MỤC chứ
 * không phải `ma_lt1` của cả UR: một UR có thể có nhiều đầu mục do nhiều người khác nhau làm
 * (vd một người thêm chứng từ, một người khác thêm import cho cùng UR đó), lấy theo UR sẽ gán
 * nhầm công cho người đứng tên UR dù họ không làm đúng phần đầu vào đó.
 */
export function sqlDongGopDauVao(menuIds, maNvs) {
  const menus = menuIds.map((m) => `'${sqlLiteral(m)}'`).join(', ');
  const nguoi = maNvs.map((m) => `'${sqlLiteral(m)}'`).join(', ');
  const maDaumuc = [...MA_DAUMUC_DAU_VAO].map((m) => `'${sqlLiteral(m)}'`).join(', ');
  return `
SELECT
  RTRIM(dmuc.ma_lt) AS ma_lt1,
  RTRIM(yc.menu_id) AS nguon,
  COUNT(*)          AS so_ur
FROM nbctdaumuc dmuc
JOIN nbphyc yc ON dmuc.stt_rec = yc.stt_rec
WHERE RTRIM(dmuc.ma_daumuc) IN (${maDaumuc})
  AND RTRIM(yc.menu_id) IN (${menus})
  AND RTRIM(dmuc.ma_lt) IN (${nguoi})
GROUP BY RTRIM(dmuc.ma_lt), RTRIM(yc.menu_id)
ORDER BY RTRIM(yc.menu_id), COUNT(*) DESC`.trim();
}

/**
 * Kinh nghiệm trên hiện vật, đọc từ đồ thị (`node_ExperienceFact` trên DB nội bộ GRAPH_4AI).
 *
 * Khác mọi câu SQL còn lại trong file này: chúng đọc QLDA (`QLDA_APP`/`QLDA_SYS`) của công ty, còn
 * câu này đọc đồ thị của chính 4AI — nơi kinh nghiệm ĐÃ được rút sẵn từ nội dung UR (xem
 * experience-extract.mjs). Nhờ đã rút sẵn nên user nào mở báo cáo cũng dùng chung kết quả,
 * không phải phân giải lại.
 *
 * Lọc theo `khoaHienVat` chứ không theo dự án: kinh nghiệm sửa `SVTran` ở dự án A vẫn là kinh
 * nghiệm dùng được khi giao việc `SVTran` ở dự án B.
 */
export function sqlKinhNghiemHienVat(sysids = [], maNvs = []) {
  const hv = sysids.map((s) => `'${sqlLiteral(s)}'`).join(', ');
  const nguoi = maNvs.map((m) => `'${sqlLiteral(m)}'`).join(', ');
  return `
SELECT RTRIM(ma_lt1) AS ma_lt1, RTRIM(khoaHienVat) AS khoaHienVat,
       MIN(RTRIM(tenHienVat)) AS tenHienVat, COUNT(DISTINCT RTRIM(stt_rec)) AS so_ur
FROM dbo.node_ExperienceFact
WHERE RTRIM(khoaHienVat) IN (${hv}) AND RTRIM(ma_lt1) IN (${nguoi})
GROUP BY RTRIM(ma_lt1), RTRIM(khoaHienVat)
ORDER BY COUNT(DISTINCT RTRIM(stt_rec)) DESC`.trim();
}

/** Chuẩn hoá dòng roster thô. */
export function normalizeRoster(rows = []) {
  const out = [];
  for (const r of rows) {
    const maNv = chuan(r.ma_nv);
    if (!maNv) continue;
    const maChv = chuan(r.ma_chv) || 'NV';
    out.push({
      ma_nv: maNv,
      ten: chuan(r.ten) || undefined,
      quan_ly: chuan(r.quan_ly) || undefined,
      ma_bo_phan: chuan(r.ma_bo_phan) || undefined,
      ma_kcv: chuan(r.ma_kcv) || undefined,
      ma_chv: maChv,
      capBac: CAP_BAC[maChv] ?? CAP_BAC.NV,
    });
  }
  return out;
}

/** Phó phòng — người đứng thay khi LTQL ghi trên dự án đã rời phòng. */
export function phoPhong(roster = []) {
  const pp = roster.filter((n) => n.ma_chv === 'PP').sort((a, b) => a.ma_nv.localeCompare(b.ma_nv));
  return pp[0]?.ma_nv ?? '';
}

/**
 * Ai trong phòng đang thật sự đóng vai PM.
 *
 * PM không phải một chức vụ trong `userinfo2` — mọi PM ở đây đều mang `ma_chv='NV'`. Dấu
 * hiệu duy nhất là ĐỨNG TÊN LẬP TRÌNH QUẢN LÝ: mã của họ nằm ở `nbdmda.ma_lt1/ma_lt2/ma_lt3`
 * của một dự án còn UR trong phạm vi rà soát (DD/XN/TH). PM cũng là nhân viên và vẫn trực
 * tiếp lập trình, nên việc này KHÔNG loại họ khỏi danh sách ứng viên — chỉ để nói rõ vai.
 *
 * @param {Array} roster - đã normalize
 * @param {Array} projects - dataset.projects[] (mỗi phần tử có `ltql[]`)
 * @returns {Set<string>}
 */
export function xacDinhPm(roster = [], projects = []) {
  const chuanHoa = tenChinhTac(roster);
  const pm = new Set();
  for (const p of projects) {
    for (const nguoi of p.ltql ?? []) {
      const ma = chuanHoa(nguoi);
      if (ma) pm.add(ma);
    }
  }
  return pm;
}

/**
 * Trả về hàm đưa một mã bất kỳ về đúng cách viết trong roster, hoặc '' nếu không thuộc phòng.
 *
 * `nbdmda.ma_lt1`, `nbphyc.ma_lt1` và `nbctdaumuc.ma_lt` đều không thống nhất hoa thường
 * ('ThanhNM' cạnh 'NV07', thậm chí 'hoatv' toàn thường trên dữ liệu thật đo được ở
 * nbctdaumuc). So khớp không phân biệt hoa thường là đủ để nhận ra người, nhưng nếu ĐEM
 * NGUYÊN chuỗi thô đi hiển thị và gộp Map (như tenUngVien ở assignee.mjs) thì bản ghi cùng
 * người, khác cách viết hoa sẽ GHI ĐÈ lẫn nhau — kết quả hiển thị phụ thuộc thứ tự spread,
 * có lúc ra tên đúng, có lúc ra tên viết thường trần trụi. Xuất khỏi DB chỗ nào thì chuẩn hoá
 * ngay chỗ đó, đừng để việc này trôi tới tận lúc hiển thị.
 */
export function tenChinhTac(roster = []) {
  const map = new Map(roster.map((n) => [n.ma_nv.toLowerCase(), n.ma_nv]));
  return (ma) => map.get(chuan(ma).toLowerCase()) ?? '';
}

/**
 * PM thật sự của một dự án.
 *
 * LTQL ghi trên `nbdmda` là dữ liệu ĐÃ NGUỘI: người nghỉ việc hoặc chuyển phòng vẫn còn tên
 * ở đó. Đối chiếu với roster là cách duy nhất phát hiện — UR mang `bp_lt` của phòng mình
 * nhưng LTQL không có trong roster nghĩa là người đó đã off hoặc đã chuyển bộ phận. Khi ấy
 * người chịu trách nhiệm là Phó phòng, vì PP quản lý toàn bộ dự án của phòng.
 *
 * @returns {{pm: string[], nguon: 'ltql'|'pp-thay-the'|'pp-mac-dinh'|'khong-xac-dinh',
 *            ngoaiPhong: string[]}}
 */
export function pmCuaDuAn(ltql = [], roster = [], pp = '') {
  const chuanHoa = tenChinhTac(roster);
  const ten = ltql.map(chuan).filter(Boolean);
  const conTrongPhong = [...new Set(ten.map(chuanHoa).filter(Boolean))];
  const ngoaiPhong = [...new Set(ten.filter((m) => !chuanHoa(m)))];

  if (conTrongPhong.length) return { pm: conTrongPhong, nguon: 'ltql', ngoaiPhong };
  if (!pp) return { pm: [], nguon: 'khong-xac-dinh', ngoaiPhong };
  return { pm: [pp], nguon: ten.length ? 'pp-thay-the' : 'pp-mac-dinh', ngoaiPhong };
}

/**
 * Tải hiện tại của từng người, đo trên CHÍNH dataset đang rà soát.
 *
 * `so_ur_toi_han` gộp cả quá hạn lẫn sắp tới hạn: cái quá hạn còn ép người ta hơn cái sắp
 * tới, gạt nó ra khỏi phép đo tải là tự nói dối. Ngưỡng "sắp tới" lấy từ
 * `holidays.leadWorkingDays`, cùng chỗ báo cáo lấy.
 *
 * @param {Array} yeuCau - dataset.yeuCau[] (cần `ur_ma_lt1`, `ngay_ht`)
 * @param {Object} h - holidays đã nạp
 * @param {string} ngayChay - YYYY-MM-DD
 */
export function buildTaiTrong(yeuCau = [], h, ngayChay) {
  const out = new Map();
  for (const u of yeuCau) {
    const nguoi = chuan(u.ur_ma_lt1 ?? u.ma_lt1);
    if (!nguoi) continue;
    const rec = out.get(nguoi) ?? { ma_lt1: nguoi, so_ur_toi_han: 0, so_ur_dang_mo: 0 };
    rec.so_ur_dang_mo += 1;
    const han = String(u.ngay_ht ?? '').slice(0, 10);
    if (han) {
      const { muc } = classifyDeadline(h, ngayChay, han);
      if (muc === 'qua-han' || muc === 'sap-toi') rec.so_ur_toi_han += 1;
    }
    out.set(nguoi, rec);
  }
  return [...out.values()].sort((a, b) =>
    b.so_ur_toi_han - a.so_ur_toi_han || a.ma_lt1.localeCompare(b.ma_lt1));
}

/**
 * Menu nào đang cần gợi ý người nhận — chỉ UR ở DD. Không lọc theo "đã phân hay chưa" ở đây:
 * việc đó cần biết PM của từng dự án, mà tập menu rộng hơn một chút thì chỉ tốn vài dòng SQL,
 * còn thiếu menu thì mất hẳn tiêu chí 1 của một UR.
 */
export function menuCanGoiY(yeuCau = []) {
  const out = new Set();
  for (const u of yeuCau) {
    if (chuan(u.trang_thai) !== 'DD') continue;
    const menu = chuan(u.menu_id);
    if (menu) out.add(menu);
  }
  return [...out].sort();
}

function qldaConnection(hub) {
  const cfg = loadQldaConfig(hub);
  const qlda = cfg?.databases?.qlda;
  if (!qlda?.path || !qlda?.databaseName) {
    throw new Error(
      'Không đọc được cấu hình kết nối QLDA (data/qlda.json → databases.qlda.path/databaseName).');
  }
  return {
    programPath: qlda.path,
    database: qlda.databaseName,
    sysDatabase: qlda.sysDatabaseName || undefined,
  };
}

/**
 * Nạp khối `nhanSu` cho payload báo cáo.
 *
 * Thiếu dữ kiện thì GHI RÕ ra `thieuDuLieu` chứ không im lặng trả mảng rỗng — mục gợi ý im
 * lặng là thứ đã làm PM tưởng báo cáo hỏng. Lỗi SQL của một nguồn không đánh sập cả báo cáo:
 * mất roster thì vẫn còn tải trọng, và ngược lại.
 *
 * @param {string} hub
 * @param {{pmDept?: string, yeuCau: Array, projects?: Array, ngayChay: string}} args
 * @param {{runSql?: Function, holidays?: Object}} [deps] - để test không chạm DB
 * @returns {{boPhan: string, roster: Array, ungVien: Array, pm: string[], phoPhong: string,
 *            lichSuMenu: Array, taiTrong: Array, dongGopDauVao: Array, thieuDuLieu: string[]}}
 */
export function buildNhanSu(hub, args = {}, deps = {}) {
  const sqlFn = deps.runSql ?? runSql;
  const h = deps.holidays ?? loadHolidays(hub);
  const yeuCau = args.yeuCau ?? [];
  const boPhan = boPhanCuaPhien(hub, args.pmDept);
  const thieuDuLieu = [];

  let roster = [];
  let lichSuMenu = [];
  let dongGopDauVao = [];
  if (!boPhan) {
    thieuDuLieu.push(
      'Chưa biết bộ phận lập trình (truyền --dept, hoặc gán pm.boPhanLt trong data/qlda.local.json) '
      + '— không dựng được danh sách nhân sự, chỉ còn xếp theo tải.');
  } else {
    const { programPath, database, sysDatabase } = qldaConnection(hub);
    try {
      const res = sqlFn({
        programPath, database: sysDatabase, dbType: 'sys', sql: sqlRoster(boPhan), maxRows: 500,
      });
      roster = normalizeRoster(res.rows ?? []);
    } catch (e) {
      thieuDuLieu.push(`Không đọc được userinfo2 (roster phòng ${boPhan}): ${e.message}`);
    }
    if (!thieuDuLieu.length && !roster.length) {
      thieuDuLieu.push(`userinfo2 không có ai đang làm việc ở bộ phận ${boPhan} — kiểm lại mã bộ phận.`);
    }

    // Cách viết hoa/thường của `ma_lt` trên đầu mục và của `ma_lt1` trên UR không đáng tin —
    // chuẩn hoá về ĐÚNG cách viết trong roster ngay khi đọc ra, xem tenChinhTac(). Người
    // không còn trong roster (đã off/chuyển phòng) bị chuanHoa() trả về '' và bị lọc luôn —
    // đúng ý: người đó không được đề xuất nhận việc mới.
    const chuanHoa = tenChinhTac(roster);
    const menuIds = menuCanGoiY(yeuCau);
    if (roster.length && menuIds.length) {
      try {
        const res = sqlFn({
          programPath, database, dbType: 'app',
          sql: sqlLichSuMenu(menuIds, roster.map((n) => n.ma_nv)),
          maxRows: 5000,
        });
        lichSuMenu = (res.rows ?? [])
          .map((r) => ({ ma_lt1: chuanHoa(r.ma_lt1), menu_id: chuan(r.menu_id), so_ur: Number(r.so_ur) || 0 }))
          .filter((r) => r.ma_lt1 && r.menu_id);
      } catch (e) {
        thieuDuLieu.push(`Không đọc được lịch sử menu từ nbphyc: ${e.message}`);
      }
      try {
        const res = sqlFn({
          programPath, database, dbType: 'app',
          sql: sqlDongGopDauVao(menuIds, roster.map((n) => n.ma_nv)),
          maxRows: 5000,
        });
        dongGopDauVao = (res.rows ?? [])
          .map((r) => ({ ma_lt1: chuanHoa(r.ma_lt1), nguon: chuan(r.nguon), so_ur: Number(r.so_ur) || 0 }))
          .filter((r) => r.ma_lt1 && r.nguon);
      } catch (e) {
        thieuDuLieu.push(`Không đọc được đóng góp UR đầu vào từ nbctdaumuc: ${e.message}`);
      }
    }
  }

  // Tải hiện tại đo trên `ur_ma_lt1` — cũng từ DB, cũng cần chuẩn hoá cùng cách viết. Người
  // ngoài roster (đã off, hoặc UR mang mã PM/phòng khác) không chuẩn hoá được, giữ nguyên
  // chuỗi thô: buildTaiTrong() vẫn phải dùng được độc lập (test trực tiếp không có roster).
  const chuanHoaTai = tenChinhTac(roster);
  const taiTrong = buildTaiTrong(yeuCau, h, args.ngayChay)
    .map((r) => ({ ...r, ma_lt1: chuanHoaTai(r.ma_lt1) || r.ma_lt1 }));

  // Kinh nghiệm hiện vật: cần biết UR đang chờ giao đụng vào hiện vật NÀO, rồi mới hỏi ai đã
  // làm những hiện vật đó. Hiện vật do caller rút sẵn và gắn vào `u.hienVat` (cần từ điển
  // `wcommand` của từng chương trình — không lấy được ở đây vì file này chỉ biết QLDA).
  let kinhNghiemHienVat = [];
  const sysidCan = [...new Set(
    yeuCau.filter((u) => chuan(u.trang_thai) === 'DD').flatMap((u) => u.hienVat ?? []).map(chuan).filter(Boolean),
  )].sort();
  if (sysidCan.length && roster.length) {
    try {
      const sqlGraph = deps.runGraphSql ?? runGraphSql;
      const res = sqlGraph({ sql: sqlKinhNghiemHienVat(sysidCan, roster.map((n) => n.ma_nv)), maxRows: 5000 });
      const chuanHoa = tenChinhTac(roster);
      kinhNghiemHienVat = (res.rows ?? [])
        .map((r) => ({
          ma_lt1: chuanHoa(r.ma_lt1),
          khoaHienVat: chuan(r.khoaHienVat),
          tenHienVat: chuan(r.tenHienVat) || undefined,
          so_ur: Number(r.so_ur) || 0,
        }))
        .filter((r) => r.ma_lt1 && r.khoaHienVat);
    } catch (e) {
      thieuDuLieu.push(`Không đọc được kinh nghiệm hiện vật từ đồ thị (node_ExperienceFact): ${e.message}`);
    }
  }

  const pmSet = xacDinhPm(roster, args.projects ?? []);
  return {
    boPhan,
    kinhNghiemHienVat,
    nguon: 'userinfo2 (DB sys) + nbphyc + nbctdaumuc (DB app) — tải trọng suy từ chính dataset này',
    roster,
    // `ungVien` là hợp đồng mà assignee.mjs đọc; roster giữ nguyên để báo cáo hiển thị tên.
    ungVien: roster.map((n) => ({ ma_nv: n.ma_nv, ten: n.ten, ma_chv: n.ma_chv })),
    pm: [...pmSet].sort(),
    phoPhong: phoPhong(roster),
    lichSuMenu,
    taiTrong,
    dongGopDauVao,
    thieuDuLieu,
  };
}
