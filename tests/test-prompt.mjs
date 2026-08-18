#!/usr/bin/env node
// test-prompt.mjs — promptCuaUr() (tools/lib/prompt.mjs) và render mục "Prompt gợi ý" trong report.

import { promptCuaUr, promptKyThuat, nhanDienTinhNangMoi } from '../tools/lib/prompt.mjs';
import { renderReport } from '../tools/lib/report.mjs';
import { loadHolidays } from '../tools/lib/workdays.mjs';

let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

process.stdout.write('=== promptCuaUr: dùng lại màn hình có sẵn (không có từ khoá "tính năng") ===\n');
const u1 = {
  stt_rec: 'DV015', fcode1: '[DV-015]', noi_dung: 'Hóa đơn mua dịch vụ - Thêm trên Thông tin chung trường Số booking',
  luongDuLieu: {
    nguon: ['DEMO1_Mid.Cost', 'Danh sách hóa đơn đầu vào'],
    dich: { manHinh: 'Hóa đơn mua dịch vụ', syscode: 'PN1', sysid: 'APTran', bang: 'm31$' },
    ghiChu: 'TLKS mục 4.4. Không tạo chứng từ mới.',
  },
};
const r1 = promptCuaUr(u1, { ma_da: 'DEMO1', ma_pbsp: 'FBISP2422' });
ok('Không lỗi', r1.err === null, r1.err);
ok('Có chuỗi prompt', typeof r1.prompt === 'string' && r1.prompt.length > 0);
ok('Nêu program khách', r1.prompt?.includes('DEMO1 (FBISP2422)'));
ok('Nêu mã UR và nội dung', r1.prompt?.includes('[DV-015]') && r1.prompt?.includes('Số booking'));
ok('Liệt kê nguồn', r1.prompt?.includes('DEMO1_Mid.Cost') && r1.prompt?.includes('Danh sách hóa đơn đầu vào'));
ok('Nêu đích + controller', r1.prompt?.includes('Hóa đơn mua dịch vụ') && r1.prompt?.includes('controller APTran'));
ok('Giữ ghi chú nghiệp vụ', r1.prompt?.includes('TLKS mục 4.4'));
ok('Nhắc dùng describe_controller (nhánh dùng lại màn hình)', r1.prompt?.includes('describe_controller'));
ok('Nhắc verify + ledger', r1.prompt?.includes('Phân giải entity') && r1.prompt?.includes('pm-task-ledger'));
ok('Không lạc sang wording tính năng mới', !r1.prompt?.includes('TẠO TÍNH NĂNG MỚI'));

process.stdout.write('\n=== nhanDienTinhNangMoi: đọc từ noi_dung thật của UR (DV-012) ===\n');
const dv012NoiDung = '[DV-012]: Tạo Tính năng "Tạo hóa đơn mua dịch vụ" Thêm 01 tính năng - "Tạo hóa đơn mua dịch vụ" - Mục đích: ...';
ok('Nhận diện đúng là tính năng mới', nhanDienTinhNangMoi({ noi_dung: dv012NoiDung }).laMoi === true);
ok('Nguồn nhận diện = noi_dung', nhanDienTinhNangMoi({ noi_dung: dv012NoiDung }).nguon === 'noi_dung');
ok('UR sửa field (DV-015) không bị coi là tính năng mới', nhanDienTinhNangMoi(u1).laMoi === false);

process.stdout.write('\n=== promptCuaUr: tạo tính năng mới (menu mới, XML+SQL) ===\n');
const u4 = {
  stt_rec: 'A000570757YC1', fcode1: '[DV-012]', noi_dung: dv012NoiDung,
  luongDuLieu: {
    nguon: ['DEMO1_Mid.Cost (bảng trung gian Chi phí)', 'Danh sách hóa đơn đầu vào'],
    dich: { manHinh: 'Hóa đơn mua dịch vụ', syscode: 'PN1', sysid: 'APTran', bang: 'm31$' },
    ghiChu: 'TLKS mục 4.4. Không tạo chứng từ mới — dùng màn hình sẵn có.',
  },
};
const r4 = promptCuaUr(u4, { ma_da: 'DEMO1', ma_pbsp: 'FBISP2422' });
ok('Không lỗi', r4.err === null, r4.err);
ok('Nêu rõ TẠO TÍNH NĂNG MỚI', r4.prompt?.includes('TẠO TÍNH NĂNG MỚI'));
ok('Nói rõ không tạo loại chứng từ mới nhưng là menu mới', r4.prompt?.includes('menu/controller MỚI HOÀN TOÀN'));
ok('Không dùng lại wording "màn hình chuẩn hoặc đã customize"', !r4.prompt?.includes('màn hình chuẩn hoặc đã customize'));
ok('Chia XML (GUI) / SQL (data)', r4.prompt?.includes('XML — phục vụ GUI') && r4.prompt?.includes('SQL — xử lý data'));
ok('Vẫn nhắc program path + ledger', r4.prompt?.includes('program path') && r4.prompt?.includes('pm-task-ledger'));

process.stdout.write('\n=== promptCuaUr: override `laTinhNangMoi` thắng suy đoán từ noi_dung ===\n');
const u5 = { ...u1, laTinhNangMoi: true };
const r5 = promptCuaUr(u5, { ma_da: 'DEMO1' });
ok('Override true ép sang nhánh tính năng mới dù noi_dung không có từ khoá', r5.prompt?.includes('TẠO TÍNH NĂNG MỚI'));
const u6 = { ...u4, laTinhNangMoi: false };
const r6 = promptCuaUr(u6, { ma_da: 'DEMO1' });
ok('Override false ép về nhánh dùng lại màn hình dù noi_dung có "tính năng"', r6.prompt?.includes('describe_controller') && !r6.prompt?.includes('TẠO TÍNH NĂNG MỚI'));

process.stdout.write('\n=== promptCuaUr: thiếu dich.manHinh -> lỗi có kiểm soát, không throw ===\n');
const u2 = { stt_rec: 'DV099', luongDuLieu: { nguon: ['X'], dich: {} } };
const r2 = promptCuaUr(u2, { ma_da: 'DEMO1' });
ok('prompt null', r2.prompt === null);
ok('err mô tả đúng nguyên nhân', /dich\.manHinh/.test(r2.err ?? ''), r2.err);

process.stdout.write('\n=== promptCuaUr: không có luongDuLieu -> lỗi có kiểm soát ===\n');
const r3 = promptCuaUr({ stt_rec: 'DV098' }, {});
ok('prompt null', r3.prompt === null);
ok('err báo thiếu luongDuLieu', /luongDuLieu/.test(r3.err ?? ''), r3.err);

process.stdout.write('\n=== renderReport: khối prompt nằm ở mục riêng, escape đúng, không nhân đôi ===\n');
const h = loadHolidays();
const payload = {
  ma_da: 'DEMO1', ma_pbsp: 'FBISP2422', ten_ngan: 'Demo Co', ngay_chay: '2026-08-11',
  giaiDoan: [{ giai_doan_da: 'DV', ngay_ht: '2026-08-14', xac_nhan_da_hen_yn: true, noi_dung: 'Dịch vụ' }],
  yeuCau: [
    { stt_rec: 'DV012', fcode1: '[DV-012]', noi_dung: 'Tạo hóa đơn mua dịch vụ',
      giai_doan_da: 'DV', trang_thai: 'XN', tlks_yn: true,
      luongDuLieu: {
        nguon: ['DEMO1_Mid.Cost'],
        dich: { manHinh: 'Hóa đơn mua dịch vụ', syscode: 'PN1', sysid: 'APTran', bang: 'm31$' },
        ghiChu: 'Có <b> & "đặc biệt"',
      } },
  ],
};
const html = renderReport(payload, h);
// Prompt chuyển từ mục "Luồng dữ liệu" lên mục riêng đứng đầu tab kỹ thuật, và giờ gộp cả
// kinh nghiệm thực chiến. Để nguyên ở chỗ cũ thì một UR có cả hai sẽ hiện HAI hộp prompt và
// người đọc không biết dán cái nào.
const muc = html.slice(html.indexOf('id="prompt-ky-thuat"'), html.indexOf('id="huong-dan"'));
ok('Có tiêu đề khối prompt', muc.includes('Prompt — dán vào Claude Code'));
ok('Có nút Copy dùng chung CSS/JS với khối SQL', muc.includes('class="sql-copy"'));
ok('Nội dung prompt xuất hiện trong <pre>', muc.includes('=== BỐI CẢNH ==='));
ok('Ghi chú đặc biệt được escape, không lọt HTML sống', !muc.includes('<b> & "đặc biệt"') && muc.includes('&lt;b&gt;'));
ok('Mục "Luồng dữ liệu" KHÔNG còn hộp prompt thứ hai cho cùng UR',
  !html.slice(html.indexOf('id="luong-du-lieu"'), html.indexOf('id="ddl"')).includes('dán vào Claude Code'));

process.stdout.write('\n=== promptKyThuat: SQL script bị loại trừ có chủ đích ===\n');
const uDdl = {
  stt_rec: 'DDL01', fcode1: '[DDL-01]', noi_dung: 'Thêm bảng theo dõi',
  trang_thai: 'DD', giai_doan_da: 'DV',
  ddl: { target: 'Table', action: 'CREATE', bang: 'x99$' },
};
const rd = promptKyThuat(uDdl, { ma_da: 'DEMO1' }, { coDdl: true });
ok('Có prompt dù UR chỉ có ddl', rd.err === null && typeof rd.prompt === 'string');
ok('Prompt NÓI RÕ script SQL nằm ngoài phạm vi', rd.prompt?.includes('NGOÀI PHẠM VI PROMPT NÀY'));
ok('Nói lý do: đầu ra xác định, sửa lại là mất tính đối chiếu',
  rd.prompt?.includes('đầu ra xác\nđịnh') || rd.prompt?.includes('đầu ra xác định'));
ok('Bảo chạy nguyên văn, cấm nhờ AI viết lại',
  rd.prompt?.includes('Chạy NGUYÊN VĂN') && rd.prompt?.includes('KHÔNG nhờ AI viết lại'));
ok('KHÔNG nhét câu lệnh SQL nào vào prompt',
  !/CREATE TABLE|ALTER TABLE|INSERT INTO/i.test(rd.prompt ?? ''));

process.stdout.write('\n=== promptKyThuat: gộp kinh nghiệm + giữ phân nhánh tính năng mới ===\n');
const rk = promptKyThuat(u4, { ma_da: 'DEMO1', ma_pbsp: 'FBISP2422' }, {
  huongDan: [{ tieuDe: 'Cách cũ đã chạy', cachLam: 'B1: abc', canhBao: 'Include chung',
    _khop: 'sysid', sysid: 'APTran', ma_da: 'KHACHKHAC', nguonLt: 'HOATV' }],
});
ok('Có mục kinh nghiệm đã có', rk.prompt?.includes('KINH NGHIỆM ĐÃ CÓ (1)'));
ok('Nêu xuất xứ dự án khác và người kể',
  rk.prompt?.includes('đã chạy thật ở dự án KHACHKHAC') && rk.prompt?.includes('kinh nghiệm của HOATV'));
ok('Giữ phân nhánh TẠO TÍNH NĂNG MỚI của promptCuaUr, không rơi về checklist chung',
  rk.prompt?.includes('TẠO TÍNH NĂNG MỚI') && rk.prompt?.includes('XML — phục vụ GUI'));
ok('Nói rõ kinh nghiệm không phải quy định', rk.prompt?.includes('KHÔNG phải quy định'));

const rMenu = promptKyThuat({ stt_rec: 'X1', noi_dung: 'y' }, {}, {
  huongDan: [{ tieuDe: 'T', cachLam: 'C', _khop: 'menu_id', menu_id: '01.00.00' }],
});
ok('Khớp yếu qua menu được cảnh báo NGAY TRONG prompt, không chỉ trên HTML',
  rMenu.prompt?.includes('khớp YẾU qua menu'));

ok('UR không có gì thì trả lỗi có kiểm soát, không dựng prompt rỗng',
  promptKyThuat({ stt_rec: 'Z' }, {}, {}).prompt === null);

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures === 0 ? 'TẤT CẢ PASS' : 'CÓ LỖI'} (${failures} thất bại) ===\n`);
process.exit(failures === 0 ? 0 : 1);
