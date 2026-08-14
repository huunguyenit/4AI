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

import { createHash } from 'node:crypto';
import { canonical } from './json.mjs';

/**
 * Mã 8 hex ổn định của một bộ trọng số — đổi trọng số (`data/qlda.json → review.phanCong`)
 * thì đổi mã, không cần một bảng version thủ công riêng. Gắn vào `RecommendationFeedback`
 * (xem skill `pm-recommendation-feedback`) lúc PM xác nhận, để trả lời "sao gợi ý hôm đó
 * khác hôm nay" khi trọng số đã đổi giữa hai lần chạy.
 */
export function policyVersion(trongSo) {
  return createHash('sha256').update(canonical(trongSo), 'utf8').digest('hex').slice(0, 8);
}

/** Trọng số mặc định. Ghi đè bằng data/qlda.json → review.phanCong. */
export const TRONG_SO_MAC_DINH = {
  diemHienVat: 100,       // tiêu chí 1 THẬT — kinh nghiệm trên đúng hiện vật (sysid)
  diemMenu: 100,          // tiêu chí 1 dự phòng — khi chưa rút được hiện vật
  diemDauVao: 60,         // tiêu chí 3 — chỉ áp cho báo cáo đầu ra
  phatMoiUrToiHan: 15,    // tiêu chí 2 — trừ mỗi UR sắp tới hạn đang gánh
  phatToiDa: 60,          // trần điểm phạt, để tải nặng không xoá sạch lợi thế kinh nghiệm
  baoHoaSoUr: 3,          // SÀN của mẫu số khi chấm kinh nghiệm — xem diemTuongDoi()
  soGoiY: 3,              // số ứng viên trả về mỗi UR
};

/**
 * Điểm kinh nghiệm chấm THEO TƯƠNG QUAN với người giỏi nhất của chính menu đó, không theo
 * một mốc tuyệt đối.
 *
 * Lý do: mốc tuyệt đối `baoHoaSoUr = 3` hợp với payload nhỏ khai tay, nhưng lịch sử thật của
 * một phòng lập trình đếm bằng hàng chục tới hàng trăm UR mỗi menu — đo trên dữ liệu thật của
 * menu 15.70.06 thì cả mười người trong roster đều vượt 3, ai cũng chạm trần, xếp hạng sập
 * thành hoà hết. Chia cho người dẫn đầu thì thang điểm luôn trải ra dù corpus to nhỏ thế nào.
 *
 * `baoHoaSoUr` vẫn giữ vai trò SÀN của mẫu số: người duy nhất từng làm menu đó đúng 1 lần
 * không được ăn trọn điểm chỉ vì không có ai để so.
 */
function diemTuongDoi(soUr, soUrCaoNhat, baoHoaSoUr) {
  const mau = Math.max(soUrCaoNhat, baoHoaSoUr);
  if (!(mau > 0)) return 0;
  return Math.min(soUr / mau, 1);
}

/** Bỏ dấu tiếng Việt để so khớp — cùng quy tắc với chỉ mục không dấu của FBO. */
export function boDau(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Từ khoá nhận diện UR là báo cáo đầu ra khi không có tín hiệu chắc chắn hơn. */
const DAU_RA_RE = /\b(bao cao|report|mau in|in ra|xuat file|xuat excel|thong ke|bang ke|so sach)\b/;

/**
 * Mã đầu mục công việc (`nbctdaumuc.ma_daumuc`, xem data/qlda.json → enums.dauMucLoai) phân
 * loại UR theo đúng quy tắc PM đặt ra: có chạm tới việc LƯU TRỮ dữ liệu không.
 *   01 Thêm/sửa chứng từ · 03 Kế thừa/lấy dữ liệu · 06 Thêm danh mục · 07 Import
 *     → ĐẦU VÀO: tạo mới/chỉnh sửa cái được GHI XUỐNG bảng.
 *   02 Mẫu in · 09 Thêm/sửa báo cáo
 *     → ĐẦU RA: hiển thị dữ liệu ĐÃ LƯU cho người dùng biết.
 * Mã 05 (mail), 08 (tính toán đặc thù), 10 (alter/dll hệ thống) cố tình KHÔNG xếp bên nào —
 * mơ hồ, không đủ chắc để tự kết luận, cứ để rơi xuống nhận diện từ khoá tự do bên dưới.
 *
 * Đây là tín hiệu THẬT trên dữ liệu (đo trên FSD: 30976/31660 dòng đầu mục có `ma_lt`), mạnh
 * hơn hẳn so với đoán qua từ khoá tự do — ưu tiên dùng khi UR có mang theo `maDaumuc`.
 */
export const MA_DAUMUC_DAU_VAO = new Set(['01', '03', '06', '07']);
export const MA_DAUMUC_DAU_RA = new Set(['02', '09']);

/**
 * UR này có phải báo cáo đầu ra không. Thứ tự ưu tiên: payload khai tường minh > đầu mục
 * công việc > từ khoá tự do trong nội dung.
 *
 * Đầu mục THẮNG TUYỆT ĐỐI khi có ít nhất một mã đã phân loại (đầu vào hoặc đầu ra) — kể cả
 * kết luận là "không phải đầu ra". Đây là phân loại do BA/PM ghi nhận thật trên `nbctdaumuc`,
 * đáng tin hơn một từ khoá xuất hiện tình cờ trong câu văn: một UR có đầu mục "01 Thêm/sửa
 * chứng từ" thôi vẫn có thể nhắc tới chữ "bảng kê" trong lúc mô tả nghiệp vụ (ví dụ: "Bảng kê
 * thuế đầu ra, đầu vào" là TÊN MÀN HÌNH đang sửa, không phải UR đó tạo báo cáo mới) — quy
 * tắc cũ (chỉ ưu tiên khi đầu mục nói CÓ) sẽ để lọt trường hợp này. Chỉ rớt xuống từ khoá tự
 * do khi UR CHƯA có đầu mục đã phân loại — ví dụ UR draft chưa lưu DB.
 *
 * @param {Object} u - cần `noi_dung`; `maDaumuc` (mảng mã đầu mục, xem MA_DAUMUC_DAU_VAO/RA)
 *   và `laBaoCaoDauRa` (boolean) tuỳ chọn.
 * @returns {{laDauRa: boolean, nguon: string}} nguon = 'payload' | 'daumuc' | 'noi_dung' | 'khong'
 */
export function nhanDienBaoCaoDauRa(u) {
  if (typeof u?.laBaoCaoDauRa === 'boolean') {
    return { laDauRa: u.laBaoCaoDauRa, nguon: 'payload' };
  }
  const maCodes = (u?.maDaumuc ?? []).map((m) => String(m ?? '').trim()).filter(Boolean);
  const coPhanLoai = maCodes.some((m) => MA_DAUMUC_DAU_VAO.has(m) || MA_DAUMUC_DAU_RA.has(m));
  if (coPhanLoai) {
    return { laDauRa: maCodes.some((m) => MA_DAUMUC_DAU_RA.has(m)), nguon: 'daumuc' };
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
 * Tách danh sách mã PM. Một dự án có thể có tới ba LTQL (`nbdmda.ma_lt1/2/3`) nên `payload.pm`
 * có thể là mảng, hoặc chuỗi `"A, B"` — so sánh nguyên chuỗi đó với một `ma_lt1` thì không
 * bao giờ khớp, và mọi UR mang tên PM sẽ lọt qua như đã phân việc.
 */
function danhSachPm(pm) {
  const raw = Array.isArray(pm) ? pm : String(pm ?? '').split(',');
  return raw.map(chuan).filter(Boolean);
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
 * @param {string|string[]} pmCode - Mã PM của dự án đang xét: một mã, mảng mã, hoặc chuỗi
 *   ngăn cách bằng dấu phẩy (dự án nhiều LTQL).
 */
export function laChuaPhanCong(maLt1, pmCode) {
  const nguoi = chuan(maLt1);
  if (!nguoi) return true;
  return danhSachPm(pmCode).some((pm) => khop(nguoi, pm));
}

/**
 * Khoá tra người: LUÔN lowercase.
 *
 * Bốn nguồn dữ kiện ở đây tới từ ba bảng khác nhau (`userinfo2.name`, `nbdmda.ma_lt1`,
 * `nbphyc.ma_lt1`) và cách viết hoa thường KHÔNG thống nhất giữa chúng — 'ThanhNM' cạnh
 * 'NV07' là dữ liệu thật. Tra Map theo chuỗi thô thì một người trượt thành hai, và cái
 * trượt đó im lặng: ứng viên chỉ đơn giản mất sạch điểm kinh nghiệm.
 */
const khoaNguoi = (v) => chuan(v).toLowerCase();

/**
 * Cộng số UR mỗi người đã làm trên đúng phân hệ (menu_id hoặc bar) của UR này.
 * @returns {Map<string, {soUr: number, theo: string, ma_lt1: string}>} khoá lowercase
 */
function kinhNghiemTheoMenu(u, lichSuMenu = []) {
  const out = new Map();
  for (const row of lichSuMenu) {
    const nguoi = chuan(row.ma_lt1);
    if (!nguoi) continue;

    const theo = khopPhanHe(row, u);
    if (!theo) continue;

    const khoa = khoaNguoi(nguoi);
    const cu = out.get(khoa) ?? { soUr: 0, theo, ma_lt1: nguoi };
    cu.soUr += Number(row.so_ur) || 0;
    if (theo === 'menu_id') cu.theo = 'menu_id'; // menu_id luôn thắng nếu có ở dòng nào đó
    out.set(khoa, cu);
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

    const nguon = chuan(row.nguon);
    // `row.nguon` mang giá trị của một khoá duy nhất (menu_id thường gặp nhất) — thử khớp
    // theo phân hệ trước (đối xứng với tiêu chí 1), rồi mới tới danh sách nguồn khai tay.
    const trung = khopPhanHe({ menu_id: row.nguon, bar: row.bar }, u)
      || nguonUr.includes(nguon.toLowerCase());
    if (!trung) continue;

    const khoa = khoaNguoi(nguoi);
    const cu = out.get(khoa) ?? { soUr: 0, nguon: [], ma_lt1: nguoi };
    cu.soUr += Number(row.so_ur) || 0;
    if (nguon && !cu.nguon.includes(nguon)) cu.nguon.push(nguon);
    out.set(khoa, cu);
  }
  return out;
}

/**
 * Kinh nghiệm trên ĐÚNG hiện vật mà UR này đụng tới — tiêu chí 1 thật sự.
 *
 * Thay cho phép đếm theo `menu_id`, vốn đo sai đơn vị: đo trên DVDKB_FBO, chỉ 1/25 giá trị
 * `menu_id` trong `nbphyc` tồn tại trong cây menu thật của chương trình đó. Một UR ghi
 * `menu_id = 07.00.00` (menu cha, không phân giải được) nhưng nội dung sửa 7 chứng từ cụ thể
 * thì kinh nghiệm nằm ở 7 chứng từ đó — xem experience-extract.mjs.
 *
 * `u.hienVat` là danh sách `sysid` đã rút từ nội dung UR. Ứng viên được tính theo SỐ UR đã làm
 * trên các hiện vật đó, và ghi lại phủ được bao nhiêu phần của yêu cầu.
 *
 * @param {Object} u - cần `hienVat: string[]`
 * @param {Array} kinhNghiemHienVat - [{ma_lt1, khoaHienVat, tenHienVat, so_ur}]
 * @returns {Map<string, {soUr: number, phu: Set<string>, ten: string[], ma_lt1: string}>}
 */
function kinhNghiemTheoHienVat(u, kinhNghiemHienVat = []) {
  const can = new Set((u?.hienVat ?? []).map((s) => chuan(s).toLowerCase()).filter(Boolean));
  const out = new Map();
  if (!can.size) return out;

  for (const row of kinhNghiemHienVat) {
    const nguoi = chuan(row.ma_lt1);
    const hv = chuan(row.khoaHienVat);
    if (!nguoi || !hv || !can.has(hv.toLowerCase())) continue;

    const khoa = khoaNguoi(nguoi);
    const cu = out.get(khoa) ?? { soUr: 0, phu: new Set(), ten: [], ma_lt1: nguoi };
    cu.soUr += Number(row.so_ur) || 0;
    cu.phu.add(hv);
    const ten = chuan(row.tenHienVat) || hv;
    if (!cu.ten.includes(ten)) cu.ten.push(ten);
    out.set(khoa, cu);
  }
  return out;
}

/** Tải hiện tại theo người. Khoá lowercase — xem khoaNguoi(). */
function taiTrongTheoNguoi(taiTrong = []) {
  const out = new Map();
  for (const row of taiTrong) {
    const nguoi = chuan(row.ma_lt1);
    if (!nguoi) continue;
    out.set(khoaNguoi(nguoi), {
      ma_lt1: nguoi,
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
  const hienVat = kinhNghiemTheoHienVat(u, nhanSu.kinhNghiemHienVat);
  const tai = taiTrongTheoNguoi(nhanSu.taiTrong);
  const dauVao = laDauRa ? dongGopDauVaoLienQuan(u, nhanSu.dongGopDauVao) : new Map();

  // Hiện vật và menu ĐO CÙNG MỘT THỨ ở hai độ chính xác khác nhau, nên chỉ dùng MỘT. Cộng cả
  // hai là đếm hai lần cùng một bằng chứng: người từng sửa `SVTran` trong UR mang menu_id
  // `07.10.06` sẽ vừa ăn điểm hiện vật vừa ăn điểm menu cho đúng một việc đã làm.
  // Ưu tiên hiện vật vì nó phân giải được về màn hình thật; menu chỉ là khoá gộp mờ.
  const dungHienVat = hienVat.size > 0;

  // Tập ứng viên: danh sách khai tường minh, hoặc suy từ chính các dữ kiện đã có.
  const khaiTuongMinh = (nhanSu.ungVien ?? []).map((v) => chuan(typeof v === 'string' ? v : v.ma_nv)).filter(Boolean);
  const tuDuLieu = [...new Map([...kinhNghiem, ...dauVao, ...tai]
    .map(([khoa, v]) => [khoa, v.ma_lt1])).values()];

  // Tên và cấp bậc chỉ để HIỂN THỊ — mã nhân viên vẫn là khoá duy nhất trong mọi phép so.
  const hoSo = new Map();
  for (const v of nhanSu.ungVien ?? []) {
    if (typeof v === 'string' || !chuan(v?.ma_nv)) continue;
    hoSo.set(khoaNguoi(v.ma_nv), { ten: chuan(v.ten) || undefined, ma_chv: chuan(v.ma_chv) || undefined });
  }
  const laPm = new Set((nhanSu.pm ?? []).map(khoaNguoi).filter(Boolean));

  // PM cũng là nhân viên — LUÔN có mặt trong tập ứng viên, bất kể danh sách khai tường minh
  // (thường lấy từ roster nhân sự lọc theo chức vụ) có bắt đúng PM hay không. Roster lọc
  // `ma_chv = 'NV'` có thể loại PM ra nếu chức vụ HR của PM không ghi đúng là 'NV' — không để
  // một cột chức vụ ở hệ thống KHÁC âm thầm xoá PM khỏi danh sách được xét ở đây.
  const pm = danhSachPm(pmCode);
  const tenUngVien = [...new Set([
    ...(khaiTuongMinh.length ? khaiTuongMinh : tuDuLieu),
    ...pm,
  ])];

  // Mốc so sánh của tiêu chí 1 và 3: người dẫn đầu TRONG TẬP ỨNG VIÊN, không phải trong toàn
  // bộ dữ kiện. Người đã rời phòng vẫn còn trong lịch sử menu — để họ đặt mốc thì cả phòng
  // bị chấm thấp vì so với một người không còn nhận việc được nữa.
  const trongTap = new Set(tenUngVien.map(khoaNguoi));
  const dinhKinhNghiem = Math.max(0,
    ...[...kinhNghiem].filter(([k]) => trongTap.has(k)).map(([, v]) => v.soUr));
  const dinhHienVat = Math.max(0,
    ...[...hienVat].filter(([k]) => trongTap.has(k)).map(([, v]) => v.soUr));
  const dinhDauVao = Math.max(0,
    ...[...dauVao].filter(([k]) => trongTap.has(k)).map(([, v]) => v.soUr));

  const soHienVatCan = (u?.hienVat ?? []).length;

  const thieuDuLieu = [];
  if (!soHienVatCan) {
    thieuDuLieu.push('hienVat của UR (chưa rút được hiện vật từ nội dung — rơi về đếm theo menu_id, '
      + 'vốn chỉ là khoá gộp mờ: đo trên dữ liệu thật chỉ 1/25 menu_id phân giải được về màn hình)');
  } else if (!nhanSu.kinhNghiemHienVat?.length) {
    thieuDuLieu.push('kinhNghiemHienVat (tiêu chí 1 — kinh nghiệm trên đúng hiện vật)');
  }
  if (!dungHienVat && !nhanSu.lichSuMenu?.length) thieuDuLieu.push('lichSuMenu (tiêu chí 1 dự phòng — kinh nghiệm menu)');
  if (!nhanSu.taiTrong?.length) thieuDuLieu.push('taiTrong (tiêu chí 2 — tải sắp tới hạn)');
  if (laDauRa && !nhanSu.dongGopDauVao?.length) thieuDuLieu.push('dongGopDauVao (tiêu chí 3 — báo cáo đầu ra)');

  const ungVien = tenUngVien.map((nguoi) => {
    const khoa = khoaNguoi(nguoi);
    const kn = kinhNghiem.get(khoa);
    const hv = hienVat.get(khoa);
    const dv = dauVao.get(khoa);
    const t = tai.get(khoa) ?? { toiHan: 0, dangMo: 0 };

    // Đúng MỘT trong hai nhánh được tính — xem chú thích ở `dungHienVat`.
    const diemHienVat = dungHienVat && hv
      ? diemTuongDoi(hv.soUr, dinhHienVat, w.baoHoaSoUr) * w.diemHienVat : 0;
    const diemMenu = !dungHienVat && kn
      ? diemTuongDoi(kn.soUr, dinhKinhNghiem, w.baoHoaSoUr) * w.diemMenu : 0;
    const diemDauVao = dv ? diemTuongDoi(dv.soUr, dinhDauVao, w.baoHoaSoUr) * w.diemDauVao : 0;
    const phat = Math.min(t.toiHan * w.phatMoiUrToiHan, w.phatToiDa);
    const diem = Math.round((diemHienVat + diemMenu + diemDauVao - phat) * 10) / 10;

    const lyDo = [];
    if (dungHienVat && hv) {
      const phu = soHienVatCan ? ` (phủ ${hv.phu.size}/${soHienVatCan} hiện vật của yêu cầu)` : '';
      lyDo.push(`đã làm ${hv.soUr} UR trên đúng ${hv.ten.slice(0, 3).join(', ')}${phu}`);
    } else if (kn) {
      lyDo.push(`đã làm ${kn.soUr} UR cùng ${kn.theo === 'menu_id' ? 'menu' : 'phân hệ (bar)'}`);
    }
    if (dv) lyDo.push(`đóng góp ${dv.soUr} UR đầu vào liên quan (${dv.nguon.join(', ')})`);
    lyDo.push(t.toiHan ? `đang gánh ${t.toiHan} UR sắp tới hạn` : 'không có UR nào sắp tới hạn');
    if (t.dangMo) lyDo.push(`${t.dangMo} UR đang mở`);

    // Độ tin cậy đo bằng LOẠI bằng chứng, không phải bằng điểm — điểm cao nhờ mỗi
    // "đang rảnh" thì vẫn là phỏng đoán yếu. Hiện vật là bằng chứng mạnh nhất vì nó phân giải
    // được về màn hình thật; menu chỉ là khoá gộp nên tụt xuống một bậc.
    const doTinCay = (dungHienVat && hv) ? 'cao' : kn ? 'trung-binh' : dv ? 'trung-binh' : 'thap';

    const hs = hoSo.get(khoa) ?? {};
    return {
      ma_lt1: nguoi,
      ten: hs.ten,
      ma_chv: hs.ma_chv,
      laPm: laPm.has(khoa),
      diem,
      doTinCay,
      lyDo,
      chiTiet: {
        diemHienVat: Math.round(diemHienVat * 10) / 10,
        diemMenu: Math.round(diemMenu * 10) / 10,
        diemDauVao: Math.round(diemDauVao * 10) / 10,
        phatTaiTrong: -phat,
        soUrTrenHienVat: hv?.soUr ?? 0,
        hienVatDaLam: hv ? [...hv.phu] : [],
        soHienVatCan,
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
    // Nói rõ điểm được chấm bằng bằng chứng nào — hai thang khác hẳn nhau về độ tin cậy,
    // đọc bảng xếp hạng mà không biết nó dựa trên cái gì thì dễ tin nhầm.
    chamTheo: dungHienVat ? 'hien-vat' : 'menu_id',
    thieuDuLieu,
    policyVersion: policyVersion(w),
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
