#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTemplate, renderTemplate, clearTemplateCache } from '../tools/lib/template.mjs';
import { page, CSS, renderReport, validatePayload } from '../tools/lib/report.mjs';
import { loadHolidays } from '../tools/lib/workdays.mjs';

let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../tools/templates/report');
fs.mkdirSync(dir, { recursive: true });
const fixture = path.join(dir, '_test_fixture.html');
fs.writeFileSync(fixture, 'Hello {{name}}! {{missing}}.', 'utf8');

clearTemplateCache();
ok('render thay key có mặt', renderTemplate('_test_fixture.html', { name: 'A' }) === 'Hello A! .');
ok('key thiếu → chuỗi rỗng', renderTemplate('_test_fixture.html', {}) === 'Hello ! .');
ok('load cache cùng nội dung', loadTemplate('_test_fixture.html') === fs.readFileSync(fixture, 'utf8'));

let threw = false;
try {
  clearTemplateCache();
  loadTemplate('__does_not_exist__.html');
} catch {
  threw = true;
}
ok('thiếu file → throw', threw);

fs.unlinkSync(fixture);
clearTemplateCache();

ok('CSS export non-empty', typeof CSS === 'string' && CSS.includes(':root'));
const html = page('T', '<b>m</b>', '<p>x</p>');
ok('page nhúng css + slot', html.includes('<style>') && html.includes(CSS.slice(0, 40)) && html.includes('<p>x</p>') && html.includes('<b>m</b>'));
ok('page có class dash? không', !html.includes('class="dash"'));

const h = loadHolidays();
const payload = {
  ma_da: 'T1', ngay_chay: '2026-08-11',
  giaiDoan: [{ giai_doan_da: 'DR01', ngay_ht: '2026-08-20', xac_nhan_da_hen_yn: true, noi_dung: 'x' }],
  yeuCau: [{ stt_rec: '1', fcode1: 'UR1', noi_dung: 'a', trang_thai: 'DD', giai_doan_da: 'DR01',
    ngay_ht: '2026-08-20', ma_lt1: '', menu_id: 'M1', tlks_yn: true }],
};
ok('payload valid', validatePayload(payload).length === 0);
const dash = renderReport(payload, h);
ok('dashboard shell', dash.includes('class="dash"') && dash.includes('<style>') && dash.includes('id="more"'));

process.exit(failures ? 1 : 0);
