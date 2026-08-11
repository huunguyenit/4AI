# Task 3 Report — Wire report.mjs into templates

**Status:** DONE
**Branch:** `feat/report-shell-templates`
**Date:** 2026-08-11

## Summary

Wired `tools/lib/report.mjs` to use `loadTemplate`/`renderTemplate` from `./template.mjs`
per brief. `page()` and `dashboardPage()` now render `page.html`/`dashboard.html`;
`export const CSS` now loads `report.css`. Removed the old ~245-line inline CSS
template literal. Did not touch `assignee.mjs`, `ddl.mjs`, `workdays.mjs`, or any
validation/business logic.

## Changes

- `tools/lib/report.mjs`: added `import { loadTemplate, renderTemplate } from './template.mjs'`;
  replaced `page()` body, `dashboardPage()` return, and the inline `export const CSS`
  template literal with the three snippets from the brief. Removed the old CSS
  comment header and dead code.
- `tests/test-template.mjs`: added imports for `page`, `CSS`, `renderReport`,
  `validatePayload` from `report.mjs` and `loadHolidays` from `workdays.mjs`;
  appended 5 smoke asserts (CSS non-empty, `page()` embeds css/slots, `page()` has
  no dash class, payload validates, `renderReport()` produces dashboard shell).

## Deviation from brief

The brief's exact test payload (`yeuCau[0]` with `trang_thai: 'DD'`, `ma_lt1: ''`,
no `menu_id`/`sysid`) fails `validatePayload` — it's not fatal but triggers a
pre-existing **quality** warning ("ở DD chưa có `ma_lt1` mà cũng không có
`menu_id`/`sysid`") from `validatePayloadDetailed` (existing logic, unrelated to
templating, predates this task). Added `menu_id: 'M1'` to the fixture UR so
`validatePayload(payload).length === 0` holds, without touching `report.mjs`
validation logic (out of scope here). This is a minimal, surgical deviation —
the smoke test's actual intent (verify dashboard shell renders) is unaffected.

## Verification

### node tests/test-template.mjs

All 9 asserts PASS (4 pre-existing template-loader tests + 5 new report.mjs
smoke asserts), exit 0.

### node tests/test-review-report.mjs

7/9 PASS. 2 pre-existing FAILs ("Thẻ tóm tắt đếm..."), confirmed via `git stash`
to exist identically **before** Task 3's edits — caused by an unrelated
in-progress change (`laChuaPhanCong` added to `assignee.mjs` but not yet wired
into `report.mjs`'s `chuaGiao`/`chuaChot` KPI counts). Not caused or touched by
this task.

### node tests/test-assignee.mjs

25/27 PASS. Same 2 pre-existing FAILs ("Thẻ tóm tắt đếm DD chưa giao"), same
root cause, confirmed pre-existing via `git stash` before/after comparison.

### Extra checks

- `node --check tools/lib/report.mjs` — syntax OK.
- `ReadLints` on both modified files — no linter errors.
- `report.css` content confirmed byte-identical to what was previously inline
  in `report.mjs` (Task 2 already verified this; re-confirmed no drift).

## Commit

```
c685f51 Render report shells from tools/templates/report
```

2 files changed (`tools/lib/report.mjs`, `tests/test-template.mjs`),
36 insertions(+), 291 deletions(-). Did not stage or commit unrelated
pre-existing uncommitted changes present in the working tree at task start
(`tools/lib/assignee.mjs`, `ledger/review/**` HTML/JSON artifacts) — those are
out of scope for this task and were left untouched.

## Concerns

- The 2 pre-existing test failures in `test-review-report.mjs` and
  `test-assignee.mjs` remain unresolved (not introduced by this task, and
  fixing them requires wiring `laChuaPhanCong` into `report.mjs`'s summarize
  logic — a separate, unrelated change). Flagging for whoever owns that WIP.
- Minor test-fixture deviation from brief's literal payload (see above) —
  necessary for the assert to be meaningful; did not alter `report.mjs` logic.
