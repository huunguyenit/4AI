#!/usr/bin/env node
// test-assignee.mjs — Test gợi ý người tiếp nhận UR ở DD chưa có ma_lt1.

import { goiYNguoiTiepNhan, goiYPhanCong, nhanDienBaoCaoDauRa } from '../tools/lib/assignee.mjs';
import { validatePayload, renderReport } from '../tools/lib/report.mjs';
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
ok('Thẻ tóm tắt đếm DD chưa giao', html.includes('DD chưa giao lập trình'));
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

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures === 0 ? 'TẤT CẢ PASS' : 'CÓ LỖI'} (${failures} thất bại) ===\n`);
process.exit(failures === 0 ? 0 : 1);
