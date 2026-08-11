### Task 1: `template.mjs` + unit test

**Files:**
- Create: `tools/lib/template.mjs`
- Create: `tests/test-template.mjs`
- Create (fixture tạm cho test missing-file không cần — dùng tên giả)

**Interfaces:**
- Produces:
  - `loadTemplate(name: string): string` — đọc `tools/templates/report/<name>`, cache `Map`
  - `renderTemplate(name: string, vars?: Record<string, unknown>): string` — thay `{{key}}` bằng `String(vars[key] ?? '')`
  - `clearTemplateCache(): void` — chỉ cho test

- [ ] **Step 1: Write failing test**

Tạo `tests/test-template.mjs`:

```js
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
```

- [ ] **Step 2: Run test — expect FAIL (module chưa có)**

```powershell
node tests/test-template.mjs
```

Expected: lỗi `ERR_MODULE_NOT_FOUND` cho `../tools/lib/template.mjs`

- [ ] **Step 3: Implement `tools/lib/template.mjs`**

```js
// template.mjs — load file tĩnh dưới tools/templates/report/, thay {{key}}.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates/report',
);

const cache = new Map();

/** @param {string} name tên file trong tools/templates/report/ */
export function loadTemplate(name) {
  if (cache.has(name)) return cache.get(name);
  const abs = path.join(TEMPLATE_DIR, name);
  if (!fs.existsSync(abs)) {
    throw new Error(`template không tồn tại: ${abs}`);
  }
  const text = fs.readFileSync(abs, 'utf8');
  cache.set(name, text);
  return text;
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} [vars]
 */
export function renderTemplate(name, vars = {}) {
  return loadTemplate(name).replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

/** Chỉ dùng trong test. */
export function clearTemplateCache() {
  cache.clear();
}
```

- [ ] **Step 4: Run test — expect PASS**

```powershell
node tests/test-template.mjs
```

Expected: bốn dòng `PASS`, exit 0

- [ ] **Step 5: Commit**

```powershell
git add tools/lib/template.mjs tests/test-template.mjs
git commit -m "Add template loader with {{key}} substitution"
```

---

