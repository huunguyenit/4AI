#!/usr/bin/env node
// test-review-report-build.mjs — tools/lib/review-report.mjs: dataset → mô tả file + phần
// AI được phép phân tích. KHÔNG chạm DB (runSql tiêm giả), KHÔNG chạm đĩa.
//
// Điều thật sự được canh ở đây: `ddChoPhanTich` KHÔNG trả nội dung UR XN/TH. Đó là chỗ
// doctrine "chỉ phân tích DD" thôi làm lời dặn và thành hình dạng dữ liệu — lời dặn thì
// model bỏ qua được, dữ liệu vắng mặt thì không.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReviewReportFiles, ddChoPhanTich } from '../tools/lib/review-report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

const YEUCAU_ROWS = [
  { ma_da: 'AAA', stt_rec: 'UR001', fcode1: 'A-01', noi_dung: 'Them truong so booking',
    noi_dung_len: 24, giai_doan_da: 'GD1', trang_thai: 'DD', menu_id: '09.30.03',
    tlks_yn: 1, ur_ma_lt1: '', tg_dk_th: 8 },
  { ma_da: 'AAA', stt_rec: 'UR002', fcode1: 'A-02', noi_dung: 'Bao cao doanh thu',
    noi_dung_len: 18, giai_doan_da: 'GD1', trang_thai: 'DD', menu_id: '06.10.01',
    tlks_yn: 0, ur_ma_lt1: '', tg_dk_th: 16 },
  { ma_da: 'AAA', stt_rec: 'UR003', fcode1: 'A-03', noi_dung: 'BI MAT KHONG DUOC LO RA',
    noi_dung_len: 22, giai_doan_da: 'GD1', trang_thai: 'XN', menu_id: '07.10.08',
    tlks_yn: 1, ur_ma_lt1: 'HOATV', tg_dk_th: 4 },
  { ma_da: 'BBB', stt_rec: 'UR004', fcode1: 'B-01', noi_dung: 'CUNG KHONG DUOC LO RA',
    noi_dung_len: 21, giai_doan_da: 'GD2', trang_thai: 'TH', menu_id: '05.00.00',
    tlks_yn: 1, ur_ma_lt1: 'DATNH', tg_dk_th: 40 },
  { ma_da: 'BBB', stt_rec: 'UR005', fcode1: 'B-02', noi_dung: 'Sua ty gia hai quan',
    noi_dung_len: 20, giai_doan_da: 'GD2', trang_thai: 'DD', menu_id: '05.10.00',
    tlks_yn: 1, ur_ma_lt1: '', tg_dk_th: 24 },
];
const DAUMUC_ROWS = [
  { stt_rec: 'UR001', stt_rec0: 'D1', ma_daumuc: '03', ten_daumuc: 'Them/sua c/tu', stt: 1 },
];
const HAN_ROWS = [
  { ma_da: 'AAA', giai_doan_da: 'GD1', ngay_ht: '2026-08-14', xac_nhan_da_hen_yn: 1, noi_dung: 'Gap kip deadline' },
  { ma_da: 'BBB', giai_doan_da: 'GD2', ngay_ht: '2026-10-20', xac_nhan_da_hen_yn: 0, noi_dung: 'Sau nghiem thu' },
];
const DUAN_ROWS = [
  { ma_da: 'AAA', ten_ngan: 'Khach A', ma_pbsp: 'SP01', bp_lt: 'FSD', ma_lt1: 'PM01' },
  { ma_da: 'BBB', ten_ngan: 'Khach B', ma_pbsp: 'SP02', bp_lt: 'FSD', ma_lt1: 'PM01' },
];

/** Bốn câu cố định chạy trước theo đúng thứ tự; phần còn lại (nhân sự, forum) trả rỗng. */
function fakeRunner() {
  let n = 0;
  return () => {
    n++;
    if (n === 1) return { rows: YEUCAU_ROWS };
    if (n === 2) return { rows: DAUMUC_ROWS };
    if (n === 3) return { rows: HAN_ROWS };
    if (n === 4) return { rows: DUAN_ROWS };
    return { rows: [] };
  };
}

const build = (args = {}) =>
  buildReviewReportFiles(ROOT, { ngayChay: '2026-08-13', ...args }, { runSql: fakeRunner() });

process.stdout.write('=== buildReviewReportFiles: mô tả file ===\n');
const built = build();
const paths = built.files.map((f) => f.relPath);

ok('Mỗi dự án ra cặp HTML + payload',
  paths.includes('review/20260813/AAA/review.html')
  && paths.includes('review/20260813/AAA/review.payload.json')
  && paths.includes('review/20260813/BBB/review.html')
  && paths.includes('review/20260813/BBB/review.payload.json'), paths.join(' '));
ok('Rà soát nhiều dự án thì có trang tổng quan',
  paths.includes('review/20260813/_tong/tong.html')
  && paths.includes('review/20260813/_tong/tong.payload.json'));
ok('Đường dẫn là tương đối — caller quyết định gốc ghi',
  paths.every((p) => !path.isAbsolute(p) && !p.includes('..')), paths.join(' '));
ok('Mọi file đều có content dạng chuỗi', built.files.every((f) => typeof f.content === 'string'));
ok('ngay lấy từ args, không phải hôm nay', built.ngay === '2026-08-13');

const chiMotDuAn = build({ project: 'AAA' });
ok('Chỉ định project thì bỏ trang tổng quan',
  !chiMotDuAn.files.some((f) => f.relPath.includes('_tong')),
  chiMotDuAn.files.map((f) => f.relPath).join(' '));

process.stdout.write('\n=== ddChoPhanTich: chỉ DD mới có nội dung ===\n');
const view = ddChoPhanTich(built.dataset);
const ddIds = view.ddUR.map((u) => u.stt_rec).sort();

ok('Trả đúng 3 UR ở DD', ddIds.join(',') === 'UR001,UR002,UR005', ddIds.join(','));
ok('Không UR nào ngoài DD lọt vào ddUR',
  view.ddUR.every((u) => String(u.trang_thai).trim() === 'DD'));
ok('UR DD giữ nguyên nội dung để phân tích',
  view.ddUR.find((u) => u.stt_rec === 'UR001')?.noi_dung === 'Them truong so booking');
ok('UR DD giữ đầu mục',
  view.ddUR.find((u) => u.stt_rec === 'UR001')?.daumuc?.length === 1);

// Đây là bài kiểm tra chính: nội dung XN/TH phải KHÔNG có mặt ở bất cứ đâu trong kết quả.
const json = JSON.stringify(view);
ok('Nội dung UR XN không lọt ra', !json.includes('BI MAT KHONG DUOC LO RA'));
ok('Nội dung UR TH không lọt ra', !json.includes('CUNG KHONG DUOC LO RA'));
ok('XN/TH vẫn còn số đếm để theo dõi hạn',
  view.tongQuan.theoTrangThai.XN === 1 && view.tongQuan.theoTrangThai.TH === 1
  && view.tongQuan.soUR === 5, JSON.stringify(view.tongQuan));

const aaa = view.duAn.find((d) => d.ma_da === 'AAA');
const bbb = view.duAn.find((d) => d.ma_da === 'BBB');
ok('Tổng quan theo dự án đếm đúng DD và số theo dõi',
  aaa.soDD === 2 && aaa.soTheoDoi === 1 && bbb.soDD === 1 && bbb.soTheoDoi === 1,
  JSON.stringify(view.duAn));
ok('Hạn gần nhất của nhóm theo dõi vẫn trả về',
  aaa.hanTheoDoiSomNhat === '2026-08-14' && bbb.hanTheoDoiSomNhat === '2026-10-20',
  JSON.stringify([aaa.hanTheoDoiSomNhat, bbb.hanTheoDoiSomNhat]));
ok('Có ghi chú giải thích vì sao XN/TH bị cắt', /XN\/TH/.test(view.ghiChu));

process.stdout.write('\n=== ranh giới kiến trúc ===\n');
const src = fs.readFileSync(path.join(ROOT, 'tools', 'lib', 'review-report.mjs'), 'utf8');
ok('review-report.mjs KHÔNG import writer — nó trả mô tả file, caller ghi',
  !/writer\.mjs/.test(src.replace(/^\/\/.*$/gm, '')));
ok('Không có fs.writeFileSync trong module', !/writeFileSync|mkdirSync/.test(src));

process.stdout.write('\n=== phạm vi rỗng ===\n');
let loi = null;
try {
  buildReviewReportFiles(ROOT, { ngayChay: '2026-08-13' }, { runSql: () => ({ rows: [] }) });
} catch (e) {
  loi = e.message;
}
ok('Phạm vi không có UR thì ném lỗi, không trả báo cáo rỗng',
  loi !== null && /không có UR nào/.test(loi), String(loi));

process.stdout.write(`\n${failures === 0 ? 'TẤT CẢ PASS' : `${failures} FAIL`}\n`);
process.exit(failures === 0 ? 0 : 1);
