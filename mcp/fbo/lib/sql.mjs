// sql.mjs — chạy SQL trên database của một program FBO.
//
// HỢP ĐỒNG BẢO MẬT: module này đọc connection string từ Web.config và KHÔNG BAO GIỜ
// trả nó ra ngoài. Không có hàm nào ở đây trả về chuỗi kết nối, user hay password —
// kể cả trong message lỗi. Lỗi từ sqlcmd được lọc trước khi trả về.

import fs from 'node:fs';
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

function parseConnStringPairs(cs) {
  const out = {};
  for (const part of cs.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

/**
 * Đọc Web.config, trả về THAM SỐ KẾT NỐI ĐÃ TÁCH — chỉ dùng nội bộ, không expose.
 * @returns {{server, database, user, password, trusted}}
 */
function readConnection(programPath, dbType, databaseOverride) {
  const candidates = [
    path.join(programPath, 'Web.config'),
    path.join(programPath, '..', 'Web.config'),
  ];
  const webConfig = candidates.find((p) => fs.existsSync(p));
  if (!webConfig) {
    throw new Error(`Không tìm thấy Web.config cho program: ${programPath}`);
  }

  const { text } = readSource(webConfig);
  const wanted = dbType === 'sys' ? 'sysConnectionString' : 'appConnectionString';
  const re = new RegExp(`<add\\s+name\\s*=\\s*["']${wanted}["'][^>]*connectionString\\s*=\\s*["']([^"']+)["']`, 'i');
  const m = re.exec(text);
  if (!m) {
    throw new Error(`Web.config không có connectionStrings entry \`${wanted}\`.`);
  }
  const p = parseConnStringPairs(m[1]);

  let database = databaseOverride ?? p['initial catalog'] ?? p.database ?? '';
  if (/^%/.test(database) || database === '') {
    // FBO để placeholder %Database — runtime thay bằng DB đang chọn.
    if (dbType === 'sys') {
      const sysName = /<add\s+key\s*=\s*["']sysDatabaseName["']\s+value\s*=\s*["']([^"']+)["']/i.exec(text);
      if (sysName) database = sysName[1];
    }
    if (/^%/.test(database) || database === '') {
      throw new Error(
        'Web.config dùng placeholder cho tên database (%Database) — truyền tham số `database` ' +
        'để chỉ rõ database cần truy vấn.');
    }
  }

  return {
    server: p['data source'] ?? p.server ?? '',
    database,
    user: p['user id'] ?? p.uid ?? '',
    password: p.password ?? p.pwd ?? '',
    trusted: /^(true|yes|sspi)$/i.test(p['integrated security'] ?? p['trusted_connection'] ?? ''),
  };
}

function findSqlcmd() {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['sqlcmd'],
    { encoding: 'utf8' });
  if (probe.status === 0) {
    const first = probe.stdout.split(/\r?\n/).find((l) => l.trim() !== '');
    if (first) return first.trim();
  }
  return null;
}

/** Parse output `sqlcmd -s\t -W -h-1` thành mảng object. */
function parseTsv(stdout, columns) {
  const rows = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    if (/^\(\d+ rows? affected\)$/i.test(line.trim())) continue;
    const cells = line.split('\t');
    if (columns.length > 0 && cells.length === columns.length) {
      rows.push(Object.fromEntries(columns.map((c, i) => [c, cells[i] === 'NULL' ? null : cells[i]])));
    } else {
      rows.push(cells);
    }
  }
  return rows;
}

/**
 * Chạy một câu SQL. KHÔNG bao giờ trả connection string.
 * @param {{programPath: string, sql: string, dbType?: 'app'|'sys', database?: string, maxRows?: number, timeoutMs?: number}} p
 */
export function runSql({ programPath, sql, dbType = 'app', database, maxRows = 100, timeoutMs = 30000 }) {
  const sqlcmd = findSqlcmd();
  if (!sqlcmd) {
    throw new Error('Không tìm thấy sqlcmd trên máy này. Cài "Microsoft ODBC Driver / Client SDK" ' +
      'hoặc SQL Server Command Line Utilities rồi thử lại.');
  }
  const conn = readConnection(programPath, dbType, database);

  const header = `SET NOCOUNT ON;\nSET ROWCOUNT ${Math.max(1, Math.min(maxRows, 10000))};\n`;
  const args = [
    '-S', conn.server,
    '-d', conn.database,
    // -W (bỏ khoảng trắng thừa) loại trừ nhau với -Y; -W là thứ làm parseTsv chạy được.
    '-s', '\t', '-W', '-w', '65535',
    '-b', '-r', '1',
    '-l', String(Math.ceil(timeoutMs / 1000)),
    '-Q', header + sql,
  ];
  if (conn.trusted || conn.user === '') args.push('-E');
  else args.push('-U', conn.user, '-P', conn.password);

  // Không đặt `encoding`: sqlcmd trả byte theo codepage OEM, nhãn tiếng Việt sẽ hỏng nếu
  // ép utf8. decodeSource dùng đúng cơ chế đang dùng cho file nguồn: utf-8 strict, rớt về cp1258.
  const res = spawnSync(sqlcmd, args, {
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });

  if (res.error) throw new Error(`Không chạy được sqlcmd: ${redact(res.error.message)}`);
  const stdout = res.stdout ? decodeSource(res.stdout).text : '';
  const stderr = redact(res.stderr ? decodeSource(res.stderr).text : '').trim();
  if (res.status !== 0) {
    throw new Error(`SQL lỗi (exit ${res.status}): ${stderr || redact(stdout).slice(0, 800)}`);
  }

  const lines = stdout.split(/\r?\n/);
  const headerLine = lines.find((l) => l.trim() !== '') ?? '';
  const columns = headerLine.includes('\t') ? headerLine.split('\t') : [headerLine].filter(Boolean);
  const body = lines.slice(lines.indexOf(headerLine) + 1)
    .filter((l) => !/^-+(\t-+)*$/.test(l.trim()));
  const rows = parseTsv(body.join('\n'), columns);

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
