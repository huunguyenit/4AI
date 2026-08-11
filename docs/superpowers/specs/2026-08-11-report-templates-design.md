# Report shell templates — design

**Date:** 2026-08-11  
**Status:** approved for implementation (pending user review of this file)  
**Scope:** tách shell HTML + CSS dùng chung ra folder template; logic ráp dữ liệu giữ trong `.mjs`

## Vấn đề

`tools/lib/report.mjs` nhúng toàn bộ CSS (~250 dòng) và hai shell HTML (`page`, `dashboardPage`) trong function. Sửa layout/CSS phải đọc lẫn logic Node; khó mở file HTML trong editor để chỉnh giao diện.

## Mục tiêu

- Shell HTML và CSS sống trong file tĩnh dưới `tools/templates/report/`
- Khi render, load template + thay placeholder `{{key}}`, nhúng CSS vào `<style>` như hiện tại (báo cáo vẫn self-contained, offline)
- Không thêm npm dependency
- Giữ chữ ký `page()` / `dashboardPage()` / `export const CSS` để caller không vỡ

## Ngoài phạm vi

- Không tách partial (KPI, action list, chart SVG, bảng)
- Không refactor `report-kpi.mjs` (ngoại trừ tái dùng `page`/`CSS` như hiện tại)
- Không engine template (loop/if); không Handlebars/Mustache

## Quyết định đã chốt

| Mục | Chọn |
|---|---|
| Phạm vi | A — shell + CSS dùng chung |
| Placeholder | `{{key}}` thay chuỗi đơn giản |
| Vị trí | `tools/templates/report/` (không đặt trong `assets/`) |

## Cây thư mục

```
tools/templates/report/
  page.html
  dashboard.html
  report.css
```

## API

Thêm helper (trong `tools/lib/report.mjs` hoặc module nhỏ `tools/lib/template.mjs` nếu muốn tách sạch):

- `loadTemplate(name)` — đọc `tools/templates/report/<name>` bằng `fs.readFileSync`, cache `Map` theo process
- `renderTemplate(name, vars)` — thay mọi `{{key}}` bằng `String(vars[key] ?? '')`
- Không hỗ trợ nested key, loop, conditional trong template

`page(title, metaLine, body)` và `dashboardPage(p)` giữ chữ ký; bên trong gọi `renderTemplate`.

Phần động (radios, filter inputs, tab nav, panels) vẫn ráp bằng JS rồi truyền vào một slot — template chỉ là khung.

## Placeholder

### `page.html`

| Slot | Nội dung |
|---|---|
| `{{title}}` | đã `esc` trước khi truyền |
| `{{metaLine}}` | HTML có chủ đích (như hiện tại) |
| `{{body}}` | HTML body |
| `{{css}}` | nội dung `report.css` |

Footer cố định nằm trong file HTML.

### `dashboard.html`

| Slot | Nội dung |
|---|---|
| `{{title}}` | đã `esc` |
| `{{metaLine}}` | HTML có chủ đích |
| `{{css}}` | nội dung `report.css` |
| `{{radios}}` | input radio tab |
| `{{filters}}` | input radio bộ lọc |
| `{{nav}}` | label tab |
| `{{panels}}` | section panel |

Footer cố định nằm trong file HTML. Checkbox `#more` giữ trong template (cố định).

## CSS & tương thích

- Nội dung hiện tại của `export const CSS` chuyển sang `report.css`
- `export const CSS` vẫn tồn tại: lazy-load từ file (cùng cache với template) để:
  - `report-performance.mjs` tiếp tục `import { page, ... }` và `injectCss(html, PERF_CSS)` dựa trên `</style>`
  - test / caller khác không đổi
- Output HTML vẫn nhúng CSS trong `<style>{{css}}</style>` lúc render — không link file ngoài

## Kiểm chứng

- Chạy `tests/test-review-report.mjs`, `tests/test-assignee.mjs`
- Xác nhận HTML sinh ra vẫn có khối `<style>` đầy đủ và cấu trúc shell (header/main/footer, class `dash` cho dashboard) không đổi về hành vi

## Rủi ro / ghi chú

- Đường dẫn template resolve từ `import.meta.url` (cạnh `tools/lib`) → `../templates/report/`, không phụ thuộc `cwd`
- Thiếu file template → fail rõ (throw), không fallback về chuỗi cứng trong `.mjs` sau khi đã chuyển
