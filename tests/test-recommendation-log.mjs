#!/usr/bin/env node
// test-recommendation-log.mjs — vòng quan sát: gợi ý hôm nay → PM giao trên web QLDA →
// lần chạy sau tự suy ra kết cục. Không có bước nào đòi người dùng gõ thêm.

import {
  snapshotGoiY, toGraphNodes, docLog, doiChieu, tongHop, sqlDocLog,
} from '../tools/lib/recommendation-log.mjs';
import { goiYPhanCong } from '../tools/lib/assignee.mjs';

let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

const NHAN_SU = {
  lichSuMenu: [
    { menu_id: 'M01', ma_lt1: 'NV02', so_ur: 6 },
    { menu_id: 'M01', ma_lt1: 'NV04', so_ur: 2 },
  ],
  taiTrong: [
    { ma_lt1: 'NV02', so_ur_toi_han: 0, so_ur_dang_mo: 3 },
    { ma_lt1: 'NV04', so_ur_toi_han: 0, so_ur_dang_mo: 2 },
  ],
};

process.stdout.write('=== 1. SNAPSHOT GỢI Ý ===\n');
const urs = [
  { stt_rec: 'R1', ma_da: 'DEMO1', trang_thai: 'DD', ma_lt1: '', menu_id: 'M01', noi_dung: 'a' },
  { stt_rec: 'R2', ma_da: 'DEMO1', trang_thai: 'DD', ma_lt1: '', menu_id: 'M01', noi_dung: 'b' },
  { stt_rec: 'R3', ma_da: 'DEMO1', trang_thai: 'TH', ma_lt1: 'NV02', menu_id: 'M01', noi_dung: 'c' },
];
const goiYs = goiYPhanCong(urs, NHAN_SU);
const snap = snapshotGoiY(goiYs, { ngayChay: '2026-08-13' });

ok('Chỉ snapshot UR có gợi ý (DD chưa giao), bỏ UR đã chạy', snap.length === 2,
  snap.map((s) => s.stt_rec).join(','));
ok('Giữ thứ hạng lúc gợi ý, không phải chấm lại sau', snap[0].daGoiY[0].ma_lt1 === 'NV02',
  JSON.stringify(snap[0].daGoiY.map((c) => c.ma_lt1)));
ok('Có policyVersion để biết trọng số nào sinh ra thứ hạng này',
  /^[0-9a-f]{8}$/.test(snap[0].policyVersion), snap[0].policyVersion);
ok('Giữ điểm và độ tin cậy của từng ứng viên',
  typeof snap[0].daGoiY[0].diem === 'number' && Boolean(snap[0].daGoiY[0].doTinCay));

process.stdout.write('\n=== 2. LOG LÀ NODE ĐỒ THỊ, KHÔNG PHẢI FILE CỤC BỘ ===\n');
const { nodes, edges } = toGraphNodes(snap, { boi: 'PM01' });
ok('Ra node RecommendationLog', nodes.length === 2 && nodes.every((n) => n.kind === 'RecommendationLog'));
ok('scope = mã dự án, để user khác không ghi đè', nodes.every((n) => n.scope === 'DEMO1'));
ok('Khoá gồm cả ngày -> chạy hai lần trong ngày ghi đè chính nó, không đẻ node thứ hai',
  nodes[0].id === 'R1|2026-08-13' && new Set(nodes.map((n) => n.id)).size === 2);
ok('Giữ top-1 để truy vấn khỏi phải mở mảng', nodes[0].goiYTop1 === 'NV02', nodes[0].goiYTop1);
ok('Giữ thang chấm cùng thứ hạng', nodes[0].chamTheo === 'menu_id', nodes[0].chamTheo);
ok('Có cạnh HAS_RECOMMENDATION về đúng Request',
  edges.length === 2 && edges[0].type === 'HAS_RECOMMENDATION' && edges[0].from === 'Request:R1');
ok('Cạnh trỏ tới khoá có scope (node RecommendationLog là scoped)',
  edges[0].to === 'RecommendationLog:DEMO1|R1|2026-08-13', edges[0].to);
ok('Bản ghi thiếu ma_da -> bỏ, không dựng node mồ côi scope',
  toGraphNodes([{ stt_rec: 'X', ngayGoiY: '2026-08-13' }]).nodes.length === 0);

process.stdout.write('\n=== 2b. ĐỌC LOG TỪ ĐỒ THỊ ===\n');
ok('SQL đọc node_RecommendationLog và lọc theo dự án',
  sqlDocLog(['DEMO1']).includes('FROM dbo.node_RecommendationLog')
  && sqlDocLog(['DEMO1']).includes("RTRIM(ma_da) IN ('DEMO1')"));
// `daGoiY` lưu chuỗi JSON trong NVARCHAR(MAX) — đọc ra phải parse lại thành mảng.
const docGia = {
  runGraphSql: () => ({ rows: [
    { stt_rec: 'R1', ma_da: 'DEMO1', ngayGoiY: '2026-08-13', chamTheo: 'menu_id',
      daGoiY: JSON.stringify([{ ma_lt1: 'NV02', diem: 100, doTinCay: 'trung-binh' }]) },
    { stt_rec: 'R2', ma_da: 'DEMO1', ngayGoiY: '2026-08-13', chamTheo: 'menu_id',
      daGoiY: JSON.stringify([{ ma_lt1: 'NV02', diem: 100, doTinCay: 'trung-binh' }]) },
  ] }),
};
const logDaDoc = docLog(docGia, ['DEMO1']);
ok('Parse lại được mảng ứng viên', logDaDoc.length === 2 && logDaDoc[0].daGoiY[0].ma_lt1 === 'NV02');
ok('daGoiY hỏng cú pháp -> mảng rỗng, không ném',
  docLog({ runGraphSql: () => ({ rows: [{ stt_rec: 'R9', daGoiY: '{hong' }] }) }, ['X'])[0].daGoiY.length === 0);
ok('Đồ thị chết -> trả rỗng, báo cáo vẫn chạy',
  docLog({ runGraphSql: () => { throw new Error('DB chết'); } }, ['DEMO1']).length === 0);
ok('Không có dự án nào -> không hỏi DB', docLog(docGia, []).length === 0);

process.stdout.write('\n=== 3. ĐỐI CHIẾU — SUY TỪ nbphyc, KHÔNG HỎI AI ===\n');
// Lần chạy sau: PM đã giao trên web QLDA. R1 đúng gợi ý, R2 giao người khác.
const datasetSau = [
  { stt_rec: 'R1', ma_da: 'DEMO1', trang_thai: 'TH', ur_ma_lt1: 'NV02', menu_id: 'M01' },
  { stt_rec: 'R2', ma_da: 'DEMO1', trang_thai: 'TH', ur_ma_lt1: 'NV03', menu_id: 'M01' },
];
const pmTheoDuAn = new Map([['DEMO1', 'PM01']]);
const dc = doiChieu(logDaDoc, datasetSau, pmTheoDuAn);

ok('Đối chiếu được cả hai UR', dc.length === 2);
ok('PM giao đúng người gợi ý -> trung',
  dc.find((d) => d.stt_rec === 'R1').ketCuc === 'trung');
ok('PM giao người khác -> khac, ghi rõ ai',
  dc.find((d) => d.stt_rec === 'R2').ketCuc === 'khac'
  && dc.find((d) => d.stt_rec === 'R2').thucTe === 'NV03');
ok('KHÔNG bịa lý do PM đổi ý — không có field nào chứa suy diễn',
  !('overrideReason' in dc[0]) && !('lyDo' in dc[0]), Object.keys(dc[0]).join(','));

// UR vẫn ở DD chưa giao: PM chưa quyết, chưa kết luận gì được.
const dcChuaQuyet = doiChieu(logDaDoc,
  [{ stt_rec: 'R1', ma_da: 'DEMO1', trang_thai: 'DD', ur_ma_lt1: '', menu_id: 'M01' }], pmTheoDuAn);
ok('UR còn ở DD chưa giao -> chua-giao, không tính là trượt',
  dcChuaQuyet[0].ketCuc === 'chua-giao' && dcChuaQuyet[0].thucTe === '');

// ma_lt1 = mã PM là mặc định BA để lại, KHÔNG phải đã giao — cùng định nghĩa với báo cáo.
const dcMacDinhBa = doiChieu(logDaDoc,
  [{ stt_rec: 'R1', ma_da: 'DEMO1', trang_thai: 'DD', ur_ma_lt1: 'PM01', menu_id: 'M01' }],
  pmTheoDuAn);
ok('ma_lt1 = mã PM -> vẫn là chưa giao, không tính nhầm thành override',
  dcMacDinhBa[0].ketCuc === 'chua-giao', JSON.stringify(dcMacDinhBa[0]));

// UR biến mất khỏi phạm vi rà soát -> không đoán bừa.
ok('UR không còn trong dataset -> bỏ qua, không suy đoán kết cục',
  doiChieu(logDaDoc, [], pmTheoDuAn).length === 0);

process.stdout.write('\n=== 4. TỔNG HỢP CHO DASHBOARD ===\n');
const th = tongHop(dc);
ok('Tỉ lệ trùng tính đúng (1/2)', th.tiLeTrung === 50, JSON.stringify(th));
ok('Đếm đủ số đã quyết', th.soDaQuyet === 2 && th.soTrung === 1);
ok('Nêu người hay được chọn thay', th.thayThe[0].ma_lt1 === 'NV03' && th.thayThe[0].soLan === 1,
  JSON.stringify(th.thayThe));
ok('Phân biệt "có trong gợi ý nhưng không đứng đầu" với "ngoài tầm nhìn thuật toán"',
  th.thayThe[0].trongGoiY === 0, JSON.stringify(th.thayThe[0]));

// UR chưa quyết KHÔNG được kéo tỉ lệ xuống — báo cáo chạy sớm không phải là gợi ý sai.
const thCoChua = tongHop([...dc, ...dcChuaQuyet]);
ok('UR chưa giao không vào mẫu số tỉ lệ', thCoChua.tiLeTrung === 50 && thCoChua.soChuaGiao === 1,
  JSON.stringify(thCoChua));
ok('Chưa có gì đã quyết -> tiLeTrung = null, không phải 0 (0 nghĩa là trượt sạch)',
  tongHop(dcChuaQuyet).tiLeTrung === null);

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures ? `${failures} thất bại` : 'TẤT CẢ PASS (0 thất bại)'} ===\n`);
process.exit(failures ? 1 : 0);
