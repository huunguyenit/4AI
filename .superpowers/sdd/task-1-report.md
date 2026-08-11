# Task 1 Report — `template.mjs` + unit test

**Branch:** `feat/report-shell-templates`  
**Date:** 2026-08-11  
**Status:** DONE

## Summary

Implemented the report template loader helper (`tools/lib/template.mjs`) and its unit test (`tests/test-template.mjs`) following TDD exactly as specified in the task brief. No HTML/CSS shell files were created (Task 2) and `report.mjs` was not modified (Task 3).

## TDD Steps Executed

| Step | Action | Result |
|------|--------|--------|
| 1 | Created `tests/test-template.mjs` verbatim from brief | OK |
| 2 | Ran `node tests/test-template.mjs` before implementation | `ERR_MODULE_NOT_FOUND` for `template.mjs` (expected) |
| 3 | Created `tools/lib/template.mjs` verbatim from brief | OK |
| 4 | Ran `node tests/test-template.mjs` after implementation | 4× PASS, exit 0 |
| 5 | Committed task files only | `9ae0b4f` |

## Files Created

| File | Purpose |
|------|---------|
| `tools/lib/template.mjs` | `loadTemplate`, `renderTemplate`, `clearTemplateCache` |
| `tests/test-template.mjs` | Unit test with ephemeral `_test_fixture.html` |

## Interface Delivered

- **`loadTemplate(name)`** — reads `tools/templates/report/<name>` via `import.meta.url`-relative path; caches in `Map`; throws `Error('template không tồn tại: …')` when missing.
- **`renderTemplate(name, vars?)`** — loads template and replaces `{{key}}` with `String(vars[key] ?? '')`.
- **`clearTemplateCache()`** — clears cache (test-only export).

## Test Results

```
PASS  render thay key có mặt
PASS  key thiếu → chuỗi rỗng
PASS  load cache cùng nội dung
PASS  thiếu file → throw
```

Exit code: 0

## Commit

```
9ae0b4f Add template loader with {{key}} substitution
```

Files in commit:
- `tools/lib/template.mjs`
- `tests/test-template.mjs`

Unrelated working-tree changes (ledger review HTML, `assignee.mjs`, `report.mjs`) were **not** staged.

## Self-Review

### Constraints compliance

| Constraint | Met? | Notes |
|------------|------|-------|
| Zero npm dependency | Yes | Only `node:fs`, `node:path`, `node:url` |
| Path via `import.meta.url` | Yes | `TEMPLATE_DIR` resolves to `../templates/report` from `tools/lib/` |
| Missing file → throw clearly | Yes | Error message includes absolute path |
| No page/dashboard/css yet | Yes | Only loader; test creates/deletes `_test_fixture.html` |
| No `report.mjs` changes | Yes | Untouched |

### Code quality

- Matches existing test harness pattern (`ok` helper, `process.exit(failures ? 1 : 0)`) used in `tests/test-assignee.mjs`.
- Cache keyed by template name; `clearTemplateCache` enables isolated missing-file test.
- Regex `\{\{(\w+)\}\}` limits keys to word characters — sufficient for planned shell placeholders.

### Hub validation

`node tools/4ai.mjs check` — 0 errors, 0 warnings.

### Concerns / follow-ups for later tasks

1. **Template directory** — `tools/templates/report/` is created at runtime by the test (`fs.mkdirSync`); Task 2 should add real shell files there.
2. **Placeholder syntax** — `\w+` only; keys with hyphens or dots won't substitute (not required by brief).
3. **No path traversal guard** — `name` is joined directly; acceptable for internal use but callers should pass bare filenames only.

## Out of Scope (confirmed not done)

- `tools/templates/report/page.html`, `dashboard.html`, `report.css`
- Changes to `tools/lib/report.mjs`
- Push to remote
