// test-playbook.mjs — kho hướng dẫn lập trình thực chiến.
//
// Trọng tâm không phải "hàm có chạy không" mà là hai luật dễ trôi mất khi sửa về sau:
//   1. Ghi TỪNG BẢN GHI phải dùng chế độ bổ sung của emitter. Dùng nhầm chế độ mặc định thì
//      hướng dẫn thứ hai của một dự án xoá mất hướng dẫn thứ nhất — im lặng, không báo lỗi.
//   2. Tra cứu KHÔNG được lọc theo mã dự án. Lọc là chặn đúng công dụng của cả tính năng.

import { slugTieuDe, kiemEntry, entryToGraph, sqlDocPlaybook, ghepVaoUr, docPlaybook,
  sqlTimTheoKhoa, rowToEntry, gopEntry } from '../tools/lib/playbook.mjs';
import { loadSchema, graphTuObject, validateGraph, emitSql } from '../tools/lib/graph.mjs';

const schemaKind = (k) => loadSchema().nodeKinds[k];

let failures = 0;
const ok = (ten, dieuKien, chiTiet = '') => {
  if (dieuKien) { process.stdout.write(`PASS  ${ten}\n`); return; }
  failures++;
  process.stdout.write(`FAIL  ${ten}${chiTiet ? ' — ' + chiTiet : ''}\n`);
};

const MAU = {
  maDa: 'HOATP',
  sttRec: 'A000572010YC1',
  tieuDe: 'Thêm số thứ tự cho màn hình browse danh mục',
  cachLam: 'B1: mở controller.\nB2: thêm cột STT.',
  sysid: 'DMNhanVien',
  menuId: '11.00.00',
  nguonLt: 'HOATV',
};

process.stdout.write('\n=== 1. SLUG ỔN ĐỊNH ===\n');
ok('Cùng tiêu đề → cùng slug (lần ghi thứ hai SỬA, không đẻ dòng trùng)',
  slugTieuDe(MAU.tieuDe) === slugTieuDe(MAU.tieuDe));
ok('Bỏ dấu tiếng Việt, chỉ còn ascii + gạch nối',
  /^[a-z0-9-]+$/.test(slugTieuDe(MAU.tieuDe)), slugTieuDe(MAU.tieuDe));
ok('Tiêu đề rỗng vẫn ra khoá dùng được, không ra chuỗi rỗng',
  slugTieuDe('') === 'khong-tieu-de');

process.stdout.write('\n=== 2. LUẬT HỢP LỆ ===\n');
ok('Thiếu cachLam thì chặn', kiemEntry({ maDa: 'X', tieuDe: 'T', sysid: 'S' })
  .some((e) => e.includes('cachLam')));
ok('KHÔNG có neo tra cứu nào thì chặn — nếu không, dòng ghi vào sẽ không bao giờ được đọc lại',
  kiemEntry({ maDa: 'X', tieuDe: 'T', cachLam: 'C' }).some((e) => e.includes('sysid')));
ok('Chỉ có tags cũng được coi là có neo',
  kiemEntry({ maDa: 'X', tieuDe: 'T', cachLam: 'C', tags: ['browse'] }).length === 0);
ok('doTinCay ngoài 0..1 bị chặn',
  kiemEntry({ ...MAU, doTinCay: 5 }).some((e) => e.includes('doTinCay')));
ok('Entry đủ thì không lỗi', kiemEntry(MAU).length === 0, JSON.stringify(kiemEntry(MAU)));

process.stdout.write('\n=== 3. DỰNG NODE ===\n');
const g = entryToGraph(MAU, { boi: 'NGUYENTDH', ngay: '2026-08-18' });
const node = g.nodes[0];
ok('Scope là mã dự án — xuất xứ, để nhiều người ghi chung không đạp nhau', node.scope === 'HOATP');
ok('nguonLt và nhapBoi là HAI trường khác nhau (LT kể, PM ghi)',
  node.nguonLt === 'HOATV' && node.nhapBoi === 'NGUYENTDH');
ok('Người gõ có chủ đích → doTinCay mặc định 1, khác ExperienceFact do máy đoán',
  node.doTinCay === 1 && node.duyetBoiPm === 1);
ok('Có stt_rec thì dựng cạnh HAS_PLAYBOOK về Request',
  g.edges.length === 1 && g.edges[0].type === 'HAS_PLAYBOOK');
// Đã cắn thật: ghép sẵn `HOATP|` vào đầu Request thì phép JOIN lúc nạp không khớp dòng nào,
// cạnh lặng lẽ không được tạo, script vẫn báo chạy xong.
ok('Đầu Request viết bằng khoá TRẦN (Request không phải kind scoped)',
  g.edges[0].from === 'Request:A000572010YC1', g.edges[0].from);
ok('Đầu Playbook viết kèm scope (Playbook LÀ kind scoped)',
  g.edges[0].to === `Playbook:HOATP|${g.id}`, g.edges[0].to);
ok('Hai đầu cạnh theo đúng cờ `scoped` khai trong graph-schema.json',
  (schemaKind('Request').scoped ? g.edges[0].from.includes('|') : !g.edges[0].from.split(':')[1].includes('|'))
  && (schemaKind('Playbook').scoped ? g.edges[0].to.split(':')[1].includes('|') : true));
const gKhongUr = entryToGraph({ ...MAU, sttRec: '' }, { boi: 'X', ngay: '2026-08-18' });
ok('Không có stt_rec thì KHÔNG bịa cạnh (cạnh treo tệ hơn không có cạnh)',
  gKhongUr.edges.length === 0);

process.stdout.write('\n=== 4. GHI BỔ SUNG — KHÔNG ĐƯỢC XOÁ HƯỚNG DẪN CŨ ===\n');
const schema = loadSchema();
const gr = graphTuObject(schema, g);
const errs = [...gr.errors, ...validateGraph(schema, gr, { kindNgoai: ['Request'] })];
ok('Đồ thị hợp lệ (Request là node ngoài lô)', errs.length === 0,
  errs.map((e) => e.message).join('; '));

const sqlBoSung = emitSql(schema, gr, { scopes: g.scopes, boSung: true });
ok('Chế độ bổ sung KHÔNG sinh DELETE nào', !/^DELETE/m.test(sqlBoSung));
ok('Vẫn MERGE để gõ lại cùng tiêu đề thì SỬA dòng cũ',
  sqlBoSung.includes('MERGE dbo.[node_Playbook]'));
ok('Chèn cạnh có chống trùng — chạy hai lần không đẻ hai cạnh',
  /WHERE NOT EXISTS \(SELECT 1 FROM dbo\.\[HAS_PLAYBOOK\]/.test(sqlBoSung));

const sqlMacDinh = emitSql(schema, gr, { scopes: g.scopes });
ok('Chế độ mặc định VẪN xoá theo scope — không hồi quy đường graph build/experience',
  /^DELETE t FROM dbo\.\[node_Playbook\]/m.test(sqlMacDinh));

process.stdout.write('\n=== 5. TRA CỨU KHÔNG LỌC THEO DỰ ÁN ===\n');
const sql = sqlDocPlaybook({ sysids: ['DMNhanVien'], menuIds: ['11.00.00'] });
ok('Câu tra KHÔNG có điều kiện nào trên ma_da — đó là điểm khác cốt lõi so với log gợi ý',
  !/ma_da\s*(=|IN)/i.test(sql.replace(/RTRIM\(ma_da\) AS ma_da/, '')), sql);
ok('Lọc theo sysid và menu_id là OR — hai neo, khớp cái nào cũng ra',
  sql.includes("RTRIM(sysid) IN ('DMNhanVien') OR RTRIM(menu_id) IN ('11.00.00')"));
ok('Nháy đơn trong từ khoá bị escape, không vỡ câu',
  sqlDocPlaybook({ tuKhoa: "O'Brien" }).includes("O''Brien"));
ok('Không có điều kiện nào thì không sinh WHERE rỗng',
  !sqlDocPlaybook({}).includes('WHERE'));

process.stdout.write('\n=== 6. GHÉP VÀO UR ===\n');
const kho = [
  { key: 'HOATP|k1', sysid: 'DMNhanVien', menu_id: '11.00.00', stt_rec: 'A000572010YC1', tieuDe: 'A' },
  { key: 'CBVN|k2', sysid: '', menu_id: '11.00.00', stt_rec: 'A999', tieuDe: 'B' },
];
const capA = ghepVaoUr([{ stt_rec: 'A111', sysid: 'DMNhanVien', menu_id: '11.00.00' }], kho);
ok('Một UR khớp cả hai neo vẫn chỉ nhận mỗi hướng dẫn một lần',
  capA[0].huongDan.length === 2);
ok('Khớp sysid được đánh dấu là sysid, khớp menu_id đánh dấu là menu_id',
  capA[0].huongDan.find((x) => x.key === 'HOATP|k1')._khop === 'sysid'
  && capA[0].huongDan.find((x) => x.key === 'CBVN|k2')._khop === 'menu_id');

// Bản đầu BỎ QUA trường hợp này với lý do "nhắc lại kinh nghiệm của chính nó là nhiễu". Sai:
// UR ở DD thì việc CHƯA làm, và cách làm ghi cho nó là chỉ dẫn để bắt tay vào. Ca thật: HOATP
// UR10 có hướng dẫn ghi đích danh mà tab "Gợi ý kỹ thuật" trống trơn.
const capB = ghepVaoUr([{ stt_rec: 'A000572010YC1', sysid: 'DMNhanVien' }], kho);
ok('Hướng dẫn ghi cho CHÍNH UR đang xét PHẢI hiện — đó là chỗ cần nó nhất',
  capB.length === 1 && capB[0].huongDan.length === 1);
ok('…và được đánh dấu `chinh-ur`, không lẫn với kinh nghiệm mượn của dự án khác',
  capB[0].huongDan[0]._khop === 'chinh-ur');

const capC = ghepVaoUr([{ stt_rec: 'A000572010YC1', sysid: 'DMNhanVien', menu_id: '11.00.00' }], kho);
ok('Khớp chắc hơn thắng: cùng một hướng dẫn không bị xếp lại bằng khoá yếu',
  capC[0].huongDan.filter((h) => h.key === 'HOATP|k1').length === 1
  && capC[0].huongDan.find((h) => h.key === 'HOATP|k1')._khop === 'chinh-ur');
ok('Thứ tự: chinh-ur → sysid → menu_id',
  capC[0].huongDan.map((h) => h._khop).join('>') === 'chinh-ur>menu_id',
  capC[0].huongDan.map((h) => h._khop).join('>'));

ok('Câu tra có nhánh stt_rec — hướng dẫn chỉ neo bằng tags vẫn tới được chính UR nó viết cho',
  sqlDocPlaybook({ sttRecs: ['A1'] }).includes("RTRIM(stt_rec) IN ('A1')"));

ok('Kho rỗng → không ghép gì, không nổ', ghepVaoUr([{ stt_rec: 'X' }], []).length === 0);

process.stdout.write('\n=== 7. ĐƯỜNG TRUYỀN sqlcmd — HAI CÁI BẪY ĐÃ CẮN THẬT ===\n');
// Cả hai lỗi dưới đây chỉ lộ ra khi ghi entry ĐẦU TIÊN lên DB thật: đường ghi báo thành công,
// đường đọc trả rỗng/rác, và docPlaybook nuốt lỗi nên không ai biết vì sao.
ok('KHÔNG select cột `key` — bảng node không có cột đó, khoá là `id`',
  !/\[key\]/.test(sqlDocPlaybook({})));
ok('Cột văn xuôi được mã hoá xuống dòng — nếu không, cachLam nhiều dòng phá vỡ TSV của sqlcmd '
  + 'và MỘT bản ghi bị đọc thành nhiều dòng rác',
  sqlDocPlaybook({}).includes('CHAR(10)'));
ok('Cột văn xuôi được chia mảnh CAST NVARCHAR(200) — `-W` loại trừ `-y` nên nvarchar(max) bị '
  + 'cắt âm thầm ở 256',
  /CAST\(SUBSTRING\(.*AS NVARCHAR\(200\)\) AS cachLam_0/.test(sqlDocPlaybook({})));
ok('Mọi mảnh đều dưới ngưỡng 256 của sqlcmd',
  !/AS NVARCHAR\((25[6-9]|2[6-9]\d|[3-9]\d\d|\d{4,})\)/.test(sqlDocPlaybook({})));
ok('Có cột LEN để phát hiện nội dung vượt trần — không cắt im lặng',
  sqlDocPlaybook({}).includes('AS cachLam_len'));

const ghep = docPlaybook({ runGraphSql: () => ({ rows: [{
  id: 'X', cachLam_0: 'B1: một␛B2: hai', cachLam_len: '15',
  tieuDe_0: 'T', tags_0: '["a","b"]',
}] }) });
ok('Mảnh ghép lại và sentinel trả về xuống dòng thật',
  ghep[0].cachLam === 'B1: một\nB2: hai', JSON.stringify(ghep[0].cachLam));
ok('Cột mảnh (_0/_len) không rò ra kết quả trả về',
  !Object.keys(ghep[0]).some((k) => /_(\d+|len)$/.test(k)), Object.keys(ghep[0]).join(','));
ok('tags lưu chuỗi JSON được parse về mảng',
  Array.isArray(ghep[0].tags) && ghep[0].tags[1] === 'b');

const cut = docPlaybook({ runGraphSql: () => ({ rows: [{ cachLam_0: 'abc', cachLam_len: '9999' }] }) });
ok('Nội dung vượt trần thì NÓI RA, không trả bản cụt như thể đủ',
  cut[0].cachLam.includes('bị cắt') && cut[0].cachLam.includes('9999'));

process.stdout.write('\n=== 8. HỎNG THÌ TRẢ RỖNG CHO BÁO CÁO, NÉM CHO NGƯỜI GÕ ===\n');
ok('Không có runGraphSql → rỗng (đường báo cáo)', docPlaybook({}).length === 0);
ok('runGraphSql ném → rỗng, không làm sập báo cáo',
  docPlaybook({ runGraphSql: () => { throw new Error('lỗi gì đó'); } }).length === 0);
ok('Bảng chưa tồn tại vẫn là "kho rỗng" kể cả khi người gõ hỏi — không phải lỗi để đi dò',
  docPlaybook({ runGraphSql: () => { throw new Error('Invalid object name'); } },
    { neLoi: false }).length === 0);
let nem = false;
try {
  docPlaybook({ runGraphSql: () => { throw new Error('Invalid column name'); } }, { neLoi: false });
} catch { nem = true; }
ok('Câu SQL sai thì NÉM cho người gõ — im lặng trông y hệt kho rỗng, và họ sẽ gõ lại tưởng '
  + 'lần trước chưa ghi được', nem);
ok('tags hỏng không làm đổ cả kết quả',
  docPlaybook({ runGraphSql: () => ({ rows: [{ tags_0: 'không-phải-json' }] }) })[0].tags.length === 0);

process.stdout.write('\n=== 9. SỬA MỘT HƯỚNG DẪN — BA TRẠNG THÁI CỦA MỘT TRƯỜNG ===\n');
const cu = rowToEntry({
  ma_da: 'HOATP', stt_rec: 'A1', tieuDe: 'T', boiCanh: 'BC', cachLam: 'CL', canhBao: 'CB',
  menu_id: '01.00.00', sysid: '', bang: '', tags: ['a', 'b'], nguonLt: 'HOATV',
  nhapBoi: 'THANHNM', ngayNhap: '2026-08-01', doTinCay: 1,
});
ok('rowToEntry đổi tên cột SQL sang tên field entry (menu_id → menuId)',
  cu.menuId === '01.00.00' && cu.maDa === 'HOATP');

const chiThemSysid = gopEntry(cu, { sysid: 'DMChung' });
ok('Trường KHÔNG truyền thì giữ nguyên — đây là lý do `edit` tồn tại',
  chiThemSysid.canhBao === 'CB' && chiThemSysid.cachLam === 'CL' && chiThemSysid.nguonLt === 'HOATV');
ok('Trường được truyền thì thay', chiThemSysid.sysid === 'DMChung');

const xoaCanhBao = gopEntry(cu, { canhBao: '' });
ok('Chuỗi rỗng TƯỜNG MINH thì xoá — phải gõ ra, không xảy ra do quên',
  xoaCanhBao.canhBao === '' && xoaCanhBao.boiCanh === 'BC');

ok('undefined và chuỗi rỗng là HAI chuyện khác nhau',
  gopEntry(cu, { canhBao: undefined }).canhBao === 'CB'
  && gopEntry(cu, { canhBao: '' }).canhBao === '');

ok('tags truyền chuỗi thì tách theo dấu phẩy', gopEntry(cu, { tags: 'x, y' }).tags.join('|') === 'x|y');
ok('tags rỗng thì xoá sạch', gopEntry(cu, { tags: '' }).tags.length === 0);
ok('tags không truyền thì giữ nguyên', gopEntry(cu, {}).tags.join('|') === 'a|b');

// nhapBoi/ngayNhap = người và lúc ghi LẦN ĐẦU. Ai vừa sửa nằm ở cột audit capNhatBoi.
const nodeSua = entryToGraph(gopEntry(cu, { sysid: 'S' }), { boi: 'NGUYENTDH', ngay: '2026-08-18' }).nodes[0];
ok('Sửa KHÔNG ghi đè người ghi lần đầu', nodeSua.nhapBoi === 'THANHNM', nodeSua.nhapBoi);
ok('Sửa KHÔNG ghi đè ngày ghi lần đầu', nodeSua.ngayNhap === '2026-08-01', nodeSua.ngayNhap);
ok('Người vừa sửa nằm ở cột audit capNhatBoi', nodeSua.capNhatBoi === 'NGUYENTDH');

const nodeMoi = entryToGraph({ maDa: 'X', tieuDe: 'T', cachLam: 'C', sysid: 'S' },
  { boi: 'NGUYENTDH', ngay: '2026-08-18' }).nodes[0];
ok('Ghi mới thì nhapBoi/ngayNhap lấy của lần chạy này',
  nodeMoi.nhapBoi === 'NGUYENTDH' && nodeMoi.ngayNhap === '2026-08-18');

ok('sqlTimTheoKhoa lọc theo scope + slug — đường ĐỊNH VỊ, khác đường tra cứu để dùng lại',
  sqlTimTheoKhoa('HOATP', 'abc').includes("RTRIM(scope) = 'HOATP'")
  && sqlTimTheoKhoa('HOATP', 'abc').includes("LIKE '%|abc'"));
ok('sqlTimTheoKhoa cũng chia mảnh — nếu không thì đọc dòng cũ về đã cụt rồi ghi đè bản cụt',
  /AS cachLam_0/.test(sqlTimTheoKhoa('X', 'y')));
ok('Nháy đơn trong mã dự án bị escape', sqlTimTheoKhoa("O'X", 'y').includes("O''X"));

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures === 0 ? 'TẤT CẢ PASS' : 'CÓ LỖI'} (${failures} thất bại) ===\n`);
process.exit(failures === 0 ? 0 : 1);
