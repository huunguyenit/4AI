# Report Shell Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách shell HTML (`page`, `dashboardPage`) và CSS dùng chung ra `tools/templates/report/`, load + thay `{{key}}` lúc render — báo cáo vẫn self-contained.

**Architecture:** Module `tools/lib/template.mjs` đọc file từ `tools/templates/report/` (resolve qua `import.meta.url`), cache theo process, thay placeholder bằng regex `\{\{(\w+)\}\}`. `report.mjs` giữ chữ ký `page` / `dashboardPage` / `export const CSS`; phần radios/nav/panels vẫn ráp bằng JS rồi truyền vào slot.

**Tech Stack:** Node.js ESM, `node:fs` / `node:path` / `node:url`, zero npm dependency. Test runner: `node tests/<file>.mjs`.

## Global Constraints

- Không thêm npm dependency
- Không tách partial (KPI, action list, chart, bảng)
- Không refactor `report-kpi.mjs`
- Không engine template (loop/if)
- Template nằm dưới `tools/templates/report/` — không đặt trong `assets/`
- Output HTML vẫn nhúng CSS trong `<style>` (không `<link>`)
- Thiếu file template → throw rõ; không fallback chuỗi cứng trong `.mjs` sau khi chuyển
- Đường dẫn template không phụ thuộc `cwd`

---

## File map

| File | Vai trò |
|---|---|
| `tools/lib/template.mjs` | **Create** — `loadTemplate`, `renderTemplate`, `clearTemplateCache` |
| `tools/templates/report/page.html` | **Create** — shell `page()` |
| `tools/templates/report/dashboard.html` | **Create** — shell `dashboardPage()` |
| `tools/templates/report/report.css` | **Create** — nội dung hiện tại của `export const CSS` |
| `tools/lib/report.mjs` | **Modify** — dùng template; bỏ chuỗi HTML/CSS cứng của shell |
| `tests/test-template.mjs` | **Create** — unit test helper + smoke shell |
| `tests/test-review-report.mjs` | **Run** — không đổi trừ khi fail |
| `tests/test-assignee.mjs` | **Run** — không đổi trừ khi fail |

---

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

### Task 2: Tạo `page.html`, `dashboard.html`, `report.css`

**Files:**
- Create: `tools/templates/report/page.html`
- Create: `tools/templates/report/dashboard.html`
- Create: `tools/templates/report/report.css`
- Modify: (chưa đụng `report.mjs` ở task này)

**Interfaces:**
- Consumes: không
- Produces: ba file tĩnh đúng placeholder trong spec

- [ ] **Step 1: Write `page.html`**

```html
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{title}}</title>
<style>{{css}}</style>
</head>
<body>
<header>
  <h1>{{title}}</h1>
  <p class="meta">{{metaLine}}</p>
</header>
<main>
{{body}}
</main>
<footer>
  <p>Sinh bởi <code>node tools/4ai.mjs report</code>. Mọi đề xuất trạng thái ở đây <strong>chưa được thi hành</strong> — chỉ chạy sau khi PM xác nhận.</p>
</footer>
</body>
</html>
```

- [ ] **Step 2: Write `dashboard.html`**

```html
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{title}}</title>
<style>{{css}}</style>
</head>
<body class="dash">
{{radios}}
{{filters}}
<input type="checkbox" id="more" class="uin">
<header class="top">
  <div class="top-main">
    <h1>{{title}}</h1>
    <p class="meta">{{metaLine}}</p>
  </div>
  <nav class="tabs">{{nav}}</nav>
</header>
<main>
{{panels}}
</main>
<footer>
  <p>Sinh bởi <code>node tools/4ai.mjs report</code>. Mọi đề xuất trạng thái ở đây <strong>chưa được thi hành</strong> — chỉ chạy sau khi PM xác nhận.</p>
</footer>
</body>
</html>
```

- [ ] **Step 3: Extract `report.css` từ `report.mjs`**

Nội dung phải **byte-for-byte** bằng phần trong backtick của `export const CSS` hiện tại (khoảng dòng 983–1223 của `tools/lib/report.mjs`), **không** gồm dòng `export const CSS = \`` hay dấu `\`;` đóng.

Chạy (PowerShell) để xuất file — không copy tay:

```powershell
node --input-type=module -e "import fs from 'node:fs'; const s=fs.readFileSync('tools/lib/report.mjs','utf8'); const m=s.match(/export const CSS = `([\s\S]*?)`;\r?\n/); if(!m) throw new Error('CSS block not found'); fs.mkdirSync('tools/templates/report',{recursive:true}); fs.writeFileSync('tools/templates/report/report.css', m[1], 'utf8'); console.log('bytes', Buffer.byteLength(m[1]));"
```

Expected: in `bytes` > 0; file `tools/templates/report/report.css` tồn tại; bắt đầu bằng `:root{`.

- [ ] **Step 4: Smoke — load ba file qua helper**

Thêm tạm vào cuối session hoặc chạy:

```powershell
node --input-type=module -e "import { loadTemplate } from './tools/lib/template.mjs'; for (const n of ['page.html','dashboard.html','report.css']) { const t=loadTemplate(n); console.log(n, t.length); }"
```

Expected: ba dòng độ dài > 0, không throw.

- [ ] **Step 5: Commit**

```powershell
git add tools/templates/report/page.html tools/templates/report/dashboard.html tools/templates/report/report.css
git commit -m "Add report page/dashboard HTML shells and shared CSS"
```

---

### Task 3: Wire `report.mjs` vào template

**Files:**
- Modify: `tools/lib/report.mjs`
- Test: `tests/test-template.mjs` (bổ sung smoke `page` / `renderReport`), `tests/test-review-report.mjs`, `tests/test-assignee.mjs`

**Interfaces:**
- Consumes: `loadTemplate`, `renderTemplate` từ `./template.mjs`
- Produces: `page(title, metaLine, body)` và `dashboardPage(p)` cùng chữ ký; `export const CSS` vẫn là string CSS đầy đủ

- [ ] **Step 1: Extend `tests/test-template.mjs` với smoke shell (fail trước khi wire nếu gọi `page` vẫn hardcode — sau Step 3 phải pass)**

Thêm vào `tests/test-template.mjs` (sau các assert hiện có, trước `process.exit`):

```js
import { page, CSS, renderReport, validatePayload } from '../tools/lib/report.mjs';
import { loadHolidays } from '../tools/lib/workdays.mjs';

ok('CSS export non-empty', typeof CSS === 'string' && CSS.includes(':root'));
const html = page('T', '<b>m</b>', '<p>x</p>');
ok('page nhúng css + slot', html.includes('<style>') && html.includes(CSS.slice(0, 40)) && html.includes('<p>x</p>') && html.includes('<b>m</b>'));
ok('page có class dash? không', !html.includes('class="dash"'));

const h = loadHolidays();
const payload = {
  ma_da: 'T1', ngay_chay: '2026-08-11',
  giaiDoan: [{ giai_doan_da: 'DR01', ngay_ht: '2026-08-20', xac_nhan_da_hen_yn: true, noi_dung: 'x' }],
  yeuCau: [{ stt_rec: '1', fcode1: 'UR1', noi_dung: 'a', trang_thai: 'DD', giai_doan_da: 'DR01',
    ngay_ht: '2026-08-20', ma_lt1: '', tlks_yn: true }],
};
ok('payload valid', validatePayload(payload).length === 0);
const dash = renderReport(payload, h);
ok('dashboard shell', dash.includes('class="dash"') && dash.includes('<style>') && dash.includes('id="more"'));
```

- [ ] **Step 2: Run — có thể FAIL ở assert CSS/page nếu chưa wire; nếu CSS vẫn inline thì assert có thể PASS sớm. Mục tiêu cuối Task 3: toàn bộ PASS.**

```powershell
node tests/test-template.mjs
```

- [ ] **Step 3: Sửa `report.mjs`**

1. Thêm import:

```js
import { loadTemplate, renderTemplate } from './template.mjs';
```

2. Thay khối `export const CSS = \`...\`;` (dòng ~980–1224) bằng:

```js
// CSS sống ở tools/templates/report/report.css — export để caller/test và injectCss (performance) dùng.
export const CSS = loadTemplate('report.css');
```

3. Thay thân `page`:

```js
export function page(title, metaLine, body) {
  return renderTemplate('page.html', {
    title: esc(title),
    metaLine,
    body,
    css: CSS,
  });
}
```

4. Trong `dashboardPage`, giữ nguyên phần ráp `radios` / `filters` / `nav` / `panels`; chỉ thay `return \`<!doctype...\`` bằng:

```js
  return renderTemplate('dashboard.html', {
    title: esc(p.title),
    metaLine: p.metaLine,
    css: CSS,
    radios,
    filters,
    nav,
    panels,
  });
```

5. Xóa comment block “CSS — token thiết kế” cũ nếu đã chuyển hết.

- [ ] **Step 4: Run tests**

```powershell
node tests/test-template.mjs
node tests/test-review-report.mjs
node tests/test-assignee.mjs
```

Expected: tất cả PASS, exit 0.

- [ ] **Step 5: Commit**

```powershell
git add tools/lib/report.mjs tests/test-template.mjs
git commit -m "Render report shells from tools/templates/report"
```

---

### Task 4: Cập nhật status spec + xác nhận tương thích performance

**Files:**
- Modify: `docs/superpowers/specs/2026-08-11-report-templates-design.md` (status)
- Verify: `tools/lib/report-performance.mjs` không cần sửa code (vẫn `page()` + `injectCss` trên `</style>`)

- [ ] **Step 1: Smoke injectCss vẫn khớp**

```powershell
node --input-type=module -e "import { page } from './tools/lib/report.mjs'; const h=page('t','m','<p>b</p>'); const i=h.replace('</style>','EXTRA</style>'); if(!i.includes('EXTRA</style>')) throw new Error('inject point missing'); console.log('injectCss ok');"
```

Expected: `injectCss ok`

- [ ] **Step 2: Đổi status spec**

Trong `docs/superpowers/specs/2026-08-11-report-templates-design.md`, đổi dòng Status thành:

```markdown
**Status:** implemented
```

- [ ] **Step 3: Commit**

```powershell
git add docs/superpowers/specs/2026-08-11-report-templates-design.md
git commit -m "Mark report templates design as implemented"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| `tools/templates/report/{page,dashboard,report.css}` | Task 2 |
| `{{key}}` simple replace, cache, `import.meta.url` | Task 1 |
| `page` / `dashboardPage` / `export const CSS` giữ chữ ký | Task 3 |
| Self-contained `<style>` embed | Task 2–3 |
| Không partial / không report-kpi / zero npm | Global + không có task đụng |
| Throw nếu thiếu file | Task 1 |
| Test review + assignee | Task 3 Step 4 |
| injectCss performance | Task 4 |

Không còn TBD/placeholder trong các bước trên.
