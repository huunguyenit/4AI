// ddl.mjs — SINH script SQL theo chuẩn FBO từ đặc tả có cấu trúc.
//
// Vì sao tồn tại: trước đây quy ước DDL chỉ nằm ở skill dưới dạng chỉ dẫn cho agent, nên
// kết quả lúc đúng lúc sai — hai lượt chạy thật ngày 2026-08-10 sinh ra văn xuôi, gán tiền
// tố zc cho bảng trung gian, và bịa ra nhu cầu cấp số hiệu cho màn hình đã có sẵn. Luật
// nào cưỡng chế được thì đưa vào đây; agent chỉ cấp DỮ LIỆU (tên bảng, danh sách cột), còn
// cú pháp và quy ước do code sinh.
//
// Hàm ở đây là thuần: nhận spec, trả chuỗi SQL, ném lỗi khi spec vi phạm luật. Không đọc
// file, không chạm DB, không ghi đĩa.

const AUDIT_COLUMNS = [
  { name: 'status', type: 'char(1)' },
  { name: 'user_id0', type: 'int' },
  { name: 'user_id2', type: 'int' },
  { name: 'datetime0', type: 'datetime' },
  { name: 'datetime2', type: 'datetime' },
];

const isZc = (t) => /^zc/i.test(String(t ?? ''));

function requireColumns(cols, table) {
  if (!Array.isArray(cols) || !cols.length) {
    throw new Error(`bảng \`${table}\`: thiếu danh sách cột — không sinh CREATE TABLE rỗng`);
  }
  for (const [i, c] of cols.entries()) {
    if (!c?.name) throw new Error(`bảng \`${table}\`: cột #${i} thiếu \`name\``);
    if (!c?.type) throw new Error(`bảng \`${table}\`: cột \`${c.name}\` thiếu \`type\` — kiểu dữ liệu không được để trống, sai kiểu là mất dữ liệu mà không báo lỗi`);
  }
}

/** Một dòng cột, canh lề để đọc như bảng. `?` đánh dấu kiểu do người đề xuất, chưa có trong nguồn. */
function columnLines(cols) {
  const w = Math.max(...cols.map((c) => c.name.length));
  return cols.map((c) => {
    const nul = c.notNull ? 'NOT NULL' : 'NULL';
    const cmt = [c.deXuatKieu ? 'KIỂU ĐỀ XUẤT — nguồn không ghi' : null, c.note].filter(Boolean).join('; ');
    return `  ${c.name.padEnd(w)} ${c.type} ${nul},${cmt ? `   -- ${cmt}` : ''}`;
  });
}

function block(marker, header, body) {
  return [`-- DB: ${marker}`, ...header.map((l) => `-- ${l}`), ...body].join('\n');
}

/**
 * Bảng trong DB TRUNG GIAN (staging). Giữ nguyên tên hệ nguồn, KHÔNG zc, không ép audit.
 * @param {{table:string, columns:Array, pk?:string[], moTa?:string, nguon?:string, canhBao?:string[]}} spec
 */
export function stagingTable(spec) {
  const { table, columns, pk = [], moTa, nguon, canhBao = [] } = spec;
  if (!table) throw new Error('stagingTable: thiếu `table`');
  if (isZc(table)) {
    throw new Error(`stagingTable \`${table}\`: bảng ở DB trung gian KHÔNG được đặt tiền tố zc — zc chỉ dành cho DB App của FBO. Giữ nguyên tên hệ nguồn để ETL ánh xạ 1-1.`);
  }
  requireColumns(columns, table);
  const header = [
    moTa ? `${moTa}` : `Bảng staging \`${table}\`.`,
    'DB trung gian → giữ nguyên tên hệ nguồn, KHÔNG tiền tố zc, không ép 5 cột audit của FBO.',
    ...(nguon ? [`Nguồn cột: ${nguon}`] : []),
    ...canhBao,
  ];
  const lines = columnLines(columns);
  const body = [`CREATE TABLE ${table} (`];
  if (pk.length) {
    body.push(lines.join('\n'));
    body.push(`  CONSTRAINT PK_${table} PRIMARY KEY (${pk.join(', ')})`);
  } else {
    const last = lines.pop().replace(/,(\s*--.*)?$/, '$1');
    body.push([...lines, last].join('\n'));
  }
  body.push(')');
  return block('trung-gian', header, body);
}

/**
 * Danh mục trong DB App của FBO. Ép tiền tố zc và tự bổ sung đủ 5 cột audit.
 * @param {{table:string, columns:Array, pk?:string[], moTa?:string, nguon?:string, canhBao?:string[]}} spec
 */
export function danhMucTable(spec) {
  const { table, columns, pk = [], moTa, nguon, canhBao = [] } = spec;
  if (!table) throw new Error('danhMucTable: thiếu `table`');
  if (!isZc(table)) {
    throw new Error(`danhMucTable \`${table}\`: danh mục customize trong DB App BẮT BUỘC tiền tố zc (z = đẩy xuống cuối khi sắp xếp, c = customize).`);
  }
  requireColumns(columns, table);
  const co = new Set(columns.map((c) => c.name.toLowerCase()));
  const themAudit = AUDIT_COLUMNS.filter((a) => !co.has(a.name));
  const full = [...columns, ...themAudit];
  const header = [
    moTa ? `${moTa}` : `Danh mục customize \`${table}\`.`,
    'DB App của FBO → tiền tố zc bắt buộc; 5 cột audit (status, user_id0, user_id2, datetime0, datetime2) do bộ sinh tự thêm.',
    ...(nguon ? [`Nguồn cột: ${nguon}`] : []),
    ...canhBao,
  ];
  const lines = columnLines(full);
  const body = [`CREATE TABLE ${table} (`];
  if (pk.length) {
    body.push(lines.join('\n'));
    body.push(`  CONSTRAINT PK_${table} PRIMARY KEY (${pk.join(', ')})`);
  } else {
    const last = lines.pop().replace(/,(\s*--.*)?$/, '$1');
    body.push([...lines, last].join('\n'));
  }
  body.push(')');
  return block('app', header, body);
}

/**
 * Họ bảng chứng từ MỚI (m/d/i) + đăng ký sysgendata. Chỉ dùng khi thật sự cần một loại
 * chứng từ chưa tồn tại — màn hình đã có sẵn thì KHÔNG dùng hàm này.
 * @param {{so:string, ten:string, mau?:{ma:string,sysid:string,bang:string}, soTrong?:string[], canhBao?:string[]}} spec
 */
export function voucherFamily(spec) {
  const { so, ten, mau, soTrong = [], canhBao = [] } = spec;
  if (!/^\d{2}$/.test(String(so ?? ''))) {
    throw new Error(`voucherFamily: \`so\` phải là 2 chữ số, nhận được ${JSON.stringify(so)}`);
  }
  if (soTrong.length && !soTrong.includes(so)) {
    throw new Error(`voucherFamily: số hiệu ${so} KHÔNG nằm trong danh sách số trống đã quét (${soTrong.join(',')}) — chọn số khác hoặc quét lại DB App.`);
  }
  const header = [
    `Chứng từ mới: ${ten}. Số hiệu ${so}.`,
    ...(mau ? [`Sao chép cấu trúc từ ${mau.ma} (${mau.sysid}, ${mau.bang}) — chứng từ chuẩn cùng dạng đang chạy.`] : []),
    ...(soTrong.length ? [`Số hiệu còn trống trên DB App (đã quét): ${soTrong.join(',')}`] : []),
    'Mốc partition lấy từ dmstt, không hardcode ngày.',
    ...canhBao,
  ];
  const body = [
    'DECLARE @d1 SMALLDATETIME, @d2 SMALLDATETIME',
    'SELECT @d1 = ngay_gh1, @d2 = ngay_gh2 FROM dmstt',
    '',
    ...['m', 'd', 'i'].map((p) =>
      `EXEC FastBusiness$App$Dynamic$AddTable '${p}${so}$000000', '${p}${so}$', '', 'Voucher$', 1, @d1, @d2, 1`),
    '',
    ...['m', 'd', 'i'].flatMap((p) => [
      `IF NOT EXISTS(SELECT 1 FROM sysgendata WHERE basetable = '${p}${so}$000000')`,
      `INSERT INTO sysgendata (basetable,primetable,refprimetable,primefilegroup,type,status) VALUES(N'${p}${so}$000000',N'${p}${so}$',N'',N'Voucher',1,N'1')`,
    ]),
  ];
  return block('app', header, body);
}

/**
 * Thêm cột vào một họ bảng đã có partition. Sinh vòng lặp áp cho MỌI partition — đây là
 * chỗ người viết tay hay quên, nên để code lo.
 * @param {{family:string, column:string, type:string, nhan?:string, ma?:string, sysid?:string,
 *          soBang?:number, slotTrong?:string[], canhBao?:string[]}} spec
 */
export function addColumn(spec) {
  const { family, column, type, nhan, ma, sysid, soBang, slotTrong = [], canhBao = [] } = spec;
  if (!family) throw new Error('addColumn: thiếu `family` (vd m31)');
  if (!column) throw new Error('addColumn: thiếu `column`');
  if (!type) throw new Error(`addColumn \`${column}\`: thiếu \`type\``);
  if (/\$/.test(family)) {
    throw new Error(`addColumn: \`family\` phải là tiền tố không có \`$\` (vd m31), nhận được ${family}`);
  }
  const header = [
    `Thêm cột \`${column}\` ${type} vào ${nhan ?? family}${ma ? ` (${ma}` : ''}${sysid ? ` / ${sysid}` : ''}${ma ? ')' : ''}.`,
    ...(soBang ? [`Họ bảng ${family}$ hiện có ${soBang} bảng (000000 + partition + log) → ALTER phải áp cho TẤT CẢ, không chỉ $000000.`] : []),
    ...(slotTrong.length ? [
      `Cân nhắc TRƯNG DỤNG slot dự phòng sẵn có thay vì thêm cột mới: ${slotTrong.join(', ')}.`,
      `Slot chỉ được coi là trống SAU KHI soi hết command SQL trong controller${sysid ? ' ' + sysid : ''} xác nhận chưa ai chiếm.`,
    ] : []),
    'Script dưới idempotent: bảng nào đã có cột thì bỏ qua.',
    ...canhBao,
  ];
  const body = [
    "DECLARE @sql NVARCHAR(MAX) = N''",
    `SELECT @sql = @sql + N'ALTER TABLE [' + t.TABLE_NAME + N'] ADD ${column} ${type} NULL;' + CHAR(13)`,
    'FROM INFORMATION_SCHEMA.TABLES t',
    `WHERE t.TABLE_NAME LIKE '${family}$%'`,
    '  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS c',
    `                  WHERE c.TABLE_NAME = t.TABLE_NAME AND c.COLUMN_NAME = '${column}')`,
    'EXEC sp_executesql @sql',
  ];
  return block('app', header, body);
}

const KIND = {
  staging: stagingTable,
  'danh-muc': danhMucTable,
  'chung-tu-moi': voucherFamily,
  'them-cot': addColumn,
};

/**
 * Điểm vào dùng trong payload: `{ "kind": "staging", ... }` → chuỗi SQL.
 * Ném lỗi kèm lý do khi spec sai luật — người gọi bắt và báo lên báo cáo.
 */
export function renderDdl(spec) {
  const fn = KIND[spec?.kind];
  if (!fn) {
    throw new Error(`\`ddl.kind\` không hợp lệ: ${JSON.stringify(spec?.kind)} — chọn một trong ${Object.keys(KIND).join(', ')}`);
  }
  return fn(spec);
}

export const DDL_KINDS = Object.keys(KIND);
