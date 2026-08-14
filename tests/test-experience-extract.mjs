#!/usr/bin/env node
// test-experience-extract.mjs — bước 4: nội dung UR → kinh nghiệm ở mức hiện vật.
//
// Ca chuẩn là UR THẬT A000571322YC1 (DVDKB_FBO, NV01): menu_id ghi `07.00.00` — một giá trị
// KHÔNG tồn tại trong cây menu của chính chương trình đó — nhưng nội dung liệt kê 7 chứng từ,
// và cả 7 tra `wcommand` theo TÊN đều ra đúng. Từ điển bên dưới chép nguyên từ dữ liệu thật.

import {
  buildTuDien, rutHienVat, rutHanhDong, toExperienceFacts, chuanHoaTen, sqlTuDien,
} from '../tools/lib/experience-extract.mjs';

let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

// Chép từ `wcommand` của DVDKB_FBO (query_sql db=sys) ngày 2026-08-14.
const WCOMMAND = [
  { menu_id: '06.01.04', bar: 'Hóa đơn bán hàng', sysid: 'SVTran', type: 'D' },
  { menu_id: '99.37.19', bar: 'Hóa đơn bán hàng', sysid: 'rptPrintSVTran', type: '' },
  { menu_id: '04.01.06', bar: 'Hóa đơn dịch vụ', sysid: 'ARTran', type: 'D' },
  { menu_id: '99.88.10', bar: 'Hóa đơn dịch vụ', sysid: 'rptPrintARTran', type: '' },
  { menu_id: '04.01.07', bar: 'Hóa đơn dịch vụ trả lại', sysid: 'GRTran', type: 'D' },
  { menu_id: '99.98.15', bar: 'Hóa đơn điều chỉnh giá hàng bán', sysid: 'SPTran', type: '' },
  { menu_id: '99.98.61', bar: 'Hóa đơn điều chỉnh giá dịch vụ', sysid: 'VATran', type: '' },
  { menu_id: '04.01.08', bar: 'Hóa đơn giảm giá hàng hóa - dịch vụ', sysid: 'SDTran', type: 'D' },
  { menu_id: '04.01.05', bar: 'Phiếu nhập hàng bán trả lại', sysid: 'SRTran', type: 'D' },
  { menu_id: '08.35.00', bar: 'Hóa đơn đầu vào', sysid: 'PVTran', type: 'D' },
  { menu_id: '01.01.04', bar: 'Danh mục tiền tệ', sysid: 'Currency', type: 'D' },
  { menu_id: '07.01.11', bar: 'Phiếu nhập mua hàng', sysid: 'PDTran', type: 'D' },
  // Tên quá ngắn — phải bị loại khỏi từ điển, không được đem đi dò trong văn xuôi.
  { menu_id: '02.00.00', bar: 'Kho', sysid: 'Warehouse', type: 'D' },
];

const tuDien = buildTuDien(WCOMMAND);

process.stdout.write('=== 1. TỪ ĐIỂN ===\n');
ok('SQL từ điển đọc wcommand, bỏ dòng phân cách và dòng không có sysid',
  sqlTuDien().includes('FROM wcommand')
  && sqlTuDien().includes("NOT IN ('', '-')")
  && sqlTuDien().includes("RTRIM(sysid) <> ''"));
ok('Tên quá ngắn bị loại (tránh khớp bừa trong văn xuôi)',
  !tuDien.has(chuanHoaTen('Kho')), [...tuDien.keys()].join(' · '));
ok('Cùng tên, ưu tiên màn hình nhập chứ không phải mẫu in',
  tuDien.get(chuanHoaTen('Hóa đơn bán hàng')).sysid === 'SVTran',
  tuDien.get(chuanHoaTen('Hóa đơn bán hàng')).sysid);
ok('Ghi lại chỗ nhập nhằng thay vì vứt im lặng',
  tuDien.get(chuanHoaTen('Hóa đơn bán hàng')).nhapNhang.includes('rptPrintSVTran'));

process.stdout.write('\n=== 2. CA THẬT A000571322YC1 — menu_id NÓI DỐI, NỘI DUNG NÓI THẬT ===\n');
const UR_THAT = {
  stt_rec: 'A000571322YC1', ma_da: 'DVDKB_FBO', ur_ma_lt1: 'NV01', trang_thai: 'HT',
  menu_id: '07.00.00', ngay_ht: '2026-07-30',
  noi_dung: [
    'Menu: Phải thu \\',
    '1. Hóa đơn bán hàng',
    '2. Hóa đơn dịch vụ',
    '3. Hóa đơn điều chỉnh giá hàng bán',
    '4. Hóa đơn điều chỉnh giá dịch vụ',
    '5. Hóa đơn giảm giá hàng hóa - dịch vụ',
    '6. Phiếu nhập hàng bán trả lại',
    '7. Hóa đơn dịch vụ trả lại',
    'Ở Tab Khác - Thêm trường Loại kê khai bao gồm:',
    '1 - Kê khai cùng kỳ ... 9 - Khác: không lên tờ khai',
  ].join('\n'),
};

const { hienVat, menuIdPhanGiaiDuoc } = rutHienVat(UR_THAT, tuDien);
const sysids = hienVat.map((h) => h.sysid).sort();

ok('menu_id 07.00.00 KHÔNG phân giải được — và hệ thống biết điều đó',
  menuIdPhanGiaiDuoc === false);
ok('Rút ra ĐÚNG 7 hiện vật từ nội dung', hienVat.length === 7, sysids.join(','));
ok('Đúng bảy controller thật, không cái nào là 07.00.00',
  sysids.join(',') === 'ARTran,GRTran,SDTran,SPTran,SRTran,SVTran,VATran', sysids.join(','));
ok('Không lẫn mẫu in vào (rptPrintSVTran)', !sysids.includes('rptPrintSVTran'));
ok('Không lôi thêm hiện vật không được nhắc tới',
  !sysids.includes('Currency') && !sysids.includes('PDTran'));
ok('Mọi hiện vật đều ghi nguồn là từ điển', hienVat.every((h) => h.nguon === 'tu-dien'));

process.stdout.write('\n=== 3. HÀNH ĐỘNG / VỊ TRÍ ===\n');
const hd = rutHanhDong(UR_THAT.noi_dung);
ok('Nhận ra là thêm trường', hd.hanhDong === 'them-truong', JSON.stringify(hd));
ok('Nhận ra vị trí là Tab Khác', /tab khac/.test(hd.viTri ?? ''), hd.viTri);
ok('"Ẩn trường ... bên tab đơn vị" ra đúng hành động ẩn',
  rutHanhDong('Ẩn trường Thông tin công nợ bên tab đơn vị').hanhDong === 'an-truong');
ok('"Sửa lỗi mẫu in Bảng kê phiếu xuất" ra sửa lỗi + vị trí mẫu in',
  rutHanhDong('Sửa lỗi mẫu in Bảng kê phiếu xuất (excel)').hanhDong === 'sua-loi'
  && rutHanhDong('Sửa lỗi mẫu in Bảng kê phiếu xuất (excel)').viTri === 'mẫu in');

process.stdout.write('\n=== 4. KHỚP DÀI TRƯỚC, KHÔNG CHỒNG LẤN ===\n');
// "Hóa đơn dịch vụ trả lại" chứa trọn "Hóa đơn dịch vụ" — tên dài phải thắng, và đoạn đã khớp
// không được đem khớp lại bằng tên ngắn hơn.
const chiTraLai = rutHienVat({ noi_dung: 'Sửa Hóa đơn dịch vụ trả lại theo yêu cầu' }, tuDien);
ok('Chỉ ra hiện vật dài, không đẻ thêm hiện vật ngắn nằm trong nó',
  chiTraLai.hienVat.map((h) => h.sysid).join(',') === 'GRTran',
  chiTraLai.hienVat.map((h) => h.sysid).join(','));

process.stdout.write('\n=== 5. menu_id CÓ PHÂN GIẢI ĐƯỢC THÌ VẪN DÙNG ===\n');
const coMenu = rutHienVat({ menu_id: '08.35.00', noi_dung: 'Chỉnh lại phần lọc' }, tuDien);
ok('menu_id khớp cây menu -> lấy được hiện vật, ghi nguồn là menu_id',
  coMenu.menuIdPhanGiaiDuoc === true
  && coMenu.hienVat[0].sysid === 'PVTran' && coMenu.hienVat[0].nguon === 'menu_id',
  JSON.stringify(coMenu.hienVat));
ok('menu_id không phân giải + nội dung không có tên -> KHÔNG bịa hiện vật',
  rutHienVat({ menu_id: '77.77.77', noi_dung: 'Nhờ LT hỗ trợ xem giúp' }, tuDien).hienVat.length === 0);

process.stdout.write('\n=== 6. RA NODE ExperienceFact ===\n');
const { nodes, edges, thongKe } = toExperienceFacts([UR_THAT], tuDien,
  { maDa: 'DVDKB_FBO', boi: 'PM01' });

ok('Một UR sinh BẢY node kinh nghiệm (không phải một)', nodes.length === 7, String(nodes.length));
ok('Node mang đúng người làm', nodes.every((n) => n.ma_lt1 === 'NV01'));
ok('scope = mã dự án', nodes.every((n) => n.scope === 'DVDKB_FBO'));
ok('Khoá gồm stt_rec + hiện vật, không đụng nhau',
  new Set(nodes.map((n) => n.id)).size === 7);
ok('Giữ trạng thái nguồn để truy lại vì sao được tính',
  nodes.every((n) => n.trangThaiNguon === 'HT'));
ok('Độ tin cậy < 1 và chưa PM duyệt',
  nodes.every((n) => n.doTinCay < 1 && n.duyetBoiPm === false));
ok('Có cạnh PRODUCED_EXPERIENCE nối về UR',
  edges.length === 7 && edges.every((e) => e.type === 'PRODUCED_EXPERIENCE' && e.from === 'Request:A000571322YC1'));
ok('Thống kê nêu rõ menu_id không phân giải được',
  thongKe.soUr === 1 && thongKe.soFact === 7 && thongKe.menuIdPhanGiaiDuoc === 0,
  JSON.stringify(thongKe));

process.stdout.write('\n=== 7. KHÔNG ĐỦ DỮ KIỆN -> KHÔNG SINH KINH NGHIỆM ===\n');
ok('UR không có người làm -> bỏ, không gán cho ai',
  toExperienceFacts([{ ...UR_THAT, ur_ma_lt1: '' }], tuDien, { maDa: 'X' }).nodes.length === 0);
const trong = toExperienceFacts(
  [{ stt_rec: 'U1', ur_ma_lt1: 'A', trang_thai: 'UP', noi_dung: 'Nhờ LT hỗ trợ' }], tuDien, { maDa: 'X' });
ok('Nội dung không nêu hiện vật nào -> đếm vào mục không rút được, không bịa',
  trong.nodes.length === 0 && trong.thongKe.urKhongRaHienVat === 1);
ok('Từ điển rỗng -> không sinh gì, không nổ',
  toExperienceFacts([UR_THAT], new Map(), { maDa: 'X' }).nodes.length === 0);

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures ? `${failures} thất bại` : 'TẤT CẢ PASS (0 thất bại)'} ===\n`);
process.exit(failures ? 1 : 0);
