#!/usr/bin/env node
// selftest.mjs — bắt tay JSON-RPC thật với server.mjs rồi đối chiếu với mcp/servers.json.
//
// Đây là test suite của MCP server: nếu registry khai một tool mà server không có
// (hoặc ngược lại), hai thứ đã trôi khỏi nhau và mọi asset nhắc tên tool đó đều sai.
// Chạy: node mcp/fbo/selftest.mjs [--program <path|code>]

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HUB = path.resolve(HERE, '..', '..');
const SERVER = path.join(HERE, 'server.mjs');

// Không còn corpus cục bộ để hardcode (resolveProgram() trong tools.mjs chỉ nhận path thật
// hoặc nbdmda.ma_da thật, đọc thẳng DB QLDA — xem comment ở đó). Không truyền --program thì
// script tự chọn dự án REACHABLE đầu tiên từ list_programs sau khi kết nối xong (bên dưới).
const argProgram = process.argv.indexOf('--program');
const explicitProgram = argProgram !== -1 ? process.argv[argProgram + 1] : null;

const child = spawn(process.execPath, [SERVER, '--hub', HUB], { stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.setEncoding('utf8');
const serverLog = [];
child.stderr.on('data', (d) => serverLog.push(d));

let buf = '';
const pending = new Map();
child.stdout.setEncoding('utf8');
child.stdout.on('data', (c) => {
  buf += c;
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { fail(`stdout có dòng không phải JSON: ${line.slice(0, 120)}`); continue; }
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});

let seq = 0;
const rpc = (method, params) => new Promise((res, rej) => {
  const id = ++seq;
  const timer = setTimeout(() => rej(new Error(`timeout: ${method}`)), 120000);
  pending.set(id, (m) => { clearTimeout(timer); res(m); });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = (name, args) => rpc('tools/call', { name, arguments: args });
const payload = (r) => {
  const t = r.result?.content?.[0]?.text;
  if (r.result?.isError) return { __error: t };
  try { return JSON.parse(t); } catch { return t; }
};

let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}\n`);
  if (!cond) failures++;
}
function fail(msg) { process.stdout.write(`FAIL  ${msg}\n`); failures++; }

// ---------------------------------------------------------------- chạy

const registry = JSON.parse(fs.readFileSync(path.join(HUB, 'mcp', 'servers.json'), 'utf8'));
const entry = registry.servers['4ai-fbo'];

const init = await rpc('initialize', {
  protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'selftest', version: '1' },
});
ok('initialize trả protocolVersion', !!init.result?.protocolVersion, init.result?.protocolVersion);
ok('serverInfo.name = 4ai-fbo', init.result?.serverInfo?.name === '4ai-fbo');
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const listed = (await rpc('tools/list')).result?.tools ?? [];
const names = listed.map((t) => t.name).sort();
ok('tools/list không rỗng', names.length > 0, `${names.length} tool`);
ok('mọi tool có description + inputSchema',
  listed.every((t) => t.description && t.inputSchema?.type === 'object'));

// Registry ↔ server: autoApprove chỉ được nhắc tool có thật.
const approved = entry?.autoApprove ?? [];
const unknown = approved.filter((n) => !names.includes(n));
ok('autoApprove trong servers.json khớp tool thật', unknown.length === 0,
  unknown.length ? `không có: ${unknown.join(', ')}` : `${approved.length} tool`);
ok('query_sql KHÔNG nằm trong autoApprove', !approved.includes('query_sql'));

// PROGRAM: --program truyền tay, không thì lấy dự án REACHABLE đầu tiên đứng tên PM máy này.
// Gọi list_programs MỘT LẦN, dùng lại kết quả cho cả bước chọn PROGRAM lẫn bước tìm `target`
// bên dưới (tránh round-trip DB thứ hai không cần thiết).
const progs = payload(await call('list_programs', {}));
let PROGRAM = explicitProgram;
if (!PROGRAM) {
  const first = progs?.programs?.find((p) => p.reachable);
  if (!first) {
    fail(`không có --program và list_programs không trả dự án REACHABLE nào để tự chọn` +
      (progs?.__error ? ` (${progs.__error})` : ''));
    process.stdout.write(`\nCÓ LỖI — ${failures} kiểm tra thất bại\n`);
    child.kill();
    process.exit(1);
  }
  PROGRAM = first.maDa;
  process.stdout.write(`(tự chọn program: ${PROGRAM} — ${first.name ?? first.shortName ?? ''})\n`);
}

// Cổng giấy phép: hai tool license phải gọi được cả khi CHƯA kích hoạt — không thì người
// dùng không có đường nào đọc Device ID để xin giấy phép. (Selftest chạy từ mã nguồn hub nên
// các tool khác không bị chặn ở đây; phần chặn thật đã có test riêng ở tests/test-license.mjs.)
const lic = payload(await call('license_status', {}));
ok('license_status chạy được, trả Device ID đúng dạng',
  /^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/.test(lic?.deviceId ?? ''), lic?.deviceId);
ok('license_status không trả chữ ký hay đường dẫn khoá ký',
  !/signature|privateKey|BEGIN [A-Z ]*PRIVATE KEY/.test(JSON.stringify(lic)));
const licSai = payload(await call('license_activate', { license: '{"payload":{"v":1},"signature":"AA"}' }));
// Hai lý do từ chối đều đúng, tuỳ hub đã dán public key vào data/ hay chưa: "gói chưa có
// khoá phát hành nào" (chưa dán) hoặc "verify không qua" (đã dán).
ok('license_activate từ chối giấy phép không hợp lệ',
  typeof licSai?.__error === 'string' && /Không lưu|public key/i.test(licSai.__error),
  licSai?.__error?.split('\n')[0]);

// Guard rail: chặn câu lệnh ghi. Không cần index — query_sql đi thẳng DB.
const write = payload(await call('query_sql', { program: PROGRAM, sql: 'DELETE FROM CPTran' }));
ok('query_sql chặn câu lệnh ghi', typeof write?.__error === 'string' && /allowWrite/.test(write.__error));

// Guard rail: resolve_vouchercode phải đòi `code` chứ không đoán. Cũng không cần index.
const noCode = payload(await call('resolve_vouchercode', { program: PROGRAM }));
ok('resolve_vouchercode thiếu code → lỗi rõ ràng',
  typeof noCode?.__error === 'string' && /code/i.test(noCode.__error));

// describe_controller (kể cả nhánh "file không tồn tại") BẮT BUỘC có index trước
// (requireIndex() trong tools.mjs) — phải index_program trước khi gọi, không thì lỗi
// "chưa được index" đè lên đúng cái guard rail đang muốn kiểm.
// `maDa`, KHÔNG PHẢI `code` — list_programs không có field `code` (bug cũ: so sánh luôn
// undefined, target luôn tìm trượt qua nhánh programPath, SKIP không bao giờ kích hoạt).
const target = progs.programs?.find((p) => p.maDa === PROGRAM || p.programPath === PROGRAM);
if (target && !target.reachable) {
  process.stdout.write(`SKIP  guard rail describe_controller + tra cứu thật — program ${PROGRAM} không tới được\n`);
} else {
  if (!target?.indexed) await call('index_program', { program: PROGRAM });

  // Guard rail: không tồn tại thì phải nói không tồn tại.
  const missing = payload(await call('describe_controller',
    { program: PROGRAM, path: 'Dir\\KhongTonTaiBaoGio.xml' }));
  ok('file không tồn tại → found:false', missing?.found === false);
  ok('kèm cảnh báo không được bịa file',
    typeof missing?.note === 'string' && /KHÔNG được tự tạo mới/.test(missing.note));

  // Guard rail: không rò connection string trong bất kỳ output nào.
  const sqlAttempt = payload(await call('query_sql', { program: PROGRAM, object: 'APTran' }));
  const voucherAttempt = payload(await call('resolve_vouchercode', { program: PROGRAM, code: 'HDA' }));
  const allOutput = JSON.stringify([missing, write, sqlAttempt, voucherAttempt]) + serverLog.join('');
  const leak = /(?:password|pwd|uid|user\s*id)\s*=\s*(?!\*\*\*)[^;"'\s,}]+/i.exec(allOutput);
  ok('không rò credential ra output/stderr', !leak, leak ? `thấy: ${leak[0].slice(0, 40)}` : undefined);

  const found = payload(await call('find_controller', { program: PROGRAM, query: 'giay bao no', limit: 5 }));
  ok('find_controller ra kết quả', (found?.count ?? 0) > 0, `${found?.count} controller`);
  ok('gom theo mã controller kèm họ file',
    found?.results?.[0]?.controller !== undefined && Array.isArray(found?.results?.[0]?.files));

  const accented = payload(await call('find_controller', { program: PROGRAM, query: 'Giấy báo nợ', limit: 5 }));
  ok('có dấu và không dấu cho cùng kết quả',
    JSON.stringify(accented?.results) === JSON.stringify(found?.results));

  const rel = payload(await call('list_related',
    { program: PROGRAM, path: 'Include\\XML\\WhenVoucherInit.xml', kind: 'used_by' }));
  ok('used_by đếm được controller dùng chung', (rel?.usedBy?.total ?? 0) > 0, `total=${rel?.usedBy?.total}`);
  ok('used_by cảnh báo khi file nằm trong Include', typeof rel?.usedBy?.warning === 'string');

  const src = payload(await call('read_source',
    { program: PROGRAM, path: 'Dir\\APTran.xml', offset: 1, limit: 3 }));
  ok('read_source báo encoding gốc',
    !!src?.encoding?.charset && typeof src?.encoding?.bom === 'boolean' && !!src?.encoding?.newline,
    `${src?.encoding?.charset} bom=${src?.encoding?.bom} ${src?.encoding?.newline}`);
}

process.stdout.write(`\n${failures === 0 ? 'OK' : 'CÓ LỖI'} — ${failures} kiểm tra thất bại\n`);
child.kill();
process.exit(failures === 0 ? 0 : 1);
