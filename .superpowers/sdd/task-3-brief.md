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

