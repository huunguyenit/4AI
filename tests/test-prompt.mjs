#!/usr/bin/env node
// test-prompt.mjs — promptCuaUr() (tools/lib/prompt.mjs) và render mục "Prompt gợi ý" trong report.

import { promptCuaUr } from '../tools/lib/prompt.mjs';
import { renderReport } from '../tools/lib/report.mjs';
import { loadHolidays } from '../tools/lib/workdays.mjs';

let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

process.stdout.write('=== promptCuaUr: luongDuLieu đầy đủ ===\n');
const u1 = {
  stt_rec: 'DV012', fcode1: '[DV-012]', noi_dung: 'Tạo hóa đơn mua dịch vụ',
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
ok('Nêu mã UR và nội dung', r1.prompt?.includes('[DV-012]') && r1.prompt?.includes('Tạo hóa đơn mua dịch vụ'));
ok('Liệt kê nguồn', r1.prompt?.includes('DEMO1_Mid.Cost') && r1.prompt?.includes('Danh sách hóa đơn đầu vào'));
ok('Nêu đích + controller', r1.prompt?.includes('Hóa đơn mua dịch vụ') && r1.prompt?.includes('controller APTran'));
ok('Giữ ghi chú nghiệp vụ', r1.prompt?.includes('TLKS mục 4.4'));
ok('Nhắc verify + ledger', r1.prompt?.includes('resolve_entities') && r1.prompt?.includes('pm-task-ledger'));

process.stdout.write('\n=== promptCuaUr: thiếu dich.manHinh -> lỗi có kiểm soát, không throw ===\n');
const u2 = { stt_rec: 'DV099', luongDuLieu: { nguon: ['X'], dich: {} } };
const r2 = promptCuaUr(u2, { ma_da: 'DEMO1' });
ok('prompt null', r2.prompt === null);
ok('err mô tả đúng nguyên nhân', /dich\.manHinh/.test(r2.err ?? ''), r2.err);

process.stdout.write('\n=== promptCuaUr: không có luongDuLieu -> lỗi có kiểm soát ===\n');
const r3 = promptCuaUr({ stt_rec: 'DV098' }, {});
ok('prompt null', r3.prompt === null);
ok('err báo thiếu luongDuLieu', /luongDuLieu/.test(r3.err ?? ''), r3.err);

process.stdout.write('\n=== renderReport: mục "Luồng dữ liệu" có khối Prompt gợi ý, escape đúng ===\n');
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
const muc = html.slice(html.indexOf('id="luong-du-lieu"'), html.indexOf('id="ddl"'));
ok('Có tiêu đề khối prompt', muc.includes('Prompt gợi ý — dán vào Claude Code'));
ok('Có nút Copy dùng chung CSS/JS với khối SQL', muc.includes('class="sql-copy"'));
ok('Nội dung prompt xuất hiện trong <pre>', muc.includes('=== BỐI CẢNH ==='));
ok('Ghi chú đặc biệt được escape, không lọt HTML sống', !muc.includes('<b> & "đặc biệt"') && muc.includes('&lt;b&gt;'));

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures === 0 ? 'TẤT CẢ PASS' : 'CÓ LỖI'} (${failures} thất bại) ===\n`);
process.exit(failures === 0 ? 0 : 1);
