#!/usr/bin/env node
// test-state-root.mjs — trạng thái phải sống lâu hơn một lần cài và một PHIÊN.
//
// Chuyện có thật đứng sau file test này: trong Cowork, `${CLAUDE_PLUGIN_DATA}` nằm trong thư
// mục của TỪNG PHIÊN. Phiên đóng là mất cả giấy phép vừa kích hoạt lẫn cấu hình vừa khai, nên
// mỗi phiên mới người dùng lại phải xin giấy phép và gán lại PM. Từ đó `stateRoot()` tách khỏi
// `dataRoot()`: index dựng lại được thì cứ để theo phiên, còn giấy phép/cấu hình/ledger thì không.
//
// KHÔNG bao giờ để test đụng thư mục người dùng thật: mọi case ghi đĩa đều chốt FBO_STATE_ROOT
// vào thư mục tạm. Case duy nhất bỏ trống FBO_STATE_ROOT chỉ TÍNH đường dẫn, không ghi gì.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { dataRoot, stateRoot, stateFile } = await import('../mcp/fbo/lib/index.mjs');

let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

const envCu = { data: process.env.FBO_DATA_ROOT, state: process.env.FBO_STATE_ROOT };
const datEnv = (data, state) => {
  if (data === null) delete process.env.FBO_DATA_ROOT; else process.env.FBO_DATA_ROOT = data;
  if (state === null) delete process.env.FBO_STATE_ROOT; else process.env.FBO_STATE_ROOT = state;
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '4ai-state-'));
const cu = path.join(tmp, 'phien-cu');      // đóng vai ${CLAUDE_PLUGIN_DATA} của một phiên
const moi = path.join(tmp, 'nguoi-dung');   // đóng vai %APPDATA%\4ai

process.stdout.write('=== chạy từ mã nguồn hub: y hệt trước khi có stateRoot ===\n');
datEnv(null, null);
ok('stateRoot = hub', stateRoot(ROOT) === ROOT, stateRoot(ROOT));
ok('dataRoot = hub', dataRoot(ROOT) === ROOT, dataRoot(ROOT));

process.stdout.write('\n=== chạy như plugin: hai gốc TÁCH nhau ===\n');
// Chỉ tính đường dẫn — không gọi stateFile ở case này, nên không ghi gì vào thư mục người dùng.
datEnv(cu, null);
const macDinh = stateRoot(ROOT);
ok('stateRoot KHÔNG phải data root của phiên', macDinh !== dataRoot(ROOT), macDinh);
ok('stateRoot nằm ngoài cây phiên', !macDinh.startsWith(tmp), macDinh);
ok('stateRoot là thư mục cấp người dùng',
  macDinh.startsWith(process.env.APPDATA ?? os.homedir()) && /[\\/]\.?4ai$/.test(macDinh), macDinh);

process.stdout.write('\n=== di chuyển: bản cài cũ không mất giấy phép ===\n');
datEnv(cu, moi);
fs.mkdirSync(path.join(cu, 'data'), { recursive: true });
fs.writeFileSync(path.join(cu, 'data', 'license.json'), '{"cu":true}');
const dich = stateFile(ROOT, 'data', 'license.json');
ok('trả đường dẫn ở state root', dich === path.join(moi, 'data', 'license.json'), dich);
ok('file được copy sang', fs.existsSync(dich));
ok('nguồn cũ còn nguyên (copy chứ không move — rollback vẫn chạy)',
  fs.existsSync(path.join(cu, 'data', 'license.json')));

process.stdout.write('\n=== đã có bản mới thì KHÔNG bị bản cũ ghi đè ===\n');
fs.writeFileSync(dich, '{"moi":true}');
fs.writeFileSync(path.join(cu, 'data', 'license.json'), '{"cu":"lan hai"}');
stateFile(ROOT, 'data', 'license.json');
ok('giữ nội dung mới', fs.readFileSync(dich, 'utf8') === '{"moi":true}',
  fs.readFileSync(dich, 'utf8'));

process.stdout.write('\n=== đổi data root giữa chừng: đọc lại nguồn mới, không nhớ ngầm ===\n');
// Không có case này thì một bộ nhớ ẩn kiểu `daDiChuyen` sẽ lọt qua test mà vẫn sai trong tiến
// trình đổi env — chính là kiểu hỏng đã làm test-sql-conn đỏ khi lần đầu thêm stateFile.
const cu2 = path.join(tmp, 'phien-cu-2');
const moi2 = path.join(tmp, 'nguoi-dung-2');
fs.mkdirSync(path.join(cu2, 'data'), { recursive: true });
fs.writeFileSync(path.join(cu2, 'data', 'license.json'), '{"cu2":true}');
datEnv(cu2, moi2);
const dich2 = stateFile(ROOT, 'data', 'license.json');
ok('gốc mới được di chuyển độc lập', fs.existsSync(dich2)
  && fs.readFileSync(dich2, 'utf8') === '{"cu2":true}');

datEnv(envCu.data ?? null, envCu.state ?? null);
fs.rmSync(tmp, { recursive: true, force: true });
process.stdout.write(`\n=== TEST KẾT THÚC: ${failures ? `${failures} thất bại` : 'TẤT CẢ PASS (0 thất bại)'} ===\n`);
process.exit(failures ? 1 : 0);
