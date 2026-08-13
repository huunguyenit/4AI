// sql.mjs — chạy SQL trên database của một program FBO.
//
// HỢP ĐỒNG BẢO MẬT: module này đọc connection string từ Web.config và KHÔNG BAO GIỜ
// trả nó ra ngoài. Không có hàm nào ở đây trả về chuỗi kết nối, user hay password —
// kể cả trong message lỗi. Lỗi từ sqlcmd được lọc trước khi trả về.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readSource, decodeSource } from './encoding.mjs';

const SECRET_SHAPES = [
  /(?:password|pwd)\s*=\s*[^;"'\s]+/gi,
  /(?:user\s*id|uid)\s*=\s*[^;"'\s]+/gi,
  /(?:data\s*source|server)\s*=\s*[^;"'\s]+/gi,
  /(?:initial\s*catalog)\s*=\s*[^;"'\s]+/gi,
];

/** Bịt mọi mảnh giống connection string trước khi cho chuỗi rời khỏi module này. */
export function redact(text) {
  let out = String(text ?? '');
  for (const re of SECRET_SHAPES) out = out.replace(re, (m) => `${m.split('=')[0]}=***`);
  return out;
}

/**
 * Bịt theo GIÁ TRỊ THẬT của kết nối, không theo hình dạng.
 *
 * `redact` chỉ bắt được `server=...`, mà sqlcmd báo lỗi kiểu `Server FSGSERVER\SQL2014EX,
 * Line 3` — không có dấu bằng nên lọt lưới. Ở đây ta biết chính xác chuỗi cần giấu.
 */
function scrub(text, conn) {
  let out = redact(text);
  for (const secret of [conn.password, conn.server, conn.user]) {
    if (typeof secret === 'string' && secret.length >= 3) {
      out = out.split(secret).join('***');
    }
  }
  // Chưa đủ: Web.config có thể trỏ tới alias, còn SQL Server tự khai TÊN INSTANCE THẬT trong
  // message (`Msg 208 … Server FSGSERVER\SQL2014EX, Line 3`). Tên đó không nằm ở đâu để mà
  // đối chiếu, nên chặn theo pattern của sqlcmd.
  return out.replace(/\bServer\s+[^,\n]+,/gi, 'Server ***,');
}

function parseConnStringPairs(cs) {
  const out = {};
  for (const part of cs.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

function readWebConfigText(programPath) {
  const candidates = [
    path.join(programPath, 'Web.config'),
    path.join(programPath, '..', 'Web.config'),
  ];
  const webConfig = candidates.find((p) => fs.existsSync(p));
  if (!webConfig) {
    throw new Error(`Không tìm thấy Web.config cho program: ${programPath}`);
  }
  return readSource(webConfig).text;
}

/** FBO để `%Database` khi tên database do runtime quyết định, không nằm trong Web.config. */
function isPlaceholder(database) {
  return database === '' || /^%/.test(database);
}

/**
 * Tách một leg connectionStrings thành THAM SỐ KẾT NỐI — chỉ dùng nội bộ, không expose.
 * @returns {{server, database, user, password, trusted}}
 */
function connFromWebConfig(text, dbType) {
  const wanted = dbType === 'sys' ? 'sysConnectionString' : 'appConnectionString';
  const re = new RegExp(`<add\\s+name\\s*=\\s*["']${wanted}["'][^>]*connectionString\\s*=\\s*["']([^"']+)["']`, 'i');
  const m = re.exec(text);
  if (!m) {
    throw new Error(`Web.config không có connectionStrings entry \`${wanted}\`.`);
  }
  const p = parseConnStringPairs(m[1]);
  return {
    server: p['data source'] ?? p.server ?? '',
    database: p['initial catalog'] ?? p.database ?? '',
    user: p['user id'] ?? p.uid ?? '',
    password: p.password ?? p.pwd ?? '',
    trusted: /^(true|yes|sspi)$/i.test(p['integrated security'] ?? p['trusted_connection'] ?? ''),
  };
}

/** Leg sys: placeholder thì rớt về appSetting `sysDatabaseName`. */
function resolveSysConn(programPath, databaseOverride) {
  const text = readWebConfigText(programPath);
  const conn = connFromWebConfig(text, 'sys');
  if (databaseOverride) {
    conn.database = databaseOverride;
    return conn;
  }
  if (isPlaceholder(conn.database)) {
    const m = /<add\s+key\s*=\s*["']sysDatabaseName["']\s+value\s*=\s*["']([^"']+)["']/i.exec(text);
    if (m) conn.database = m[1];
  }
  if (isPlaceholder(conn.database)) {
    throw new Error(
      'Web.config để placeholder cho database hệ thống và không có appSetting `sysDatabaseName` — ' +
      'truyền tham số `database` để chỉ rõ.');
  }
  return conn;
}

// Ánh xạ entity → database app đổi rất hiếm; cache để mỗi query app không tốn thêm một lần spawn sqlcmd.
const entityDbCache = new Map();

/**
 * Leg app dùng `%Database`: tên database thật KHÔNG có trong Web.config — nó nằm ở bảng `entity`
 * của database hệ thống, cột `cdata`. Đó là nơi FBO ghi ánh xạ entity → database dữ liệu.
 */
function lookupEntityDatabase(sqlcmd, programPath, entityCode) {
  const key = `${programPath}|${entityCode ?? ''}`;
  if (entityDbCache.has(key)) return entityDbCache.get(key);

  const sys = resolveSysConn(programPath);
  const where = entityCode ? ` WHERE code = '${sqlLiteral(entityCode)}'` : '';
  const res = execSql(sqlcmd, sys, `SELECT code, cdata FROM entity${where} ORDER BY code`, { maxRows: 100 });
  const rows = res.rows
    .map((r) => ({ code: String(r.code ?? '').trim(), cdata: String(r.cdata ?? '').trim() }))
    .filter((r) => r.cdata !== '');

  if (rows.length === 0) {
    throw new Error(entityCode
      ? `Database hệ thống \`${sys.database}\` không có entity \`${entityCode}\` (hoặc cdata rỗng).`
      : `Bảng entity của database hệ thống \`${sys.database}\` không có dòng nào có cdata — ` +
        'không suy ra được database app. Truyền tham số `database`.');
  }
  if (rows.length > 1 && !entityCode) {
    throw new Error(
      `Program này có nhiều entity: ${rows.map((r) => `${r.code}=${r.cdata}`).join(', ')}. ` +
      'Truyền `entity` (mã) hoặc `database` (tên) để chọn — không đoán hộ.');
  }

  entityDbCache.set(key, rows[0].cdata);
  return rows[0].cdata;
}

/** Leg app: override > entity lookup > giá trị ghi thẳng trong Web.config. */
function resolveAppConn(sqlcmd, programPath, databaseOverride, entityCode) {
  const conn = connFromWebConfig(readWebConfigText(programPath), 'app');
  if (databaseOverride) {
    conn.database = databaseOverride;
    return conn;
  }
  // `entity` truyền tay là chỉ định có chủ đích — nó thắng cả tên ghi cứng trong Web.config.
  if (entityCode || isPlaceholder(conn.database)) {
    conn.database = lookupEntityDatabase(sqlcmd, programPath, entityCode);
  }
  return conn;
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function listDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch { return []; }
}

/** Duyệt PATH bằng tay — không spawn `where`, vì `where` cũng cần PATH mới tìm thấy. */
function fromPathEnv(bin) {
  const dirs = (process.env.PATH ?? process.env.Path ?? '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE').split(';').filter(Boolean)
    : [''];
  for (const d of dirs) {
    for (const e of exts) {
      const p = path.join(d, bin + e);
      if (isFile(p)) return p;
    }
  }
  return null;
}

/** Thư mục cài quen thuộc của sqlcmd trên Windows, bản mới trước bản cũ. */
function wellKnownWindows() {
  const roots = [process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
    .filter(Boolean);
  const byVersionDesc = (names) =>
    names.filter((n) => /^\d+$/.test(n)).sort((a, b) => Number(b) - Number(a));
  const out = [];
  for (const root of roots) {
    // go-sqlcmd (winget / MSI đời mới).
    out.push(path.join(root, 'sqlcmd', 'sqlcmd.exe'));
    const mssql = path.join(root, 'Microsoft SQL Server');
    // ODBC Client SDK: ...\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE
    const odbc = path.join(mssql, 'Client SDK', 'ODBC');
    for (const v of byVersionDesc(listDirs(odbc))) {
      out.push(path.join(odbc, v, 'Tools', 'Binn', 'SQLCMD.EXE'));
    }
    // SQL Server Tools: ...\Microsoft SQL Server\160\Tools\Binn\SQLCMD.EXE
    for (const v of byVersionDesc(listDirs(mssql))) {
      out.push(path.join(mssql, v, 'Tools', 'Binn', 'SQLCMD.EXE'));
    }
    out.push(path.join(mssql, 'Tools', 'Binn', 'SQLCMD.EXE'));
  }
  if (process.env.LOCALAPPDATA) {
    out.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'sqlcmd.exe'));
  }
  return out;
}

let sqlcmdCache;

/**
 * Định vị sqlcmd. Client MCP hay spawn server với PATH tối giản, nên PATH KHÔNG được
 * là nguồn duy nhất: thử biến môi trường chỉ định tay, rồi PATH, rồi thư mục cài quen thuộc.
 * @returns {string|null} đường dẫn tuyệt đối, hoặc null nếu máy thật sự không có sqlcmd.
 */
export function findSqlcmd() {
  if (sqlcmdCache !== undefined) return sqlcmdCache;

  const pinned = process.env.FBO_SQLCMD;
  if (pinned && isFile(pinned)) return (sqlcmdCache = pinned);

  const onPath = fromPathEnv('sqlcmd');
  if (onPath) return (sqlcmdCache = onPath);

  if (process.platform === 'win32') {
    for (const c of wellKnownWindows()) {
      if (isFile(c)) return (sqlcmdCache = c);
    }
  } else {
    for (const c of ['/opt/mssql-tools18/bin/sqlcmd', '/opt/mssql-tools/bin/sqlcmd', '/usr/local/bin/sqlcmd']) {
      if (isFile(c)) return (sqlcmdCache = c);
    }
  }

  return (sqlcmdCache = null);
}

/**
 * Parse các dòng thân của output `sqlcmd -s\t -W` thành mảng object.
 *
 * KHÔNG được bỏ dòng trắng ở đây: một dòng kết quả mà mọi cột đều rỗng thì in ra ĐÚNG LÀ dòng
 * trắng (1 cột) hoặc chỉ toàn tab (nhiều cột) — bỏ nó đi là mất dòng dữ liệu thật mà không ai
 * biết. Dòng trắng thừa ở cuối output đã bị cắt trước khi vào đây.
 */
function parseTsv(bodyLines, columns) {
  const rows = [];
  for (const line of bodyLines) {
    if (/^\(\d+ rows? affected\)$/i.test(line.trim())) continue;
    const cells = line.split('\t');
    if (columns.length > 0 && cells.length === columns.length) {
      rows.push(Object.fromEntries(columns.map((c, i) => [c, cells[i] === 'NULL' ? null : cells[i]])));
    } else if (line.trim() !== '') {
      rows.push(cells);   // số cột không khớp: trả thô còn hơn im lặng nuốt
    }
  }
  return rows;
}

/**
 * Chạy một câu SQL. KHÔNG bao giờ trả connection string.
 * @param {{programPath: string, sql: string, dbType?: 'app'|'sys', database?: string, entity?: string, maxRows?: number, timeoutMs?: number}} p
 */
export function runSql({ programPath, sql, dbType = 'app', database, entity, maxRows = 100, timeoutMs = 30000 }) {
  const sqlcmd = findSqlcmd();
  if (!sqlcmd) {
    const pinned = process.env.FBO_SQLCMD;
    throw new Error(
      'Không tìm thấy sqlcmd. Đã thử: ' +
      (pinned ? `biến FBO_SQLCMD (${pinned} — không phải file), ` : 'biến FBO_SQLCMD (chưa đặt), ') +
      'PATH của tiến trình MCP, và các thư mục cài quen thuộc (Client SDK\\ODBC, SQL Server Tools, go-sqlcmd). ' +
      'Nếu máy ĐÃ cài sqlcmd thì đây là chuyện PATH của tiến trình MCP, không phải chuyện thiếu phần mềm: ' +
      'đặt FBO_SQLCMD trỏ thẳng vào sqlcmd.exe trong mcp/servers.json (khối env) rồi sync và khởi động lại client. ' +
      'Nếu máy chưa cài, cài "Microsoft ODBC Driver / Client SDK" hoặc SQL Server Command Line Utilities.');
  }
  const conn = dbType === 'sys'
    ? resolveSysConn(programPath, database)
    : resolveAppConn(sqlcmd, programPath, database, entity);
  return execSql(sqlcmd, conn, sql, { maxRows, timeoutMs });
}

let outFileSeq = 0;

/** Chạy SQL trên một kết nối ĐÃ phân giải. Nội bộ — conn không bao giờ rời khỏi module này. */
function execSql(sqlcmd, conn, sql, { maxRows = 100, timeoutMs = 30000 } = {}) {
  const header = `SET NOCOUNT ON;\nSET ROWCOUNT ${Math.max(1, Math.min(maxRows, 10000))};\n`;
  const outFile = path.join(os.tmpdir(), `4ai-fbo-sql-${process.pid}-${outFileSeq++}.txt`);
  const args = [
    '-S', conn.server,
    '-d', conn.database,
    // -W (bỏ khoảng trắng thừa) loại trừ nhau với -Y VÀ -y; -W là thứ làm parseTsv chạy được.
    //
    // Hệ quả phải biết: cột kiểu ĐỘ DÀI THAY ĐỔI (nvarchar(max)/varchar(max)/text/xml) bị
    // sqlcmd cắt ở 256 ký tự theo mặc định của -y, và vì -y không dùng chung được với -W nên
    // KHÔNG sửa được ở đây. Cắt này ÂM THẦM: không cảnh báo, không cờ truncated. Đo trên
    // frpost.noi_dung: topic 28934 có 11.252 ký tự thật, chỉ nhận về 4.901.
    //
    // Cách xử lý là ở CÂU TRUY VẤN, không phải ở đây: CAST cột MAX sang nvarchar(4000) và
    // SELECT kèm LEN() thật để caller đối chiếu, thấy hụt thì báo. Xem tools/lib/forum.mjs.
    // Cột khai độ dài rõ (nvarchar(4000) như nbphyc.noi_dung) không dính.
    '-s', '\t', '-W', '-w', '65535',
    // Ép codepage ĐẦU RA sang UTF-8. Mặc định sqlcmd in theo codepage OEM của console —
    // codepage đó không biểu diễn được tiếng Việt nên nhãn bị thành '?' NGAY TRONG sqlcmd,
    // mất trước khi byte tới đây; không cách nào decode ngược. Chỉ đặt o: chứ không đặt i:,
    // để không đụng cách sqlcmd đọc câu lệnh truyền qua -Q.
    // Kết quả đi qua FILE chứ không qua stdout, và ép codepage ra UTF-8.
    //
    // Lý do: `-f o:65001` chỉ áp cho output file; ra stdout thì sqlcmd vẫn chuyển theo codepage
    // console, mà codepage đó không biểu diễn nổi tiếng Việt — "Chương trình quản lý" thành
    // "Chuong trnh qu?n ly" NGAY TRONG sqlcmd. Mất trước khi byte tới đây thì không decode
    // ngược được, nên phải chặn ở đầu ra chứ không phải ở đầu đọc.
    // Đo trên máy: stdout mặc định ra `43 68 75 6f` (Chuo, mất dấu); `-f o:65001 -o` ra
    // `43 68 c6 b0 c6 a1` (Chươ, đúng).
    '-f', 'o:65001', '-o', outFile,
    '-b', '-r', '1',
    '-l', String(Math.ceil(timeoutMs / 1000)),
    '-Q', header + sql,
  ];
  if (conn.trusted || conn.user === '') args.push('-E');
  else args.push('-U', conn.user, '-P', conn.password);

  let res, stdout;
  try {
    res = spawnSync(sqlcmd, args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (res.error) throw new Error(`Không chạy được sqlcmd: ${redact(res.error.message)}`);
    // readSource cắt BOM rồi decode utf-8 strict, rớt về cp1258 — đủ an toàn cho cả sqlcmd đời
    // cũ lỡ không hiểu `-f o:`.
    stdout = fs.existsSync(outFile) ? readSource(outFile).text : '';
  } finally {
    try { fs.rmSync(outFile, { force: true }); } catch { /* file tạm, dọn được thì dọn */ }
  }

  // `-r 1` đẩy message lỗi sang stderr, nên -o không nuốt mất lỗi.
  const stderr = scrub(res.stderr ? decodeSource(res.stderr).text : '', conn).trim();
  if (res.status !== 0) {
    throw new Error(`SQL lỗi (exit ${res.status}): ${stderr || scrub(stdout, conn).slice(0, 800)}`);
  }

  const lines = stdout.split(/\r?\n/);
  // Cắt ĐÚNG MỘT phần tử rỗng cuối — đó là newline kết thúc output, không phải dòng dữ liệu.
  // Cắt tham hơn thì một dòng kết quả toàn cột rỗng nằm cuối bảng sẽ biến mất.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const headerIdx = lines.findIndex((l) => l.trim() !== '');
  const headerLine = headerIdx === -1 ? '' : lines[headerIdx];
  const columns = headerLine.includes('\t') ? headerLine.split('\t') : [headerLine].filter(Boolean);
  const body = lines.slice(headerIdx + 1)
    .filter((l) => !/^-+(\t-+)*$/.test(l.trim()));
  const rows = parseTsv(body, columns);

  return {
    database: conn.database,   // tên DB là an toàn; server/user/password thì không
    columns,
    rowCount: rows.length,
    rows: rows.slice(0, maxRows),
    truncated: rows.length > maxRows,
    stderr: stderr || undefined,
  };
}

/** Escape literal string trước khi nhét vào SQL text. */
export function sqlLiteral(s) {
  return String(s).replace(/'/g, "''");
}

/** SQL soạn sẵn để soi một object (table / view / proc) — không cần người dùng tự viết. */
export function objectSql(objectName) {
  const safe = sqlLiteral(objectName);
  return `
IF OBJECT_ID('${safe}') IS NULL
  SELECT 'NOT_FOUND' AS result, '${safe}' AS object_name;
ELSE IF OBJECTPROPERTY(OBJECT_ID('${safe}'), 'IsTable') = 1
     OR OBJECTPROPERTY(OBJECT_ID('${safe}'), 'IsView') = 1
  SELECT c.column_id AS ord, c.name AS column_name, t.name AS data_type,
         c.max_length, c.precision, c.scale, c.is_nullable
  FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
  WHERE c.object_id = OBJECT_ID('${safe}') ORDER BY c.column_id;
ELSE
  SELECT definition FROM sys.sql_modules WHERE object_id = OBJECT_ID('${safe}');`.trim();
}
