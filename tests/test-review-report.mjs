#!/usr/bin/env node
// test-review-report.mjs — Test mục "Giai đoạn chưa tick chốt đã hẹn" trong renderReport.
//
// Bug đã sửa: `nbcnhanhtda` không tự dọn dòng cũ, nên một giai đoạn đã xong hết việc (mọi UR
// đã lên HT trở lên, không còn dòng nào ở DD/XN/TH) vẫn còn nằm trong bảng hạn. Trước khi sửa,
// mục này liệt kê MỌI giai đoạn chưa tick `xac_nhan_da_hen_yn`, kể cả giai đoạn không còn yêu
// cầu tồn đọng nào — báo "quá 73 ngày" cho một giai đoạn thực ra chẳng ai còn chờ.

import { renderReport, validatePayload } from '../tools/lib/report.mjs';
import { loadHolidays } from '../tools/lib/workdays.mjs';

let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

const h = loadHolidays();

const payload = {
  ma_da: 'DEMO4', ten_ngan: 'Hoa TP', ngay_chay: '2026-08-11',
  giaiDoan: [
    // DR01: chưa chốt hẹn, hạn đã qua rất lâu, nhưng KHÔNG còn UR nào ở DD/XN/TH tied vào nó
    // (mọi UR của giai đoạn này trong payload thật đã lên HT/OK/UP nên không xuất hiện ở đây)
    // -> KHÔNG được liệt kê.
    { giai_doan_da: 'DR01', ngay_ht: '2026-04-25', xac_nhan_da_hen_yn: false, noi_dung: 'Đầu ra' },
    // DR03: chưa chốt hẹn, VÀ còn đúng 1 UR ở TH -> PHẢI liệt kê, soUrTonDong = 1.
    { giai_doan_da: 'DR03', ngay_ht: '2026-08-07', xac_nhan_da_hen_yn: false,
      noi_dung: 'Để user nhập liệu được trên app mobile' },
    // DV01: đã tick chốt hẹn -> KHÔNG liệt kê dù có UR tồn đọng.
    { giai_doan_da: 'DV01', ngay_ht: '2025-12-20', xac_nhan_da_hen_yn: true, noi_dung: 'Đầu vào' },
  ],
  yeuCau: [
    { stt_rec: 'A007', fcode1: 'App007',
      noi_dung: 'Thêm chức năng xem tồn theo kho, theo lô của toàn bộ các kênh',
      giai_doan_da: 'DR03', trang_thai: 'TH', tlks_yn: true, trang_tlks: 'TLKS tr.7' },
    { stt_rec: 'A020', fcode1: 'App020', noi_dung: 'Sửa mapping đơn vị tính',
      giai_doan_da: 'DV01', trang_thai: 'DD', tlks_yn: true, trang_tlks: 'TLKS tr.20',
      menu_id: 'M20' },
  ],
};

process.stdout.write('=== payload hợp lệ ===\n');
ok('Không lỗi validate', validatePayload(payload).length === 0, validatePayload(payload).join(' | '));

const html = renderReport(payload, h);

// DR01/DV01 hợp lệ xuất hiện ở NƠI KHÁC trên trang (biểu đồ hạn theo giai đoạn dùng mọi
// giai đoạn; UR-020 vẫn đúng khi hiện trong bảng "Quá hạn" của nó) — nên phải soi ĐÚNG mục
// "chua-chot", không phải toàn trang.
const mucChuaChot = html.slice(html.indexOf('id="chua-chot"'), html.indexOf('</section>', html.indexOf('id="chua-chot"')));

process.stdout.write('\n=== Giai đoạn chưa tick chốt đã hẹn — chỉ liệt kê khi CÒN yêu cầu tồn đọng ===\n');
ok('DR03 (chưa chốt + còn 1 UR TH) xuất hiện trong mục', mucChuaChot.includes('>DR03<'));
ok('DR01 (chưa chốt nhưng KHÔNG còn UR nào) KHÔNG xuất hiện trong mục', !mucChuaChot.includes('>DR01<'));
ok('DV01 (đã tick chốt, dù còn UR DD) KHÔNG xuất hiện trong mục phase-table',
  !/<td>DV01<\/td>/.test(mucChuaChot));
ok('Có cột "YC tồn đọng" trong bảng', mucChuaChot.includes('YC tồn đọng'));
ok('Đếm đúng 1 YC tồn đọng cho DR03',
  /<td>DR03<\/td>[\s\S]*?<td class="mono">1<\/td>/.test(mucChuaChot));

process.stdout.write('\n=== Thẻ tóm tắt đếm đúng (chỉ 1, không phải 2) ===\n');
ok('Thẻ "giai đoạn chưa chốt hẹn" đếm 1 (DR01 đã bị loại)',
  /<b>1<\/b><span>giai đoạn chưa chốt hẹn<\/span>/.test(html), 'kỳ vọng chỉ DR03');

process.stdout.write('\n=== Trường hợp không còn giai đoạn nào đáng báo ===\n');
const payloadSach = {
  ...payload,
  giaiDoan: payload.giaiDoan.map((g) => g.giai_doan_da === 'DR03' ? { ...g, xac_nhan_da_hen_yn: true } : g),
};
const htmlSach = renderReport(payloadSach, h);
ok('Mọi giai đoạn đã chốt hoặc không còn tồn đọng -> thông báo trống',
  htmlSach.includes('Không có giai đoạn nào vừa chưa chốt đã hẹn vừa còn yêu cầu tồn đọng'));
ok('Thẻ tóm tắt về 0', /<b>0<\/b><span>giai đoạn chưa chốt hẹn<\/span>/.test(htmlSach));

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures === 0 ? 'TẤT CẢ PASS' : 'CÓ LỖI'} (${failures} thất bại) ===\n`);
process.exit(failures === 0 ? 0 : 1);
