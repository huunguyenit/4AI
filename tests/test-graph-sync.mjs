#!/usr/bin/env node
// test-graph-sync.mjs — bước 3: dataset rà soát → tầng dự án của đồ thị.
//
// Câu chuyện được canh ở đây: user A chạy N1-N3, user B chạy N4-N6, quản lý C chạy cả sáu.
// Lần chạy của A KHÔNG được đụng tới dữ liệu của B, và ngược lại. Không chạm DB.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { datasetToGraph, urDaXong, TRANG_THAI_DA_XONG } from '../tools/lib/graph-sync.mjs';
import { loadSchema, graphTuObject, validateGraph, emitSql } from '../tools/lib/graph.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

const schema = loadSchema(ROOT);

const DATASET_A = {
  projects: [
    { ma_da: 'N1', ten_ngan: 'Khách một', ma_pbsp: 'SP229' },
    { ma_da: 'N2', ten_ngan: 'Khách hai', ma_pbsp: 'SP229' },
    { ma_da: 'N9', ten_ngan: 'Dự án rỗng', ma_pbsp: 'SP229' },
  ],
  yeuCau: [
    { ma_da: 'N1', stt_rec: 'UR001', fcode1: 'A-01', noi_dung: 'Thêm trường tỷ giá',
      giai_doan_da: 'GD1', trang_thai: 'DD', ur_ma_lt1: '', ngay_ht: '2026-09-01',
      xac_nhan_da_hen_yn: '1', giai_doan_noi_dung: 'Bàn giao phân hệ kế toán', tg_dk_th: 8 },
    { ma_da: 'N1', stt_rec: 'UR002', fcode1: 'A-02', noi_dung: 'Sửa mẫu in',
      giai_doan_da: 'GD1', trang_thai: 'UP', ur_ma_lt1: 'NV01', ngay_ht: '2026-09-01' },
    { ma_da: 'N2', stt_rec: 'UR003', fcode1: 'B-01', noi_dung: 'Báo cáo công nợ',
      giai_doan_da: 'GD2', trang_thai: 'OK', ur_ma_lt1: 'DATNH', ngay_ht: '2026-10-15' },
  ],
};

process.stdout.write('=== 1. DATASET → NODE/CẠNH ===\n');
const gA = datasetToGraph(DATASET_A, { boi: 'PM01' });

ok('Phạm vi = đúng dự án CÓ UR, không lấy dự án rỗng',
  gA.scopes.join(',') === 'N1,N2', gA.scopes.join(','));
ok('Project rỗng không lên đồ thị (không nhận sở hữu scope mình không dựng lại được)',
  !gA.nodes.some((n) => n.kind === 'Project' && n.ma_da === 'N9'));
ok('Mỗi UR một node Request', gA.nodes.filter((n) => n.kind === 'Request').length === 3);
ok('Giai đoạn gộp theo (ma_da, giai_doan_da), không lặp theo từng UR',
  gA.nodes.filter((n) => n.kind === 'Phase').length === 2,
  String(gA.nodes.filter((n) => n.kind === 'Phase').length));
ok('Phase mang hạn và cờ xác nhận từ dataset',
  gA.nodes.find((n) => n.kind === 'Phase').deadline === '2026-09-01'
  && gA.nodes.find((n) => n.kind === 'Phase').completionRequired === true);

ok('scope của node = mã dự án của nó',
  gA.nodes.every((n) => ['N1', 'N2'].includes(n.scope)));
ok('Ghi người chạy vào cột audit', gA.nodes.every((n) => n.capNhatBoi === 'PM01'));

process.stdout.write('\n=== 2. TRẠNG THÁI LÀ QUAN HỆ, KHÔNG PHẢI THUỘC TÍNH ===\n');
const req = gA.nodes.find((n) => n.kind === 'Request' && n.stt_rec === 'UR001');
ok('trang_thai KHÔNG nằm trên node Request', !('trang_thai' in req), Object.keys(req).join(','));
ok('Có cạnh HAS_STATUS tới node Status dùng chung',
  gA.edges.some((e) => e.type === 'HAS_STATUS' && e.from === 'Request:UR001' && e.to === 'Status:DD'));
ok('Có cạnh BELONGS_TO tới dự án',
  gA.edges.some((e) => e.type === 'BELONGS_TO' && e.to === 'Project:N1'));
ok('Có cạnh IN_PHASE tới giai đoạn',
  gA.edges.some((e) => e.type === 'IN_PHASE' && e.to === 'Phase:N1|GD1'));
ok('UR không có giai đoạn thì không bịa ra cạnh IN_PHASE',
  datasetToGraph({ projects: [{ ma_da: 'N1' }], yeuCau: [{ ma_da: 'N1', stt_rec: 'X', trang_thai: 'DD' }] })
    .edges.every((e) => e.type !== 'IN_PHASE'));

process.stdout.write('\n=== 3. QUA ĐÚNG BỘ LUẬT CỦA ĐỒ THỊ ===\n');
const dungA = graphTuObject(schema, gA);
ok('Không lỗi cấu trúc', dungA.errors.length === 0,
  dungA.errors.slice(0, 2).map((e) => e.message).join(' | '));
// Status là lookup tĩnh đã nạp sẵn trong DB, không có trong dataset — cạnh HAS_STATUS trỏ ra
// ngoài lô. Khai `kindNgoai` thì hợp lệ; KHÔNG khai thì phải báo lỗi, nếu không một khoá gõ
// nhầm sẽ lặng lẽ trôi qua dưới danh nghĩa "tham chiếu ngoài".
ok('Khai kindNgoai: Status -> không còn lỗi nào',
  validateGraph(schema, dungA, { kindNgoai: ['Status'] }).length === 0,
  validateGraph(schema, dungA, { kindNgoai: ['Status'] }).slice(0, 2).map((e) => e.message).join(' | '));
ok('KHÔNG khai kindNgoai -> vẫn báo cạnh treo (mặc định nghiêm ngặt, giữ cho graph check bắt lỗi gõ nhầm)',
  validateGraph(schema, dungA).some((e) => e.message.includes('Status:')));
ok('Kind lạ không được núp dưới danh nghĩa tham chiếu ngoài',
  validateGraph(schema, graphTuObject(schema, {
    nodes: [{ _: 'node', kind: 'Project', ma_da: 'N1', scope: 'N1' }],
    edges: [{ _: 'edge', type: 'BELONGS_TO', from: 'Request:UR-MA', to: 'Project:N1' }],
  }), { kindNgoai: ['Status'] }).some((e) => e.message.includes('Request:UR-MA')));

process.stdout.write('\n=== 4. LẦN CHẠY CỦA A KHÔNG ĐƯỢC ĐỤNG DỮ LIỆU CỦA B ===\n');
const sqlA = emitSql(schema, dungA, { scopes: gA.scopes });
ok('Phạm vi ghi đúng hai dự án của A', /Phạm vi lần ghi này: N1, N2/.test(sqlA));
ok('Mọi phép xoá node giới hạn trong N1, N2',
  (sqlA.match(/WHERE t\.\[scope\] IN \(N'N1', N'N2'\)/g) ?? []).length
  === (sqlA.match(/DELETE t FROM/g) ?? []).length);
ok('KHÔNG có DELETE toàn bảng', !/DELETE FROM dbo\.\[node_\w+\];/.test(sqlA));
ok('Không nhắc tới scope nào ngoài phạm vi', !/N'N4'|N'N5'|N'N6'/.test(sqlA));
ok('Chỉ xoá ba loại cạnh mà lần chạy này dựng lại được',
  ['BELONGS_TO', 'IN_PHASE', 'HAS_STATUS'].every((t) => sqlA.includes(`DELETE e FROM dbo.[${t}]`))
  && !sqlA.includes('DELETE e FROM dbo.[USES]'));

// Lần chạy của B: dữ liệu khác, phạm vi khác.
const gB = datasetToGraph({
  projects: [{ ma_da: 'N4', ten_ngan: 'Khách bốn' }],
  yeuCau: [{ ma_da: 'N4', stt_rec: 'UR900', trang_thai: 'UP', giai_doan_da: 'GD1', ur_ma_lt1: 'NV08' }],
});
const sqlB = emitSql(schema, graphTuObject(schema, gB), { scopes: gB.scopes });
ok('Lần chạy của B chỉ nhốt trong N4', /Phạm vi lần ghi này: N4/.test(sqlB) && !/N'N1'/.test(sqlB));

process.stdout.write('\n=== 5. CỔNG TRẠNG THÁI CHO KINH NGHIỆM (bước 4 dùng lại) ===\n');
ok('Cổng gồm HT, DT, OK, UP', TRANG_THAI_DA_XONG.join(',') === 'HT,DT,OK,UP');
ok('urDaXong lọc đúng, bỏ UR chưa xong',
  urDaXong(DATASET_A.yeuCau).map((u) => u.stt_rec).join(',') === 'UR002,UR003');

process.stdout.write('\n=== 6. DỮ KIỆN THIẾU — NÓI RÕ, KHÔNG ĐOÁN ===\n');
const gThieu = datasetToGraph({ projects: [], yeuCau: [{ stt_rec: 'UR-KHONG-DA', trang_thai: 'DD' }] });
ok('UR không có ma_da -> bỏ qua và ghi lý do, không gán bừa dự án',
  gThieu.nodes.length === 0 && gThieu.boQua.some((m) => m.includes('không có ma_da')),
  gThieu.boQua.join(' | '));
ok('Dataset rỗng -> không có gì để đẩy, không lỗi',
  datasetToGraph({}).nodes.length === 0 && datasetToGraph({}).scopes.length === 0);

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures ? `${failures} thất bại` : 'TẤT CẢ PASS (0 thất bại)'} ===\n`);
process.exit(failures ? 1 : 0);
