#!/usr/bin/env node
// test-setup.mjs — khai báo cấu hình cục bộ, chẩn đoán runtime, và đường dẫn plugin.
// KHÔNG đụng vào qlda.local.json thật: mọi thứ ghi vào thư mục tạm qua FBO_DATA_ROOT.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSecrets } from '../tools/lib/assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '4ai-setup-'));
process.env.FBO_DATA_ROOT = tmp;
const { chanDoan, inChanDoan, duongDanLocal, KHOA_BI_MAT } = await import('../tools/lib/setup.mjs');

process.stdout.write('=== ghi vào data root của LẦN CÀI, không phải hub ===\n');
// Chạy như plugin thì đây là ${CLAUDE_PLUGIN_DATA} — ghi vào hub sẽ mất sau mỗi lần update.
ok('duongDanLocal theo FBO_DATA_ROOT', duongDanLocal(ROOT) === path.join(tmp, 'data', 'qlda.local.json'),
  duongDanLocal(ROOT));
ok('KHÔNG trỏ vào qlda.local.json thật của hub', !duongDanLocal(ROOT).startsWith(path.join(ROOT, 'data')));

process.stdout.write('\n=== chẩn đoán khi CHƯA khai gì ===\n');
const envCu = {};
for (const k of KHOA_BI_MAT) { envCu[k.env] = process.env[k.env]; delete process.env[k.env]; }
const d0 = chanDoan(ROOT);
ok('Báo chưa có file cấu hình', d0.coFile === false);
ok('Ba khoá bí mật đều báo chưa khai', d0.biMat.every((k) => !k.coEnv && !k.coLocal));
ok('Vẫn dò được sqlcmd / phiên bản node', Boolean(d0.node));

process.stdout.write('\n=== chẩn đoán KHÔNG BAO GIỜ in giá trị bí mật ===\n');
fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
const BIMAT = 'Data Source=SRV-BIMAT;User Id=sa;Password=MatKhauSieuBiMat123';
fs.writeFileSync(path.join(tmp, 'data', 'qlda.local.json'),
  JSON.stringify({ pm: { maNv: 'PM01', boPhanLt: 'FSD' }, appConnectionString: BIMAT }, null, 2));

const d1 = chanDoan(ROOT);
let inRa = '';
inChanDoan(d1, (s) => { inRa += s; });
ok('Biết là đã khai ở qlda.local.json',
  d1.biMat.find((k) => k.key === 'appConnectionString')?.coLocal === true);
ok('KHÔNG in chuỗi kết nối', !inRa.includes(BIMAT) && !inRa.includes('MatKhauSieuBiMat123'));
ok('KHÔNG in mật khẩu / server', !/Password=|SRV-BIMAT|User Id=sa/.test(inRa));
ok('Có in TÊN KHOÁ và nguồn', inRa.includes('appConnectionString') && inRa.includes('qlda.local.json'));
ok('Danh tính PM không phải bí mật, được hiện', inRa.includes('PM01') && inRa.includes('FSD'));
ok('Đối tượng chẩn đoán cũng không mang giá trị',
  !JSON.stringify(d1).includes('MatKhauSieuBiMat123'));

process.stdout.write('\n=== env thắng local, và báo đúng nguồn ===\n');
process.env.QLDA_APP_CONNECTION = 'Data Source=X;Initial Catalog=QLDA_APP';
const d2 = chanDoan(ROOT);
ok('Khai ở env thì báo nguồn env', d2.biMat.find((k) => k.key === 'appConnectionString')?.coEnv === true);
let inRa2 = '';
inChanDoan(d2, (s) => { inRa2 += s; });
ok('Vẫn không in giá trị env', !inRa2.includes('Initial Catalog=QLDA_APP'));
delete process.env.QLDA_APP_CONNECTION;

process.stdout.write('\n=== ghi cấu hình: bỏ trống = GIỮ NGUYÊN, không xoá ===\n');
const { ghiLocal } = await import('../tools/lib/setup.mjs');
const doc = () => JSON.parse(fs.readFileSync(duongDanLocal(ROOT), 'utf8'));

ghiLocal(ROOT, { maNv: 'AAA', boPhanLt: 'BP1', biMat: { sysConnectionString: 'S1' } });
ok('Ghi được PM + một khoá bí mật',
  doc().pm.maNv === 'AAA' && doc().pm.boPhanLt === 'BP1' && doc().sysConnectionString === 'S1');
ok('Khoá cũ (appConnectionString) không bị xoá', doc().appConnectionString === BIMAT);

// Chạy lại setup chỉ để sửa MỘT mục thì không được mất ba mục kia.
ghiLocal(ROOT, { maNv: 'BBB' });
ok('Chỉ đổi maNv, boPhanLt giữ nguyên', doc().pm.maNv === 'BBB' && doc().pm.boPhanLt === 'BP1');
ok('Bỏ trống chuỗi kết nối -> giữ nguyên, không xoá',
  doc().sysConnectionString === 'S1' && doc().appConnectionString === BIMAT);

const kq = ghiLocal(ROOT, { biMat: { appConnectionString: 'MOI' } });
ok('Trả về TÊN KHOÁ đã khai, không kèm giá trị',
  kq.daKhai.join() === 'appConnectionString' && !JSON.stringify(kq).includes('MOI'));
ok('Ghi đè đúng khoá được truyền', doc().appConnectionString === 'MOI');

ok('File ghi ra là JSON hợp lệ, có newline cuối',
  fs.readFileSync(duongDanLocal(ROOT), 'utf8').endsWith('\n'));

process.stdout.write('\n=== scanSecrets: bỏ qua *.local.json, vẫn bắt file được commit ===\n');
// Máy cấu hình ĐÚNG (có chuỗi kết nối trong qlda.local.json) mà `check` lại đỏ thì hỏng —
// check phải sạch trên mọi máy. Nhưng file được commit thì vẫn phải bắt.
const hubTam = fs.mkdtempSync(path.join(os.tmpdir(), '4ai-scan-'));
fs.mkdirSync(path.join(hubTam, 'data'), { recursive: true });
fs.writeFileSync(path.join(hubTam, 'data', 'qlda.local.json'), `{"appConnectionString":"${BIMAT}"}`);
ok('qlda.local.json (đã gitignore) -> BỎ QUA', scanSecrets({ hub: hubTam }).length === 0,
  JSON.stringify(scanSecrets({ hub: hubTam })));

fs.writeFileSync(path.join(hubTam, 'data', 'qlda.json'), `{"note":"${BIMAT}"}`);
const batDuoc = scanSecrets({ hub: hubTam });
ok('qlda.json (được commit) -> VẪN BẮT', batDuoc.length === 1 && batDuoc[0].file.includes('qlda.json'),
  JSON.stringify(batDuoc.map((h) => h.file)));

process.stdout.write('\n=== .mcp.json của plugin phải dùng token, không phải đường dẫn máy dev ===\n');
// Gói xuất xưởng mang cứng đường dẫn máy sinh ra nó thì ai cài về cũng không chạy được.
const mcp = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', '4ai', '.mcp.json'), 'utf8'));
const srv = mcp.mcpServers['4ai-fbo'];
const nhu = JSON.stringify(srv);
ok('args dùng ${CLAUDE_PLUGIN_ROOT}', srv.args.every((a) => !path.isAbsolute(a)) && nhu.includes('CLAUDE_PLUGIN_ROOT'));
ok('KHÔNG còn đường dẫn tuyệt đối của máy dev', !/[A-Z]:[\\/]|^\\\\/i.test(nhu.replace(/\$\{[^}]+\}/g, '')),
  nhu);
ok('command là lệnh trần (máy người cài tự phân giải qua PATH)',
  !/[\\/]/.test(srv.command), srv.command);
ok('Index ghi ra ${CLAUDE_PLUGIN_DATA} để sống sót update',
  srv.env?.FBO_DATA_ROOT === '${CLAUDE_PLUGIN_DATA}');

// Target cục bộ thì NGƯỢC LẠI: phải là đường dẫn thật, không được để token.
const cucBo = path.join(ROOT, '.mcp.json');
if (fs.existsSync(cucBo)) {
  const s = JSON.stringify(JSON.parse(fs.readFileSync(cucBo, 'utf8')));
  ok('.mcp.json cục bộ giải ra đường dẫn thật, không còn token',
    !s.includes('CLAUDE_PLUGIN_ROOT') && !s.includes('{{HUB}}'));
}

for (const [k, v] of Object.entries(envCu)) if (v !== undefined) process.env[k] = v;
fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(hubTam, { recursive: true, force: true });

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures ? `${failures} thất bại` : 'TẤT CẢ PASS (0 thất bại)'} ===\n`);
process.exit(failures ? 1 : 0);
