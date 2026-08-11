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

