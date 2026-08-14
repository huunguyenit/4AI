#!/usr/bin/env node
// test-experience-build.mjs — quét toàn phòng ra kinh nghiệm. KHÔNG chạm DB: runSql tiêm giả.
//
// Bug thật đã xảy ra: chạy `graph experience --dept FSD` trên dữ liệu thật, tưởng đã quét hết
// 780 dự án nhưng chỉ 500 được thử (342 nạp được + 158 bỏ qua có ghi lý do) — 280 dự án còn
// lại KHÔNG hề xuất hiện trong log, vì câu SQL liệt kê dự án bị `maxRows: 500` cắt NGAY TỪ
// ĐẦU, trước khi vòng lặp kịp chạy tới chúng. Im lặng tới mức "342 dự án" đọc như một con số
// đầy đủ. Test dưới đây canh đúng: trần phải đủ cao, và khi vẫn chạm trần thì phải NÓI RA.

import { sqlDuAnCoUrDaXong, sqlUrDaXong, buildKinhNghiem } from '../tools/lib/experience-build.mjs';

let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

process.stdout.write('=== 1. SQL CỐ ĐỊNH ===\n');
ok('sqlDuAnCoUrDaXong lọc đúng bộ phận và cổng trạng thái',
  sqlDuAnCoUrDaXong('FSD').includes("RTRIM(yc.bp_lt) = 'FSD'")
  && sqlDuAnCoUrDaXong('FSD').includes("IN ('HT', 'DT', 'OK', 'UP')"));
ok('Lọc theo bp_lt của UR, không phải của dự án — người phòng khác giao UR cho FSD vẫn tính',
  !/dm\.bp_lt/.test(sqlDuAnCoUrDaXong('FSD')));
ok('Có thể ép về đúng một dự án', sqlDuAnCoUrDaXong('FSD', 'DEMO1').includes("RTRIM(yc.ma_da) = 'DEMO1'"));
ok('sqlUrDaXong thay CR/LF/TAB giữ nguyên độ dài (để LEN() đối chiếu được)',
  sqlUrDaXong('X').includes('CHAR(13)') && sqlUrDaXong('X').includes('LEN(noi_dung)'));

process.stdout.write('\n=== 2. TRẦN DANH SÁCH DỰ ÁN PHẢI ĐỦ CAO, VÀ KHI CHẠM TRẦN PHẢI NÓI RA ===\n');
// Runner ghi lại trần thật sự được xin (để canh nó đủ cao cho phòng cỡ FSD — 780 dự án đo
// được ngoài đời), và TÁCH RIÊNG giả lập tình huống chạm trần: nguồn giả vờ có nhiều hơn số
// dòng trả về, đúng cách `execSql` thật báo `truncated` khi `rows.length > maxRows`.
let maxRowsXin = null;
const runnerChamTran = ({ sql, maxRows }) => {
  if (/FROM nbphyc yc JOIN nbdmda/.test(sql)) {
    maxRowsXin = maxRows;
    const rows = Array.from({ length: maxRows }, (_, i) => ({
      ma_da: `DA${i}`, so_ur: '1', dir_pro_web: `\\\\srv\\DA${i}`, dir_pro_app: '',
    }));
    return { rows, truncated: true }; // nguồn còn nhiều hơn — đúng bug đã đo được ngoài đời
  }
  return { rows: [] };
};
const ket = buildKinhNghiem('.', { boPhan: 'FSD' }, { runSql: runnerChamTran });

ok('Trần xin về phải đủ cho phòng cỡ FSD (>500, tránh lặp lại bug đã đo được)',
  maxRowsXin >= 780, String(maxRowsXin));
ok('Chạm trần thì PHẢI nói ra trong boQua, không được im lặng',
  ket.boQua.some((m) => m.includes('BỊ CẮT')), ket.boQua[0]);
ok('tongDuAnTimThay phản ánh đúng số dòng thực sự lấy về được',
  ket.tongDuAnTimThay === maxRowsXin, String(ket.tongDuAnTimThay));

// Không chạm trần (nguồn nhỏ hơn trần) -> im lặng đúng nghĩa, không cảnh báo vô cớ.
const BA_NHO = [{ ma_da: 'A', so_ur: '1' }, { ma_da: 'B', so_ur: '1' }, { ma_da: 'C', so_ur: '1' }];
const ketNho = buildKinhNghiem('.', { boPhan: 'FSD' },
  { runSql: ({ sql }) => /FROM nbphyc yc JOIN nbdmda/.test(sql)
    ? { rows: BA_NHO, truncated: false } : { rows: [] } });
ok('Không chạm trần -> không cảnh báo cắt', !ketNho.boQua.some((m) => m.includes('BỊ CẮT')));
ok('tongDuAnTimThay = đúng 3 khi nguồn chỉ có 3', ketNho.tongDuAnTimThay === 3);

process.stdout.write('\n=== 3. MỖI DỰ ÁN ĐI TỚI MỘT KẾT CỤC RÕ RÀNG (nạp được, hoặc bỏ qua có lý do) ===\n');
// Ba dự án, ba lý do bỏ qua khác nhau — không dự án nào biến mất không dấu vết.
const BA_DU_AN = [
  { ma_da: 'THIEU_DUONG_DAN', so_ur: '1', dir_pro_web: '', dir_pro_app: '' },
  { ma_da: 'WCOMMAND_CHET', so_ur: '1', dir_pro_web: '\\\\srv\\A', dir_pro_app: '' },
  { ma_da: 'KHONG_RA_HIEN_VAT', so_ur: '1', dir_pro_web: '\\\\srv\\B', dir_pro_app: '' },
];
const runnerBaDuAn = ({ sql, programPath }) => {
  if (/FROM nbphyc yc JOIN nbdmda/.test(sql)) return { rows: BA_DU_AN, truncated: false };
  if (programPath === '\\\\srv\\A') throw new Error('sqlcmd ETIMEDOUT');
  if (/FROM wcommand/.test(sql)) return { rows: [{ menu_id: 'M1', bar: 'Danh mục khách hàng dài', sysid: 'Cust', type: 'D' }] };
  return { rows: [{ stt_rec: 'U1', ur_ma_lt1: 'A', trang_thai: 'UP', noi_dung: 'Nhờ LT hỗ trợ xem giúp' }] };
};
const ketBa = buildKinhNghiem('.', { boPhan: 'FSD' }, { runSql: runnerBaDuAn });

ok('Thiếu đường dẫn chương trình -> bỏ qua có lý do',
  ketBa.boQua.some((m) => m.startsWith('THIEU_DUONG_DAN:') && m.includes('dir_pro_web')));
ok('wcommand chết (share offline) -> bỏ qua có lý do, không đoán mò',
  ketBa.boQua.some((m) => m.startsWith('WCOMMAND_CHET:') && m.includes('ETIMEDOUT')));
ok('UR không nêu tên hiện vật nào -> bỏ qua có lý do, không bịa kinh nghiệm',
  ketBa.boQua.some((m) => m.startsWith('KHONG_RA_HIEN_VAT:') && m.includes('không rút được hiện vật')));
ok('Không dự án nào lọt qua mà không có kết cục',
  ketBa.thongKe.duAn + ketBa.boQua.length >= BA_DU_AN.length);

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures ? `${failures} thất bại` : 'TẤT CẢ PASS (0 thất bại)'} ===\n`);
process.exit(failures ? 1 : 0);
