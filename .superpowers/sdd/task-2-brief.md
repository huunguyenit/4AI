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

