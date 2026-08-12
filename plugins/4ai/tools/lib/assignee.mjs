// assignee.mjs — gợi ý người tiếp nhận cho UR ở trạng thái DD chưa có ma_lt1.
//
// Thuần hàm: vào là dữ kiện đã lấy sẵn qua SQL, ra là danh sách ứng viên có điểm và LÝ DO.
// Không đọc file, không chạm DB, không đoán — chỗ nào thiếu dữ kiện thì hạ độ tin cậy và
// nói rõ, chứ không bịa ra một cái tên nghe hợp lý.
//
// Ba tiêu chí, đúng thứ tự ưu tiên PM đã nêu:
//   1. Đã từng làm ĐÚNG phân hệ đó trong lịch sử dự án  → ưu tiên cao nhất
//   2. Đang gánh ít UR sắp tới hạn                          → điểm phạt theo tải
//   3. UR là báo cáo đầu ra → ai đóng góp nhiều UR đầu vào liên quan
//
// "Đúng phân hệ" khớp theo menu_id, hoặc bar (tên phân hệ) khi menu_id khác — KHÔNG khớp
// theo sysid đơn thuần: một controller (sysid) có thể phục vụ nhiều phân hệ hoàn toàn khác
// nhau (vd sysid `Customer` dùng chung cho "Danh mục khách hàng" VÀ "Danh mục nhà cung cấp"
// trên DEMO1) — coi chung sysid là "cùng kinh nghiệm" sẽ gợi ý sai người. Xem khopPhanHe().
//
// Kết quả là ĐỀ XUẤT. Không có đường nào từ đây tới `UPDATE nbphyc`.

/** Trọng số mặc định. Ghi đè bằng data/qlda.json → review.phanCong. */
export const TRONG_SO_MAC_DINH = {
  diemMenu: 100,          // tiêu chí 1 — chiếm ưu thế khi có lịch sử
  diemDauVao: 60,         // tiêu chí 3 — chỉ áp cho báo cáo đầu ra
  phatMoiUrToiHan: 15,    // tiêu chí 2 — trừ mỗi UR sắp tới hạn đang gánh
  phatToiDa: 60,          // trần điểm phạt, để tải nặng không xoá sạch lợi thế kinh nghiệm
  baoHoaSoUr: 3,          // làm 3 UR cùng menu là đạt điểm kinh nghiệm tối đa
  soGoiY: 3,              // số ứng viên trả về mỗi UR
};

/** Bỏ dấu tiếng Việt để so khớp — cùng quy tắc với chỉ mục không dấu của FBO. */
export function boDau(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Từ khoá nhận diện UR là báo cáo đầu ra khi payload không khai tường minh. */
const DAU_RA_RE = /\b(bao cao|report|mau in|in ra|xuat file|xuat excel|thong ke|bang ke|so sach)\b/;

/**
 * UR này có phải báo cáo đầu ra không.
 * @returns {{laDauRa: boolean, nguon: string}} nguon = 'payload' | 'noi_dung' | 'khong'
 */
export function nhanDienBaoCaoDauRa(u) {
  if (typeof u?.laBaoCaoDauRa === 'boolean') {
    return { laDauRa: u.laBaoCaoDauRa, nguon: 'payload' };
  }
  if (DAU_RA_RE.test(boDau(u?.noi_dung))) {
    return { laDauRa: true, nguon: 'noi_dung' };
  }
  return { laDauRa: false, nguon: 'khong' };
}

const chuan = (v) => String(v ?? '').trim();
const khop = (a, b) => chuan(a) !== '' && chuan(a).toLowerCase() === chuan(b).toLowerCase();

/**
 * Hai dòng có CÙNG phân hệ nghiệp vụ không — dùng cho tiêu chí 1 (kinh nghiệm menu) và
 * tiêu chí 3 (đóng góp UR đầu vào).
 *
 * `menu_id` là khớp chắc chắn nhất: dữ liệu thật (DEMO1) cho thấy mỗi menu_id chỉ gắn đúng
 * một `bar`. Khi menu_id không khớp thì `bar` (tên phân hệ) là tín hiệu thứ hai — CỐ TÌNH
 * không dùng `sysid` để khớp, vì một controller có thể phục vụ nhiều phân hệ khác hẳn nhau.
 * Ví dụ thật đo được trên DEMO1: sysid `Customer` đứng sau CẢ hai menu "Danh mục khách hàng"
 * (04.07.01) lẫn "Danh mục nhà cung cấp" (05.07.01) — coi hai việc đó là "cùng kinh nghiệm"
 * chỉ vì chung controller là sai: một bên là khách hàng (AR), một bên là nhà cung cấp (AP).
 * `sysid` vẫn được giữ lại trong dữ liệu để hiển thị tham khảo, không dùng để quyết định khớp.
 *
 * @returns {'menu_id'|'bar'|null}
 */
function khopPhanHe(a, b) {
  if (khop(a?.menu_id, b?.menu_id)) return 'menu_id';
  const barA = boDau(a?.bar), barB = boDau(b?.bar);
  if (barA && barB && barA === barB) return 'bar';
  return null;
}

/**
 * UR này CÓ THẬT SỰ chưa được giao không — tính cả trường hợp `ma_lt1` mang đúng mã PM.
 *
 * Màn hình BA dùng để lên UR mặc định `ma_lt1` = mã PM (PM là người duyệt/tiếp nhận đầu
 * tiên); PM mới là người thật sự phân việc sau đó. Nên `ma_lt1 === mã PM` KHÔNG chứng minh
 * đã giao — coi như trống, giống hệt `ma_lt1` rỗng.
 *
 * Không loại PM khỏi danh sách ứng viên: PM cũng trực tiếp lập trình, `ma_lt1` thật sự là
 * PM (không phải giá trị mặc định còn sót) vẫn hợp lệ — hàm này chỉ trả lời "cần gợi ý
 * không", không quyết định "PM có được đề xuất không".
 *
 * @param {string} maLt1
 * @param {string} pmCode - Mã PM đang chạy rà soát (payload.pm hoặc qlda.json → review.pm.maNv)
 */
export function laChuaPhanCong(maLt1, pmCode) {
  const nguoi = chuan(maLt1);
  if (!nguoi) return true;
  return khop(nguoi, pmCode);
}

/**
 * Cộng số UR mỗi người đã làm trên đúng phân hệ (menu_id hoặc bar) của UR này.
 * @returns {Map<string, {soUr: number, theo: string}>}
 */
function kinhNghiemTheoMenu(u, lichSuMenu = []) {
  const out = new Map();
  for (const row of lichSuMenu) {
    const nguoi = chuan(row.ma_lt1);
    if (!nguoi) continue;

    const theo = khopPhanHe(row, u);
    if (!theo) continue;

    const cu = out.get(nguoi) ?? { soUr: 0, theo };
    cu.soUr += Number(row.so_ur) || 0;
    if (theo === 'menu_id') cu.theo = 'menu_id'; // menu_id luôn thắng nếu có ở dòng nào đó
    out.set(nguoi, cu);
  }
  return out;
}

/**
 * Cộng đóng góp UR đầu vào liên quan — khớp theo phân hệ (menu_id/bar) của UR, hoặc theo
 * tên nguồn dữ liệu đã khai ở `luongDuLieu.nguon`.
 * @returns {Map<string, {soUr: number, nguon: string[]}>}
 */
function dongGopDauVaoLienQuan(u, dongGopDauVao = []) {
  const nguonUr = (u.luongDuLieu?.nguon ?? []).map((n) => chuan(n).toLowerCase());
  const out = new Map();

  for (const row of dongGopDauVao) {
    const nguoi = chuan(row.ma_lt1);
    if (!nguoi) continue;

    const khoa = chuan(row.nguon);
    // `row.nguon` mang giá trị của một khoá duy nhất (menu_id thường gặp nhất) — thử khớp
    // theo phân hệ trước (đối xứng với tiêu chí 1), rồi mới tới danh sách nguồn khai tay.
    const trung = khopPhanHe({ menu_id: row.nguon, bar: row.bar }, u)
      || nguonUr.includes(khoa.toLowerCase());
    if (!trung) continue;

    const cu = out.get(nguoi) ?? { soUr: 0, nguon: [] };
    cu.soUr += Number(row.so_ur) || 0;
    if (khoa && !cu.nguon.includes(khoa)) cu.nguon.push(khoa);
    out.set(nguoi, cu);
  }
  return out;
}

/** Tải hiện tại theo người. */
function taiTrongTheoNguoi(taiTrong = []) {
  const out = new Map();
  for (const row of taiTrong) {
    const nguoi = chuan(row.ma_lt1);
    if (!nguoi) continue;
    out.set(nguoi, {
      toiHan: Number(row.so_ur_toi_han) || 0,
      dangMo: Number(row.so_ur_dang_mo) || 0,
    });
  }
  return out;
}

/**
 * Gợi ý người tiếp nhận cho MỘT ur.
 * @param {Object} u - UR (cần menu_id, nên có `bar`; sysid/noi_dung/luongDuLieu tuỳ chọn).
 *   `bar` = tên phân hệ hiển thị (tra từ `wcommand.bar` trên CHÍNH DB sys của dự án đó) —
 *   dùng để phân biệt các UR dùng chung controller nhưng khác nghiệp vụ (xem khopPhanHe()).
 * @param {Object} nhanSu - { ungVien[], lichSuMenu[], taiTrong[], dongGopDauVao[] }
 * @param {Object} [trongSo]
 * @param {string} [pmCode] - Mã PM — LUÔN được thêm vào tập ứng viên, xem lý do bên dưới.
 * @returns {{ungVien: Array, laBaoCaoDauRa: boolean, nhanDienTu: string, thieuDuLieu: string[]}}
 */
export function goiYNguoiTiepNhan(u, nhanSu = {}, trongSo = {}, pmCode = '') {
  const w = { ...TRONG_SO_MAC_DINH, ...trongSo };
  const { laDauRa, nguon: nhanDienTu } = nhanDienBaoCaoDauRa(u);

  const kinhNghiem = kinhNghiemTheoMenu(u, nhanSu.lichSuMenu);
  const tai = taiTrongTheoNguoi(nhanSu.taiTrong);
  const dauVao = laDauRa ? dongGopDauVaoLienQuan(u, nhanSu.dongGopDauVao) : new Map();

  // Tập ứng viên: danh sách khai tường minh, hoặc suy từ chính các dữ kiện đã có.
  const khaiTuongMinh = (nhanSu.ungVien ?? []).map((v) => chuan(typeof v === 'string' ? v : v.ma_nv)).filter(Boolean);
  const tuDuLieu = [...new Set([...kinhNghiem.keys(), ...dauVao.keys(), ...tai.keys()])];

  // PM cũng là nhân viên — LUÔN có mặt trong tập ứng viên, bất kể danh sách khai tường minh
  // (thường lấy từ roster nhân sự lọc theo chức vụ) có bắt đúng PM hay không. Roster lọc
  // `ma_chv = 'NV'` có thể loại PM ra nếu chức vụ HR của PM không ghi đúng là 'NV' — không để
  // một cột chức vụ ở hệ thống KHÁC âm thầm xoá PM khỏi danh sách được xét ở đây.
  const pm = chuan(pmCode);
  const tenUngVien = [...new Set([
    ...(khaiTuongMinh.length ? khaiTuongMinh : tuDuLieu),
    ...(pm ? [pm] : []),
  ])];

  const thieuDuLieu = [];
  if (!nhanSu.lichSuMenu?.length) thieuDuLieu.push('lichSuMenu (tiêu chí 1 — kinh nghiệm menu)');
  if (!nhanSu.taiTrong?.length) thieuDuLieu.push('taiTrong (tiêu chí 2 — tải sắp tới hạn)');
  if (laDauRa && !nhanSu.dongGopDauVao?.length) thieuDuLieu.push('dongGopDauVao (tiêu chí 3 — báo cáo đầu ra)');

  const ungVien = tenUngVien.map((nguoi) => {
    const kn = kinhNghiem.get(nguoi);
    const dv = dauVao.get(nguoi);
    const t = tai.get(nguoi) ?? { toiHan: 0, dangMo: 0 };

    const diemMenu = kn ? Math.min(kn.soUr / w.baoHoaSoUr, 1) * w.diemMenu : 0;
    const diemDauVao = dv ? Math.min(dv.soUr / w.baoHoaSoUr, 1) * w.diemDauVao : 0;
    const phat = Math.min(t.toiHan * w.phatMoiUrToiHan, w.phatToiDa);
    const diem = Math.round((diemMenu + diemDauVao - phat) * 10) / 10;

    const lyDo = [];
    if (kn) lyDo.push(`đã làm ${kn.soUr} UR cùng ${kn.theo === 'menu_id' ? 'menu' : 'phân hệ (bar)'} trong dự án`);
    if (dv) lyDo.push(`đóng góp ${dv.soUr} UR đầu vào liên quan (${dv.nguon.join(', ')})`);
    lyDo.push(t.toiHan ? `đang gánh ${t.toiHan} UR sắp tới hạn` : 'không có UR nào sắp tới hạn');
    if (t.dangMo) lyDo.push(`${t.dangMo} UR đang mở`);

    // Độ tin cậy đo bằng LOẠI bằng chứng, không phải bằng điểm — điểm cao nhờ mỗi
    // "đang rảnh" thì vẫn là phỏng đoán yếu.
    const doTinCay = kn ? 'cao' : dv ? 'trung-binh' : 'thap';

    return {
      ma_lt1: nguoi,
      diem,
      doTinCay,
      lyDo,
      chiTiet: {
        diemMenu: Math.round(diemMenu * 10) / 10,
        diemDauVao: Math.round(diemDauVao * 10) / 10,
        phatTaiTrong: -phat,
        soUrCungMenu: kn?.soUr ?? 0,
        soUrDauVao: dv?.soUr ?? 0,
        soUrToiHan: t.toiHan,
        soUrDangMo: t.dangMo,
      },
    };
  });

  ungVien.sort((a, b) =>
    b.diem - a.diem ||
    a.chiTiet.soUrToiHan - b.chiTiet.soUrToiHan ||
    a.ma_lt1.localeCompare(b.ma_lt1));

  return {
    ungVien: ungVien.slice(0, w.soGoiY),
    laBaoCaoDauRa: laDauRa,
    nhanDienTu,
    thieuDuLieu,
  };
}

/**
 * Lọc ra UR cần gợi ý (DD và chưa phân công thật sự) rồi chấm điểm từng cái.
 * @param {Array} urs
 * @param {Object} nhanSu
 * @param {Object} [trongSo]
 * @param {string} [pmCode] - Mã PM; `ma_lt1` bằng mã này là mặc định BA, coi như chưa giao
 * @returns {Array<{ur: Object, goiY: Object}>}
 */
export function goiYPhanCong(urs = [], nhanSu = {}, trongSo = {}, pmCode = '') {
  return urs
    .filter((u) => chuan(u.trang_thai) === 'DD' && laChuaPhanCong(u.ma_lt1, pmCode))
    .map((u) => ({ ur: u, goiY: goiYNguoiTiepNhan(u, nhanSu, trongSo, pmCode) }));
}
