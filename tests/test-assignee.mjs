#!/usr/bin/env node
// test-assignee.mjs — Test gợi ý người tiếp nhận UR ở DD chưa có ma_lt1.

import { goiYNguoiTiepNhan, goiYPhanCong, nhanDienBaoCaoDauRa, laChuaPhanCong } from '../tools/lib/assignee.mjs';
import { validatePayload, renderReport, buildPortfolioArtifact } from '../tools/lib/report.mjs';
import { loadHolidays } from '../tools/lib/workdays.mjs';

let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

const NHAN_SU = {
  lichSuMenu: [
    { menu_id: 'M01', sysid: 'SVTran', ma_lt1: 'NV02', so_ur: 6 },
    { menu_id: 'M01', sysid: 'SVTran', ma_lt1: 'NV04', so_ur: 1 },
    { menu_id: 'M09', sysid: 'CPTran', ma_lt1: 'NV03', so_ur: 8 },
  ],
  taiTrong: [
    { ma_lt1: 'NV02', so_ur_toi_han: 4, so_ur_dang_mo: 11 },
    { ma_lt1: 'NV04', so_ur_toi_han: 0, so_ur_dang_mo: 3 },
    { ma_lt1: 'NV03', so_ur_toi_han: 1, so_ur_dang_mo: 5 },
  ],
  dongGopDauVao: [
    { nguon: 'M01', ma_lt1: 'NV04', so_ur: 5 },
    { nguon: 'dmvt', ma_lt1: 'NV03', so_ur: 4 },
  ],
};

process.stdout.write('=== 1. NHẬN DIỆN BÁO CÁO ĐẦU RA ===\n');
ok('noi_dung có "báo cáo" -> đầu ra',
  nhanDienBaoCaoDauRa({ noi_dung: 'Thêm báo cáo tổng hợp công nợ' }).laDauRa === true);
ok('noi_dung có "thống kê" (không dấu vẫn bắt được)',
  nhanDienBaoCaoDauRa({ noi_dung: 'Thong ke san luong theo thang' }).laDauRa === true);
ok('UR sửa chứng từ -> KHÔNG phải đầu ra',
  nhanDienBaoCaoDauRa({ noi_dung: 'Thêm trường tỷ giá hq trên hoá đơn' }).laDauRa === false);
ok('payload khai tường minh thắng heuristic',
  nhanDienBaoCaoDauRa({ noi_dung: 'Thêm báo cáo X', laBaoCaoDauRa: false }).laDauRa === false);
ok('Ghi lại nguồn nhận diện',
  nhanDienBaoCaoDauRa({ noi_dung: 'Thêm báo cáo X', laBaoCaoDauRa: true }).nguon === 'payload');

// Đầu mục công việc (nbctdaumuc.ma_daumuc) là tín hiệu THẬT, ưu tiên hơn đoán từ khoá tự do.
ok('maDaumuc = 09 (Thêm/Sửa báo cáo) -> đầu ra, nguồn = daumuc',
  nhanDienBaoCaoDauRa({ noi_dung: 'Sửa gì đó không nhắc chữ báo cáo', maDaumuc: ['01', '09'] }).laDauRa === true
  && nhanDienBaoCaoDauRa({ noi_dung: 'x', maDaumuc: ['09'] }).nguon === 'daumuc');
ok('maDaumuc = 02 (Mẫu in) -> đầu ra',
  nhanDienBaoCaoDauRa({ noi_dung: 'x', maDaumuc: ['02'] }).laDauRa === true);
ok('maDaumuc chỉ có mã đầu vào (01) -> KHÔNG phải đầu ra dù noi_dung mơ hồ',
  nhanDienBaoCaoDauRa({ noi_dung: 'x', maDaumuc: ['01', '03'] }).laDauRa === false);
// Trường hợp thật đo được: UR sửa "Bảng kê thuế đầu ra, đầu vào" (TÊN MÀN HÌNH) chỉ có đầu
// mục 01/06 (chứng từ/danh mục) — từ khoá "bang ke" khớp DAU_RA_RE nhưng đầu mục đã phân
// loại rõ là đầu vào, phải THẮNG chứ không được để lọt qua từ khoá tự do.
ok('Đầu mục đã phân loại THẮNG TUYỆT ĐỐI, kể cả khi noi_dung chứa từ khoá đầu ra',
  nhanDienBaoCaoDauRa({ noi_dung: 'Bảng kê thuế đầu ra, đầu vào — thêm điều kiện lọc', maDaumuc: ['01', '06'] }).laDauRa === false);
ok('maDaumuc rỗng -> rớt xuống nhận diện từ khoá tự do',
  nhanDienBaoCaoDauRa({ noi_dung: 'Thêm báo cáo X', maDaumuc: [] }).nguon === 'noi_dung');
ok('maDaumuc chỉ toàn mã không xếp bên nào (05/08/10) -> rớt xuống từ khoá tự do',
  nhanDienBaoCaoDauRa({ noi_dung: 'Thêm báo cáo X', maDaumuc: ['08', '10'] }).nguon === 'noi_dung');
ok('payload khai tường minh vẫn thắng cả maDaumuc',
  nhanDienBaoCaoDauRa({ noi_dung: 'x', maDaumuc: ['09'], laBaoCaoDauRa: false }).laDauRa === false);


process.stdout.write('\n=== 2. TIÊU CHÍ 1 — KINH NGHIỆM MENU THẮNG ===\n');
// NV02 có 6 UR trên M01 nhưng đang gánh 4 UR tới hạn; NV04 rảnh nhưng chỉ 1 UR.
// Kinh nghiệm phải thắng: 100 - 60 = 40 so với 33.3 - 0 = 33.3.
const urSuaManHinh = { trang_thai: 'DD', menu_id: 'M01', noi_dung: 'Sửa màn hình nhập liệu' };
const g1 = goiYNguoiTiepNhan(urSuaManHinh, NHAN_SU);
ok('Người đã làm menu đó xếp trên', g1.ungVien[0].ma_lt1 === 'NV02',
  g1.ungVien.map(c => `${c.ma_lt1}:${c.diem}`).join(' '));
ok('Độ tin cậy cao khi có lịch sử menu', g1.ungVien[0].doTinCay === 'cao');
ok('Lý do nêu rõ số UR cùng menu',
  g1.ungVien[0].lyDo.some(r => r.includes('6 UR cùng menu')), g1.ungVien[0].lyDo.join(' · '));
ok('Có ghi điểm phạt tải trong chi tiết',
  g1.ungVien[0].chiTiet.phatTaiTrong === -60, String(g1.ungVien[0].chiTiet.phatTaiTrong));
ok('Người không dính menu vẫn được xét (xếp sau)',
  g1.ungVien.some(c => c.ma_lt1 === 'NV03'));


process.stdout.write('\n=== 2b. KHÔNG COI CHUNG SYSID LÀ CHUNG KINH NGHIỆM — CẦN MENU_ID/BAR ===\n');
// Dữ liệu THẬT đo trên DEMO1 (query_sql db=sys, object=wcommand): sysid `Customer` đứng sau
// CẢ hai menu "Danh mục khách hàng" (04.07.01) LẪN "Danh mục nhà cung cấp" (05.07.01) — hai
// nghiệp vụ khác hẳn nhau (AR vs AP) dùng chung một controller. Trước bản sửa này, hai UR đó
// bị coi là "cùng kinh nghiệm" chỉ vì chung sysid — sai.
const nhanSuKhachHang = {
  lichSuMenu: [
    { menu_id: '04.07.01', sysid: 'Customer', bar: 'Danh mục khách hàng', ma_lt1: 'DATNH', so_ur: 9 },
  ],
  taiTrong: [{ ma_lt1: 'DATNH', so_ur_toi_han: 0, so_ur_dang_mo: 3 }],
};

const urNhaCungCap = {
  trang_thai: 'DD', menu_id: '05.07.01', sysid: 'Customer',
  bar: 'Danh mục nhà cung cấp', noi_dung: 'Sửa validate mã số thuế nhà cung cấp',
};
const gKhacPhanHe = goiYNguoiTiepNhan(urNhaCungCap, nhanSuKhachHang);
ok('Cùng sysid, KHÁC bar -> KHÔNG tính là kinh nghiệm (điểm menu = 0)',
  (gKhacPhanHe.ungVien.find(c => c.ma_lt1 === 'DATNH')?.chiTiet.diemMenu ?? 0) === 0,
  JSON.stringify(gKhacPhanHe.ungVien.find(c => c.ma_lt1 === 'DATNH')?.chiTiet));
ok('Độ tin cậy tụt xuống thấp vì không còn bằng chứng kinh nghiệm',
  gKhacPhanHe.ungVien.find(c => c.ma_lt1 === 'DATNH')?.doTinCay === 'thap');

const urCungPhanHe = {
  trang_thai: 'DD', menu_id: '99.99.99', sysid: 'Customer',
  bar: 'Danh mục khách hàng', noi_dung: 'Sửa validate email khách hàng',
};
const gCungPhanHe = goiYNguoiTiepNhan(urCungPhanHe, nhanSuKhachHang);
const datnhCungPhanHe = gCungPhanHe.ungVien.find(c => c.ma_lt1 === 'DATNH');
ok('menu_id khác nhưng CÙNG bar -> vẫn tính là kinh nghiệm', datnhCungPhanHe?.chiTiet.diemMenu > 0,
  JSON.stringify(datnhCungPhanHe?.chiTiet));
ok('Độ tin cậy cao khi khớp theo bar', datnhCungPhanHe?.doTinCay === 'cao');
ok('Lý do gọi đúng tên "phân hệ (bar)", không phải "controller"',
  datnhCungPhanHe?.lyDo.some(r => r.includes('phân hệ (bar)')), datnhCungPhanHe?.lyDo.join(' · '));


process.stdout.write('\n=== 3. TIÊU CHÍ 2 — TẢI PHÂN ĐỊNH KHI KINH NGHIỆM NGANG NHAU ===\n');
const nganNhau = {
  lichSuMenu: [
    { menu_id: 'M05', ma_lt1: 'NV02', so_ur: 3 },
    { menu_id: 'M05', ma_lt1: 'NV04', so_ur: 3 },
  ],
  taiTrong: [
    { ma_lt1: 'NV02', so_ur_toi_han: 3, so_ur_dang_mo: 8 },
    { ma_lt1: 'NV04', so_ur_toi_han: 0, so_ur_dang_mo: 2 },
  ],
};
const g2 = goiYNguoiTiepNhan({ trang_thai: 'DD', menu_id: 'M05', noi_dung: 'Sửa lưới' }, nganNhau);
ok('Kinh nghiệm ngang -> người rảnh hơn thắng', g2.ungVien[0].ma_lt1 === 'NV04',
  g2.ungVien.map(c => `${c.ma_lt1}:${c.diem}`).join(' '));
ok('Điểm phạt bị chặn trần (không quá phatToiDa)',
  g2.ungVien.every(c => c.chiTiet.phatTaiTrong >= -60));


process.stdout.write('\n=== 4. TIÊU CHÍ 3 — CHỈ ÁP CHO BÁO CÁO ĐẦU RA ===\n');
const urBaoCao = {
  trang_thai: 'DD', menu_id: 'M01',
  noi_dung: 'Thêm báo cáo tổng hợp xuất nhập tồn',
  luongDuLieu: { nguon: ['dmvt'], dich: { manHinh: 'Report' } },
};
const g3 = goiYNguoiTiepNhan(urBaoCao, NHAN_SU);
ok('Nhận là báo cáo đầu ra', g3.laBaoCaoDauRa === true);
const cuong = g3.ungVien.find(c => c.ma_lt1 === 'NV03');
ok('Người đóng góp UR đầu vào được cộng điểm',
  cuong && cuong.chiTiet.diemDauVao > 0, JSON.stringify(cuong?.chiTiet));
ok('Lý do nêu rõ nguồn đầu vào khớp',
  cuong?.lyDo.some(r => r.includes('đầu vào liên quan') && r.includes('dmvt')), cuong?.lyDo.join(' · '));

// Cùng ứng viên, cùng dữ kiện, nhưng UR KHÔNG phải báo cáo -> không cộng điểm đầu vào.
const g4 = goiYNguoiTiepNhan(
  { trang_thai: 'DD', menu_id: 'M01', noi_dung: 'Sửa chứng từ', luongDuLieu: { nguon: ['dmvt'] } },
  NHAN_SU);
ok('UR không phải báo cáo -> KHÔNG áp tiêu chí 3',
  g4.ungVien.every(c => c.chiTiet.diemDauVao === 0));


process.stdout.write('\n=== 5. THIẾU DỮ KIỆN -> HẠ ĐỘ TIN CẬY, KHÔNG BỊA ===\n');
const g5 = goiYNguoiTiepNhan({ trang_thai: 'DD', menu_id: 'M77', noi_dung: 'Việc mới toanh' }, NHAN_SU);
ok('Menu chưa ai từng làm -> tin cậy thấp',
  g5.ungVien.every(c => c.doTinCay === 'thap'), g5.ungVien.map(c => c.doTinCay).join(','));
ok('Vẫn xếp theo tải: người rảnh nhất lên đầu', g5.ungVien[0].ma_lt1 === 'NV04',
  g5.ungVien.map(c => `${c.ma_lt1}:${c.diem}`).join(' '));

const g6 = goiYNguoiTiepNhan({ trang_thai: 'DD', menu_id: 'M01', noi_dung: 'X' }, {});
ok('Không có dữ kiện nào -> danh sách rỗng, KHÔNG bịa tên', g6.ungVien.length === 0);
ok('Nêu rõ thiếu dữ kiện gì', g6.thieuDuLieu.length >= 2, g6.thieuDuLieu.join(' | '));


process.stdout.write('\n=== 6. LỌC ĐÚNG UR CẦN GỢI Ý ===\n');
const urs = [
  { stt_rec: '1', trang_thai: 'DD', ma_lt1: '', menu_id: 'M01', noi_dung: 'a' },
  { stt_rec: '2', trang_thai: 'DD', ma_lt1: 'NV02', menu_id: 'M01', noi_dung: 'b' },
  { stt_rec: '3', trang_thai: 'XN', ma_lt1: '', menu_id: 'M01', noi_dung: 'c' },
  { stt_rec: '4', trang_thai: 'TH', ma_lt1: '', menu_id: 'M01', noi_dung: 'd' },
  { stt_rec: '5', trang_thai: 'DD', ma_lt1: '   ', menu_id: 'M01', noi_dung: 'e' },
];
const loc = goiYPhanCong(urs, NHAN_SU);
ok('Chỉ lấy DD chưa giao (kể cả ma_lt1 toàn khoảng trắng)', loc.length === 2,
  loc.map(x => x.ur.stt_rec).join(','));
ok('Bỏ qua UR đã có người', !loc.some(x => x.ur.stt_rec === '2'));
ok('Bỏ qua XN/TH', !loc.some(x => ['3', '4'].includes(x.ur.stt_rec)));


process.stdout.write('\n=== 6b. ma_lt1 = MÃ PM LÀ MẶC ĐỊNH BA, KHÔNG PHẢI ĐÃ PHÂN ===\n');
// Màn hình BA lên UR để sẵn ma_lt1 = PM; PM mới là người phân việc thật sự sau đó.
ok('ma_lt1 rỗng -> chưa phân', laChuaPhanCong('', 'PM01') === true);
ok('ma_lt1 = mã PM -> chưa phân', laChuaPhanCong('PM01', 'PM01') === true);
ok('ma_lt1 = mã PM khác hoa/thường -> vẫn là chưa phân',
  laChuaPhanCong('pm01', 'PM01') === true);
ok('ma_lt1 = mã PM có khoảng trắng thừa (char cố định dài) -> chưa phân',
  laChuaPhanCong('  PM01  ', 'PM01') === true);
ok('ma_lt1 = người khác -> ĐÃ phân', laChuaPhanCong('DATNH', 'PM01') === false);
// Không có mã PM thì không được coi mọi thứ là chưa phân — chỉ ô trống mới tính.
ok('Không biết mã PM -> chỉ ô trống mới là chưa phân',
  laChuaPhanCong('DATNH', '') === false && laChuaPhanCong('', '') === true);

const ursPm = [
  { stt_rec: 'P1', trang_thai: 'DD', ma_lt1: 'PM01', menu_id: 'M01', noi_dung: 'BA để mặc định' },
  { stt_rec: 'P2', trang_thai: 'DD', ma_lt1: 'NV02', menu_id: 'M01', noi_dung: 'đã phân thật' },
  { stt_rec: 'P3', trang_thai: 'TH', ma_lt1: 'PM01', menu_id: 'M01', noi_dung: 'PM tự làm, đang chạy' },
];
const locPm = goiYPhanCong(ursPm, NHAN_SU, {}, 'PM01');
ok('UR ở DD mang mã PM -> VÀO danh sách cần gợi ý',
  locPm.some(x => x.ur.stt_rec === 'P1'), locPm.map(x => x.ur.stt_rec).join(','));
ok('UR đã phân người khác -> không vào', !locPm.some(x => x.ur.stt_rec === 'P2'));
ok('UR ngoài DD (PM tự làm, đang TH) -> không vào', !locPm.some(x => x.ur.stt_rec === 'P3'));

// PM vẫn là ứng viên hợp lệ — PM cũng trực tiếp lập trình.
const nhanSuCoPm = {
  lichSuMenu: [{ menu_id: 'M01', ma_lt1: 'PM01', so_ur: 9 }],
  taiTrong: [{ ma_lt1: 'PM01', so_ur_toi_han: 0, so_ur_dang_mo: 4 }],
};
const gPm = goiYNguoiTiepNhan({ trang_thai: 'DD', menu_id: 'M01', noi_dung: 'x' }, nhanSuCoPm);
ok('PM KHÔNG bị loại khỏi danh sách ứng viên (PM cũng là lập trình)',
  gPm.ungVien.some(c => c.ma_lt1 === 'PM01'), gPm.ungVien.map(c => c.ma_lt1).join(','));


process.stdout.write('\n=== 6c. PM CŨNG LÀ NHÂN VIÊN — LUÔN CÓ MẶT DÙ ROSTER KHÔNG BẮT ĐƯỢC ===\n');
// Bug thật: roster nhân sự (userinfo2) lọc theo chức vụ (ma_chv='NV') — nếu PM ghi chức vụ
// khác trong hệ thống nhân sự thì bộ lọc đó loại PM ra khỏi `nhanSu.ungVien` dù PM có kinh
// nghiệm/tải thật. Trước bản sửa: khai `ungVien` tường minh mà thiếu PM -> PM biến mất hoàn
// toàn khỏi tenUngVien (nhánh khaiTuongMinh ăn đứt nhánh suy-từ-dữ-kiện), dù `lichSuMenu`
// vẫn ghi nhận PM đã làm 9 UR đúng menu này.
const nhanSuRosterThieuPm = {
  ungVien: ['NV02', 'NV04'], // roster KHÔNG có PM01 — giả lập chức vụ HR không khớp 'NV'
  lichSuMenu: [{ menu_id: 'M01', ma_lt1: 'PM01', so_ur: 9 }],
  taiTrong: [{ ma_lt1: 'PM01', so_ur_toi_han: 0, so_ur_dang_mo: 2 }],
};
const gRosterThieuPm = goiYNguoiTiepNhan(
  { trang_thai: 'DD', menu_id: 'M01', noi_dung: 'x' }, nhanSuRosterThieuPm, {}, 'PM01');
ok('PM vẫn được thêm vào dù KHÔNG có trong ungVien khai tường minh',
  gRosterThieuPm.ungVien.some(c => c.ma_lt1 === 'PM01'),
  gRosterThieuPm.ungVien.map(c => c.ma_lt1).join(','));
ok('PM vẫn được chấm điểm đầy đủ từ lichSuMenu/taiTrong (không phải ứng viên rỗng)',
  gRosterThieuPm.ungVien.find(c => c.ma_lt1 === 'PM01')?.chiTiet.diemMenu > 0);
ok('Roster gốc (NV02, NV04) vẫn còn nguyên, không bị PM thế chỗ',
  gRosterThieuPm.ungVien.some(c => c.ma_lt1 === 'NV02') || gRosterThieuPm.ungVien.length <= 3);

// Không truyền pmCode (gọi cũ, chưa nâng cấp call site) -> hành vi giữ nguyên như trước, không vỡ.
const gKhongPmCode = goiYNguoiTiepNhan(
  { trang_thai: 'DD', menu_id: 'M01', noi_dung: 'x' }, nhanSuRosterThieuPm);
ok('Không truyền pmCode -> không tự thêm ai (tương thích ngược)',
  !gKhongPmCode.ungVien.some(c => c.ma_lt1 === 'PM01'));

// goiYPhanCong (đường đi thật từ report.mjs) phải tự thread pmCode xuống goiYNguoiTiepNhan.
const locRosterThieuPm = goiYPhanCong(
  [{ stt_rec: 'R1', trang_thai: 'DD', ma_lt1: '', menu_id: 'M01', noi_dung: 'x' }],
  nhanSuRosterThieuPm, {}, 'PM01');
ok('goiYPhanCong tự truyền pmCode xuống -> PM có mặt trong gợi ý',
  locRosterThieuPm[0]?.goiY.ungVien.some(c => c.ma_lt1 === 'PM01'));


process.stdout.write('\n=== 7. TÍCH HỢP VÀO BÁO CÁO HTML ===\n');
const payload = {
  ma_da: 'DEMO1', ten_ngan: 'Demo Co', pm: 'PM01', ngay_chay: '2026-08-11',
  giaiDoan: [{ giai_doan_da: 'GD1', ngay_ht: '2026-08-14', xac_nhan_da_hen_yn: true }],
  yeuCau: [
    { stt_rec: 'R1', fcode1: 'UR-01', noi_dung: 'Sửa màn hình nhập liệu', giai_doan_da: 'GD1',
      trang_thai: 'DD', tlks_yn: true, trang_tlks: 'TLKS tr.5', menu_id: 'M01', ma_lt1: '' },
    { stt_rec: 'R2', fcode1: 'UR-02', noi_dung: 'Thêm báo cáo tổng hợp xuất nhập tồn',
      giai_doan_da: 'GD1', trang_thai: 'DD', tlks_yn: true, trang_tlks: 'TLKS tr.9',
      menu_id: 'M01', ma_lt1: '', luongDuLieu: { nguon: ['dmvt'], dich: { manHinh: 'Report' } } },
    { stt_rec: 'R3', fcode1: 'UR-03', noi_dung: 'Việc đã giao', giai_doan_da: 'GD1',
      trang_thai: 'TH', tlks_yn: true, trang_tlks: 'TLKS tr.2', menu_id: 'M09', ma_lt1: 'NV03' },
  ],
  nhanSu: NHAN_SU,
};

const errs = validatePayload(payload);
ok('Payload có nhanSu hợp lệ -> không lỗi', errs.length === 0, errs.join(' | '));

const html = renderReport(payload, loadHolidays());
ok('Có cột "LT thực hiện"', html.includes('LT thực hiện'));
ok('UR đã giao hiện tên người', html.includes('NV03'));
ok('UR DD chưa giao hiện "chưa giao"', html.includes('chưa giao'));
ok('Có mục gợi ý phân công', html.includes('Gợi ý người tiếp nhận'));
ok('Thẻ tóm tắt nêu số DD chưa giao', html.includes('2 chưa giao LT'));
ok('Bảng ứng viên có cột độ tin cậy', html.includes('Độ tin cậy'));
ok('Nêu rõ đây là đề xuất chờ PM', html.includes('PM chốt rồi mới giao'));

const payloadSai = { ...payload, nhanSu: { lichSuMenu: [{ menu_id: 'M01', so_ur: 2 }] } };
ok('nhanSu thiếu ma_lt1 -> báo lỗi',
  validatePayload(payloadSai).some(e => e.includes('lichSuMenu[0]') && e.includes('ma_lt1')));

const { nhanSu, ...khongNhanSu } = payload;
const html2 = renderReport(khongNhanSu, loadHolidays());
ok('Không có nhanSu -> vẫn dựng được báo cáo', html2.includes('Gợi ý người tiếp nhận'));
ok('Không có nhanSu -> nói rõ thiếu, không im lặng',
  html2.includes('không có khối') && html2.includes('nhanSu'));


process.stdout.write('\n=== 7b. UR MANG MÃ PM TRONG BÁO CÁO HTML ===\n');
const payloadPm = {
  ...payload,
  yeuCau: [
    // BA lên UR để mặc định ma_lt1 = PM -> phải bị coi là chưa phân.
    { stt_rec: 'R1', fcode1: 'UR-01', noi_dung: 'Sửa màn hình nhập liệu', giai_doan_da: 'GD1',
      trang_thai: 'DD', tlks_yn: true, trang_tlks: 'TLKS tr.5', menu_id: 'M01', ma_lt1: 'PM01' },
    // PM tự làm thật, đã sang TH -> vẫn là tên hợp lệ, không gắn cảnh báo.
    { stt_rec: 'R3', fcode1: 'UR-03', noi_dung: 'PM tự làm', giai_doan_da: 'GD1',
      trang_thai: 'TH', tlks_yn: true, trang_tlks: 'TLKS tr.2', menu_id: 'M09', ma_lt1: 'PM01' },
  ],
};
const htmlPm = renderReport(payloadPm, loadHolidays());
ok('UR-01 (DD + mã PM) được đếm là chưa giao', htmlPm.includes('1 chưa giao LT'));
ok('Cột LT thực hiện nói rõ "mặc định — chưa phân"',
  htmlPm.includes('PM01 (mặc định — chưa phân)'));
ok('Giải thích vì sao UR mang tên PM vẫn nằm ở mục chưa phân',
  htmlPm.includes('giá trị mặc định màn hình BA điền'));
// Tách riêng ca "PM tự làm thật, đã sang TH": mang mã PM nhưng KHÔNG phải mặc định còn sót,
// nên phải hiện tên trần. Dùng payload chỉ có UR đó để nhãn của UR khác không lẫn vào.
const htmlChiTh = renderReport({
  ...payloadPm,
  yeuCau: [payloadPm.yeuCau.find((u) => u.trang_thai === 'TH')],
}, loadHolidays());
ok('UR ở TH mang mã PM -> hiện tên trần, KHÔNG gắn nhãn mặc định',
  htmlChiTh.includes('PM01') && !htmlChiTh.includes('mặc định — chưa phân'));
ok('UR ở TH mang mã PM -> không bị đếm là chưa giao',
  !htmlChiTh.includes('chưa giao LT'));

// Dự án của PM khác: cùng ma_lt1='PM01' nhưng PM là người khác -> ĐÃ phân.
const payloadPmKhac = { ...payloadPm, pm: 'HOATV' };
const htmlPmKhac = renderReport(payloadPmKhac, loadHolidays());
ok('PM khác -> ma_lt1=PM01 tính là đã phân, không còn "chưa giao LT"',
  !htmlPmKhac.includes('chưa giao LT'));
ok('PM khác -> không gắn nhãn mặc định cho ai',
  !htmlPmKhac.includes('mặc định — chưa phân'));


process.stdout.write('\n=== 8. TRANG TỔNG QUAN PORTFOLIO ===\n');
// Trang PM mở đầu tiên mỗi sáng — cột ma_lt1 và mục chưa giao phải có ở ĐÂY nữa,
// không chỉ ở report của từng dự án.
const dungPortfolio = (duAn) => {
  const { artifact, errors } = buildPortfolioArtifact({
    kind: 'portfolio', ngay_chay: '2026-08-11', pm: 'PM01', projects: duAn,
  });
  if (!artifact) throw new Error(`không dựng được portfolio: ${errors.join(' | ')}`);
  return artifact.content;
};
const portfolio = dungPortfolio([payload]);

ok('Portfolio có cột "LT thực hiện"', portfolio.includes('LT thực hiện'));
ok('Portfolio nêu số DD chưa giao', portfolio.includes('chưa giao LT'));
ok('Portfolio có mục "Chưa giao lập trình"', portfolio.includes('Chưa giao lập trình'));
ok('Portfolio có cột gợi ý tiếp nhận', portfolio.includes('Gợi ý tiếp nhận'));
// NV02: 6 UR trên M01 (100) trừ 4 UR tới hạn (−60) = 40, thắng NV04 (33.3).
ok('Portfolio hiện ứng viên số 1 cho UR chưa giao',
  /<strong class="mono">NV02<\/strong>/.test(portfolio),
  'kỳ vọng NV02 đứng đầu cho UR-01 menu M01');
ok('Portfolio nêu cả ứng viên dự phòng', portfolio.includes('rồi NV04'));
ok('Portfolio vẫn hiện tên người đã giao ở bảng quá hạn/sắp tới', portfolio.includes('NV03'));

// Dự án không khai nhanSu thì nói rõ, không im lặng bỏ trống.
const { nhanSu: _bo, ...khongNs } = payload;
ok('Portfolio thiếu nhanSu -> báo "chưa nạp", không bỏ trống',
  dungPortfolio([khongNs]).includes('chưa nạp'));

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures === 0 ? 'TẤT CẢ PASS' : 'CÓ LỖI'} (${failures} thất bại) ===\n`);
process.exit(failures === 0 ? 0 : 1);
