#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTemplate, renderTemplate, clearTemplateCache } from '../tools/lib/template.mjs';

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

process.exit(failures ? 1 : 0);
