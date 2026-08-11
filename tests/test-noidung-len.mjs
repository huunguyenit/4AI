#!/usr/bin/env node
// test-noidung-len.mjs — validatePayload() phải CHẶN `noi_dung` bị cắt khi copy tay từ
// query_sql, không chỉ dặn trong skill (bug đã xảy ra thật: 2026-08-11, UR DEMO1 DV-008..014
// bị cắt còn ~300/1046 ký tự). Đồng thời KHÔNG được báo nhầm khi gộp khoảng trắng thừa hợp lệ.

import { validatePayload } from '../tools/lib/report.mjs';

let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

function payloadVoiUr(u) {
  return {
    ma_da: 'DEMO1', ngay_chay: '2026-08-11',
    giaiDoan: [{ giai_doan_da: 'DV', ngay_ht: '2026-08-14' }],
    yeuCau: [{ stt_rec: 'A1', trang_thai: 'XN', tlks_yn: true, ...u }],
  };
}

process.stdout.write('=== noiDungLenGoc vắng mặt -> không kiểm, không lỗi ===\n');
const p1 = payloadVoiUr({ fcode1: '[DV-012]', noi_dung: 'câu bị cắt bất kỳ' });
ok('Không có lỗi', validatePayload(p1).length === 0, validatePayload(p1).join(' | '));

process.stdout.write('\n=== noi_dung bị cắt thật (case DV-012 gặp thực tế) -> BỊ CHẶN ===\n');
const p2 = payloadVoiUr({
  fcode1: '[DV-012]',
  noi_dung: '[DV-012]: Tạo Tính năng "Tạo hóa đơn mua dịch vụ" ... điền các thông tin cần tạo. Chương', // 297 ký tự thật ngoài đời
  noiDungLenGoc: 531,
});
const e2 = validatePayload(p2);
ok('Có lỗi quality', e2.length > 0);
ok('Nêu đúng lý do bị cắt', e2.some((m) => m.includes('có thể đã bị cắt khi copy từ query_sql')), e2.join(' | '));

process.stdout.write('\n=== noi_dung ĐỦ nhưng đã gộp khoảng trắng thừa (giảm ~2%) -> KHÔNG bị chặn ===\n');
const noiDungGop = 'a'.repeat(1024); // mô phỏng DV-008 thật: gộp còn 1024/1046 = 97.9%
const p3 = payloadVoiUr({ fcode1: '[DV-008]', noi_dung: noiDungGop, noiDungLenGoc: 1046 });
ok('Không có lỗi (hụt < 10% là hợp lệ)', validatePayload(p3).length === 0, validatePayload(p3).join(' | '));

process.stdout.write('\n=== noi_dung đủ đúng 100% -> KHÔNG bị chặn ===\n');
const p4 = payloadVoiUr({ fcode1: '[DV-014]', noi_dung: 'x'.repeat(524), noiDungLenGoc: 524 });
ok('Không có lỗi', validatePayload(p4).length === 0, validatePayload(p4).join(' | '));

process.stdout.write('\n=== noiDungLenGoc không hợp lệ (0, âm, chuỗi) -> báo lỗi riêng ===\n');
const p5 = payloadVoiUr({ fcode1: '[DV-999]', noi_dung: 'bất kỳ', noiDungLenGoc: 0 });
ok('Báo lỗi noiDungLenGoc', validatePayload(p5).some((m) => m.includes('phải là số > 0')), validatePayload(p5).join(' | '));

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures === 0 ? 'TẤT CẢ PASS' : 'CÓ LỖI'} (${failures} thất bại) ===\n`);
process.exit(failures === 0 ? 0 : 1);
