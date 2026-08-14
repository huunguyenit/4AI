// sql.mjs — chạy SQL trên database của một program FBO.
//
// HỢP ĐỒNG BẢO MẬT: module này đọc connection string từ env và KHÔNG BAO GIỜ
// trả nó ra ngoài. Không có hàm nào ở đây trả về chuỗi kết nối, user hay password —
// kể cả trong message lỗi. Lỗi từ sqlcmd được lọc trước khi trả về.
//
// HAI LOẠI DATABASE, HAI ĐƯỜNG PHÂN GIẢI KHÁC HẲN NHAU:
//
//   QLDA (DB nội bộ của công ty — nbdmda/nbphyc/frpost/userinfo2)
//     → env `QLDA_APP_CONNECTION`/`QLDA_SYS_CONNECTION`, rồi `data/qlda.local.json`.
//       Web.config chỉ là chốt cuối. Xem `data/qlda.json → databases.qlda.resolveOrder`.
//
//   DA — chương trình của KHÁCH (đường dẫn lấy từ nbdmda.dir_pro_web)
//     → Web.config của chính program đó. Mỗi khách một server/database riêng, không có
//       cách nào khai trước bằng env, và cũng KHÔNG được lấy nhầm kết nối QLDA.
//
// Phân biệt bằng `programPath`: khớp với `databases.qlda.path` thì là QLDA. Xem laQldaProgram().

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readSource, decodeSource } from './encoding.mjs';
import { dataRoot } from './index.mjs';
import { loadQldaConfig } from '../../../src/database/qlda-metadata.mjs';

/** Gốc hub tính từ chính file này (mcp/fbo/lib/ → lên ba cấp), không phụ thuộc cwd. */
const MODULE_HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

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

/**
 * Chưa có tên database thật. Hai nguồn placeholder khác nhau, cùng ý nghĩa "chưa biết":
 *  - `%Database` — FBO để vậy khi tên do runtime quyết định, không nằm trong Web.config.
 *  - `{QldaDatabaseName}` — token trong data/qlda.json, chờ máy này gán từ qlda.local.json.
 *    File đó đi kèm gói phân phối công khai nên không được mang tên hạ tầng nội bộ.
 */
function isPlaceholder(database) {
  const s = String(database ?? '').trim();
  return s === '' || /^%/.test(s) || /^\{[A-Za-z0-9_]+\}$/.test(s);
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
  return connFromString(m[1]);
}

// ---------------------------------------------------------------- QLDA (DB nội bộ)

/** Tham số kết nối từ một chuỗi connection string — dùng chung cho env và local file. */
function connFromString(cs) {
  const p = parseConnStringPairs(cs);
  return {
    server: p['data source'] ?? p.server ?? '',
    database: p['initial catalog'] ?? p.database ?? '',
    user: p['user id'] ?? p.uid ?? '',
    password: p.password ?? p.pwd ?? '',
    trusted: /^(true|yes|sspi)$/i.test(p['integrated security'] ?? p['trusted_connection'] ?? ''),
  };
}

/**
 * So đường dẫn program KHÔNG phân biệt hoa thường, dấu gạch xuôi/ngược và gạch thừa ở cuối.
 * `\\SERVER\Share\SRC-ONL\` và `//server/share/fsgsrc-onl` là một chỗ — so chuỗi thô sẽ
 * trượt và lặng lẽ rơi xuống Web.config, tức là mất tác dụng của env mà không ai biết.
 */
function chuanHoaDuongDan(p) {
  return String(p ?? '').trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

/** Khối `databases.qlda` của data/qlda.json. Trả null khi hub không có file cấu hình. */
function qldaConfig() {
  return loadQldaConfig()?.databases?.qlda ?? null;
}

/**
 * Program này có phải chính chương trình QLDA nội bộ không.
 *
 * `path` còn là token `{QldaProgramPath}` nghĩa là máy này CHƯA khai đường dẫn QLDA — coi như
 * không phải QLDA, để mọi program rơi về đường Web.config của chính nó. Không so sánh với
 * token: khớp nhầm thì một chương trình khách sẽ bị lấy kết nối QLDA, sai database mà vẫn chạy.
 */
function laQldaProgram(programPath) {
  const khai = qldaConfig()?.path;
  if (!khai || isPlaceholder(khai)) return false;
  return chuanHoaDuongDan(programPath) === chuanHoaDuongDan(khai);
}

/**
 * Đọc chuỗi kết nối QLDA từ `data/qlda.local.json`.
 *
 * File này ĐÃ gitignore và bị `4ai check` soi — giá trị thật chỉ được nằm ở đây hoặc ở env.
 * Đọc thẳng trong sql.mjs chứ không mượn qlda-metadata.mjs: hợp đồng bảo mật ở đầu file nói
 * connection string không rời khỏi module này, nên nó cũng không được đi vào một module khác
 * chỉ để quay lại đây.
 */
function localConnString(key) {
  // ĐÚNG MỘT vị trí: data root của bản cài này — plugin đặt FBO_DATA_ROOT=${CLAUDE_PLUGIN_DATA},
  // dev thì là gốc hub. Trùng khớp với chỗ `set_pm_identity` và `4ai setup` GHI ra, nên đọc và
  // ghi không bao giờ lệch nhau.
  //
  // Cố tình KHÔNG dò thêm cwd hay các gốc khác: thêm vị trí dự phòng nghe thì an toàn, nhưng
  // biến kết quả thành "tuỳ chạy từ thư mục nào" — thứ vừa khó dò khi hỏng, vừa làm test phụ
  // thuộc trạng thái máy đang chạy.
  const file = path.join(dataRoot(MODULE_HUB_ROOT), 'data', 'qlda.local.json');
  if (!fs.existsSync(file)) return '';
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'))?.[key];
    return typeof v === 'string' ? v.trim() : '';
  } catch {
    // File hỏng cú pháp thì coi như chưa khai — rớt xuống Web.config, đừng làm sập mọi truy
    // vấn chỉ vì một dấu phẩy thừa trong file cấu hình cục bộ.
    return '';
  }
}

/**
 * Kết nối này đến TỪ ĐÂU — chỉ trả về TÊN NGUỒN, không bao giờ trả giá trị.
 *
 * Có hàm này vì hỏng kiểu "env khai rồi mà vẫn đi đọc Web.config" hoàn toàn im lặng: kết quả
 * truy vấn vẫn đúng nên không ai nhận ra, cho tới lúc máy khác mất share thì mới vỡ. Đây là
 * cách kiểm mà không phải in chuỗi kết nối ra màn hình.
 *
 * @returns {'env'|'qlda.local.json'|'Web.config'}
 */
export function nguonKetNoi(programPath, dbType = 'app') {
  if (!laQldaProgram(programPath)) return 'Web.config';
  const laSys = dbType === 'sys';
  if (String(process.env[laSys ? 'QLDA_SYS_CONNECTION' : 'QLDA_APP_CONNECTION'] ?? '').trim()) return 'env';
  if (localConnString(laSys ? 'sysConnectionString' : 'appConnectionString')) return 'qlda.local.json';
  return 'Web.config';
}

/**
 * Kết nối QLDA theo đúng `resolveOrder` đã khai ở data/qlda.json: env → qlda.local.json.
 * Không có cái nào thì trả null để caller rớt về Web.config (bước cuối của resolveOrder).
 */
function qldaConn(dbType) {
  const laSys = dbType === 'sys';
  const cs = String(process.env[laSys ? 'QLDA_SYS_CONNECTION' : 'QLDA_APP_CONNECTION'] ?? '').trim()
    || localConnString(laSys ? 'sysConnectionString' : 'appConnectionString');
  if (!cs) return null;

  const conn = connFromString(cs);
  if (!conn.server) {
    throw new Error(
      `Chuỗi kết nối QLDA (${laSys ? 'sys' : 'app'}) không có \`Data Source\`/\`Server\` — kiểm lại `
      + `biến env ${laSys ? 'QLDA_SYS_CONNECTION' : 'QLDA_APP_CONNECTION'} hoặc data/qlda.local.json.`);
  }
  // Chuỗi kết nối không khai Initial Catalog thì lấy tên DB đã khai sẵn trong qlda.json —
  // nhờ vậy không phải truyền `database` ở mọi lệnh như thời còn đọc Web.config (%Database).
  if (isPlaceholder(conn.database)) {
    const cfg = qldaConfig();
    conn.database = (laSys ? cfg?.sysDatabaseName : cfg?.databaseName) ?? '';
  }
  return conn;
}

// ---------------------------------------------------------------- phân giải theo leg

/** Leg sys: placeholder thì rớt về appSetting `sysDatabaseName`. */
function resolveSysConn(programPath, databaseOverride) {
  if (laQldaProgram(programPath)) {
    const conn = qldaConn('sys');
    if (conn) {
      if (databaseOverride) conn.database = databaseOverride;
      if (isPlaceholder(conn.database)) {
        throw new Error(
          'Kết nối QLDA (sys) không xác định được tên database — khai `Initial Catalog` trong chuỗi '
          + 'kết nối, hoặc `databases.qlda.sysDatabaseName` trong data/qlda.json, hoặc truyền `database`.');
      }
      return conn;
    }
  }
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
  if (laQldaProgram(programPath)) {
    const conn = qldaConn('app');
    if (conn) {
      if (databaseOverride) conn.database = databaseOverride;
      // QLDA là DB nội bộ một entity — không đi tra bảng `entity` như chương trình khách.
      if (isPlaceholder(conn.database)) {
        throw new Error(
          'Kết nối QLDA (app) không xác định được tên database — khai `Initial Catalog` trong chuỗi '
          + 'kết nối, hoặc `databases.qlda.databaseName` trong data/qlda.json, hoặc truyền `database`.');
      }
      return conn;
    }
  }
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

// ------------------------------------------------- đồ thị 4AI (DB nội bộ của hub)

/**
 * Kết nối tới DB đồ thị. Nguồn theo `data/qlda.json → databases.graph4ai.resolveOrder`:
 * env `GRAPH_4AI_CONNECTION` trước, rồi `data/qlda.local.json → graphConnectionString`.
 *
 * Tách khỏi `resolveSysConn`/`resolveAppConn` vì đây KHÔNG phải DB nghiệp vụ: nó là DB nội bộ
 * của 4AI, không bao giờ phân giải qua Web.config của chương trình khách.
 */
function resolveGraphConn() {
  const cs = String(process.env.GRAPH_4AI_CONNECTION ?? '').trim() || localConnString('graphConnectionString');
  if (!cs) {
    throw new Error(
      'Chưa khai kết nối DB đồ thị 4AI. Đặt biến môi trường GRAPH_4AI_CONNECTION, '
      + 'hoặc chạy `node tools/4ai.mjs setup` để ghi `graphConnectionString` vào data/qlda.local.json. '
      + 'Từ lược đồ v3, đồ thị sống trong DB nên đây là cấu hình BẮT BUỘC, không còn là tuỳ chọn.');
  }
  const conn = connFromString(cs);
  if (!conn.database) {
    // Không còn fallback tên DB ghi cứng: qlda.json chỉ giữ token `{Graph4aiDatabaseName}`
    // (gói phân phối công khai không được mang tên hạ tầng nội bộ). Chưa khai thì BÁO RÕ chứ
    // đừng âm thầm nối vào một tên đoán được — sai DB mà vẫn chạy là kiểu hỏng khó dò nhất.
    const khai = loadQldaConfig()?.databases?.graph4ai?.databaseName;
    if (isPlaceholder(khai)) {
      throw new Error(
        'Kết nối DB đồ thị không xác định được tên database — khai `Initial Catalog` trong '
        + 'GRAPH_4AI_CONNECTION, hoặc `graph4aiDatabaseName` trong data/qlda.local.json '
        + '(chạy `node tools/4ai.mjs setup`).');
    }
    conn.database = khai;
  }
  return conn;
}

/** Nguồn kết nối đồ thị — chỉ TÊN nguồn, không bao giờ giá trị. Dùng cho `4ai doctor`. */
export function nguonKetNoiGraph() {
  if (String(process.env.GRAPH_4AI_CONNECTION ?? '').trim()) return 'env';
  if (localConnString('graphConnectionString')) return 'qlda.local.json';
  return 'chưa khai';
}

/**
 * ĐỌC từ DB đồ thị 4AI — trả về dòng đã parse, khác `runGraphScript` (chạy script, trả text).
 *
 * Câu lệnh ghi không bị chặn ở đây vì đây là DB nội bộ của chính 4AI, không phải DB nghiệp vụ
 * hay DB khách; nhưng mọi chỗ gọi hiện tại đều là SELECT, và đường ghi chính thức vẫn là
 * `runGraphScript` với script sinh từ `graph.mjs`.
 */
export function runGraphSql({ sql, maxRows = 5000, timeoutMs = 60000 }) {
  const sqlcmd = findSqlcmd();
  if (!sqlcmd) throw new Error('Không tìm thấy sqlcmd — xem hướng dẫn ở runSql().');
  return execSql(sqlcmd, resolveGraphConn(), sql, { maxRows, timeoutMs });
}

/**
 * Chạy một SCRIPT (nhiều batch ngăn bằng `GO`) trên DB đồ thị 4AI.
 *
 * Phải đi qua `sqlcmd -i <file>` chứ không phải `-Q`: `GO` là chỉ thị của sqlcmd, không phải
 * cú pháp T-SQL, và script nạp đồ thị bắt buộc có `GO` để tách phần `CREATE TABLE ... AS NODE`
 * khỏi phần nạp dữ liệu.
 *
 * Đây là đường GHI duy nhất tới DB đồ thị. Nó KHÔNG dùng cho DB nghiệp vụ hay DB khách —
 * `runSql` vẫn là đường đọc, và tool `query_sql` vẫn chặn câu lệnh ghi như cũ.
 *
 * @param {{scriptPath: string, timeoutMs?: number}} args
 * @returns {{database: string, output: string}}
 */
export function runGraphScript({ scriptPath, timeoutMs = 300000 }) {
  const sqlcmd = findSqlcmd();
  if (!sqlcmd) throw new Error('Không tìm thấy sqlcmd — xem hướng dẫn ở runSql().');
  if (!fs.existsSync(scriptPath)) throw new Error(`Không tìm thấy script: ${scriptPath}`);

  const conn = resolveGraphConn();
  const outFile = path.join(os.tmpdir(), `4ai-graph-push-${process.pid}-${outFileSeq++}.txt`);
  const args = [
    '-S', conn.server,
    '-d', conn.database,
    // `i:65001` BẮT BUỘC ở đây, khác hẳn execSql. execSql đưa câu lệnh qua `-Q` (tham số dòng
    // lệnh, Windows đã giải mã sẵn) nên chỉ cần đặt codepage đầu ra; còn đường này đưa qua
    // `-i <file>` — sqlcmd tự đọc file, và mặc định nó đọc theo codepage ANSI của máy chứ
    // không phải UTF-8. Script do writer.mjs ghi ra là UTF-8 không BOM, nên thiếu `i:65001`
    // thì mỗi ký tự tiếng Việt bị đọc thành hai ký tự Latin-1 rồi GHI THẲNG vào DB:
    // "Giấy báo nợ" thành "Giáº¥y bÃ¡o ná»£". Hỏng âm thầm — sqlcmd trả exit 0, chỉ lộ ra khi
    // có người nhìn vào dữ liệu.
    '-f', 'i:65001,o:65001', '-o', outFile,
    // `-b` dừng ngay khi có lỗi: script bọc trong BEGIN TRAN, chạy tiếp sau lỗi là để lại
    // transaction treo. `-r 1` đẩy message lỗi sang stderr để -o không nuốt mất.
    '-b', '-r', '1',
    '-l', String(Math.ceil(timeoutMs / 1000)),
    '-i', scriptPath,
  ];
  if (conn.trusted || conn.user === '') args.push('-E');
  else args.push('-U', conn.user, '-P', conn.password);

  let res;
  try {
    res = spawnSync(sqlcmd, args, { timeout: timeoutMs, encoding: 'buffer', windowsHide: true });
  } finally {
    // Dọn trước khi ném: file tạm có thể chứa mẩu dữ liệu đồ thị.
  }
  let out = '';
  try {
    if (fs.existsSync(outFile)) out = fs.readFileSync(outFile, 'utf8');
  } finally {
    try { fs.rmSync(outFile, { force: true }); } catch { /* dọn được thì tốt, không thì thôi */ }
  }

  const stderr = scrub(res.stderr ? decodeSource(res.stderr).text : '', conn).trim();
  if (res.error) throw new Error(`Không chạy được sqlcmd: ${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(`Nạp đồ thị lỗi (exit ${res.status}): ${stderr || scrub(out, conn).slice(0, 800)}`);
  }
  return { database: conn.database, output: scrub(out, conn) };
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
