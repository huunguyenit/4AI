---
id: erp-skill-author
title: FBO — Skill authoring standard
kind: skill
domain: erp
description: Chuẩn FBO khi viết hoặc refactor một skill — pattern tổng quát trước ví dụ cụ thể, progressive disclosure, mô tả phủ hết case. Mở khi tạo skill FBO mới hoặc chuẩn hoá skill quá đặc thù.
requires: [4ai-fbo]
see-also: [4ai-asset-author]
version: 1
---
Skill này **bổ sung** `4ai-asset-author`, không thay thế. `4ai-asset-author` giữ hợp
đồng của hub (schema frontmatter, subset YAML, nơi đặt file, bước `check` bắt buộc); file này
chỉ nói **cách viết nội dung** một skill FBO cho đúng độ trừu tượng.

> Hai nguồn mâu thuẫn thì `4ai-asset-author` thắng — nó bám sát `schema.mjs`.

**Mục tiêu:** agent đọc skill và viết đúng **pattern chung**, không gắn một dự án / proc / danh mục cụ thể làm “định nghĩa”.

---

## Khi nào dùng

- User yêu cầu tạo skill mới cho workflow FBO
- Skill hiện tại mô tả quá đặc thù (một `ma_ct`, một file, một nghiệp vụ)
- Cần tách SKILL.md dài → file con
- User đưa **nguyên văn** đoạn mô tả — giữ verbatim trong skill

---

## Nguyên tắc cốt lõi (FBO)

| # | Nguyên tắc | Sai | Đúng |
|---|-----------|-----|------|
| 1 | **Pattern trước, ví dụ sau** | “Làm như `InputInvoice.xml`” | “Request trước — làm sau”; InputInvoice chỉ ở mục Ví dụ |
| 2 | **Điều kiện chọn, không tên proc** | “Dùng `rs_rptSalesOrderList`” | “Listing — Filter có đơn vị/kho → GetUnitFilter…” |
| 3 | **Placeholder generic** | `name`, `ma_dvcs`, `m64` | `@pk1`, `@scope_col`, `m**`, `{controller}` |
| 4 | **Progressive disclosure** | 800 dòng trong SKILL.md | SKILL gọn + `reference-*.md` / `check-*.md` |
| 5 | **Một thuật ngữ** | Trộn “check quyền 2 bước” / “deferred” | Chọn một: “Request trước — làm sau” |
| 6 | **WHAT + WHEN trong description** | “Skill SQL” | “Viết proc báo cáo… Dùng khi user yêu cầu rs_/zc_…” |

Chi tiết + checklist: [reference-patterns.md]({REFDIR}/reference-patterns.md)

---

## Workflow tạo skill

```
- [ ] 1. Xác định phạm vi + trigger (user sẽ nói gì để skill được load)
- [ ] 2. Chọn pattern chung (1–3 pattern, không hơn)
- [ ] 3. SKILL.md: workflow + checklist + link file con
- [ ] 4. File con: snippet/template generic + “Ví dụ tham chiếu” cuối file
- [ ] 5. Description ngôi thứ ba, **≤200 ký tự** (giới hạn cứng của `schema.mjs`), có từ khoá trigger
- [ ] 6. Verify: SKILL.md < 500 dòng; link chỉ 1 cấp
```

### Bước 1 — Phạm vi

Hỏi (nếu chưa rõ):

- Skill phục vụ task gì? (JS handler / proc báo cáo / proc CT / danh mục / MCP field…)
- Personal (`~/.cursor/skills/`) hay project (`.cursor/skills/`)?
- Có đoạn user muốn **giữ nguyên văn** không?

**Không** viết skill thẳng vào thư mục sinh ra (`.claude/skills/`, `.cursor/skills/`) — sync sẽ
từ chối hoặc ghi đè. Nguồn nằm ở `assets/skills/<domain>/<id>.md` trong hub.

### Bước 2 — Cấu trúc thư mục

```
fbo-{topic}/
├── SKILL.md              # Bắt buộc — overview, workflow, checklist
├── reference-{x}.md      # Pattern chi tiết, snippet SQL/JS/XML
├── examples-{x}.md       # (tùy) end-to-end một dự án
└── scripts/              # (hiếm) chỉ khi cần script cố định
```

Đặt tên: `fbo-` prefix cho domain FastBusiness; lowercase, hyphen.

### Bước 3 — Viết SKILL.md

```markdown
---
name: fbo-xxx
description: >-
  [WHAT — third person]. [WHEN — trigger terms].
---

# Tiêu đề

[Một đoạn: skill giải quyết gì]

## Khi nào dùng
- bullet trigger

## Workflow / Luồng
[checklist hoặc diagram ngắn]

## [Pattern chính — tên tổng quát]
[Tóm tắt 5–15 dòng, link file con]

## Checklist
- [ ] ...

## Tài liệu
| File | Nội dung |
```

**SKILL.md không chứa:** snippet dài lặp lại file con; toàn bộ SQL một proc; logic chỉ đúng một `ma_ct`.

### Bước 4 — File con

Cấu trúc chuẩn mỗi `reference-*.md`:

1. **Chọn pattern** (bảng điều kiện)
2. **Template generic** (placeholder)
3. **Checklist** ngắn
4. **Ví dụ tham chiếu** (1 đoạn: tên file / proc / dự án — không nhúng vào định nghĩa pattern)

### Bước 5 — Refactor skill cũ

Khi skill đã quá đặc thù:

1. Tách phần dài → file con mới (vd `reference-data-load.md`, `js-request-deferred.md`)
2. Đổi tiêu đề mục: tên proc → điều kiện nghiệp vụ
3. Thay hardcode bằng `**` / `@param` / `{table}`
4. Cuối file con: “Ví dụ: `zc_xxx` trong `file.sql`”

---

## Mẫu description (FBO)

```yaml
# Danh mục
description: >-
  Tạo/chỉnh danh mục FBO (Dir+Grid), khóa PK, validation trùng (=, fsd_StringToTable, OldValue).
  Dùng khi tạo danh mục, check trùng, PK kép, hoặc user đưa cặp Dir/Grid.

# JS
description: >-
  JavaScript FBO (ES5): f.request, fill grid, FlowMulti, request trước làm sau.
  Dùng khi onChange, toolbar async, popup chọn, ResponseComplete.

# Proc báo cáo
description: >-
  Stored procedure báo cáo FBO: 4 vùng Struct/Key/Data/Processing; 3 chiến lược load DATA.
  Dùng khi rs_*, zc_* báo cáo, pivot, listing, Partition$Execute.
```

---

## Anti-pattern (FBO skill)

```
❌  “Mẫu chuẩn = proc X” làm cả skill
❌  Pattern đặt tên theo 1 màn hình (CheckPqDvumh, zcpqdvumhhddv)
❌  Hardcode m64$202606 trong template skill
❌  Trùng nội dung dài giữa SKILL.md và file con
❌  Nhiều tên cho cùng một luồng (deferred / 2 bước / check quyền)
❌  Link reference lồng 2–3 cấp
❌  Paraphrase đoạn user yêu cầu giữ nguyên văn
```

---

## Tham chiếu skill FBO đã chuẩn hóa

| Skill | Pattern chính | File con điển hình |
|-------|---------------|-------------------|
| `fbo_js_skill` | Request trước — làm sau | `js-request-deferred.md` |
| `erp-category-create` | Validation A/B/C | `check-trung.md` |
| `erp-report-create` | 3 chiến lược load DATA | `{REFDIR}/reference-sql-format.md` của chính nó |
| `erp-report-create` | Filter field@name + proc English | `reference-sql-format.md` |
| `erp-report-pivot-create` | RS1/RS2 xoay cột (kế thừa erp-report-create) | `reference-pivot.md` |
| `erp-voucher-data-lookup` | Pipeline CT→CT | `{REFDIR}/reference-example-pqadms.md` của chính nó |

Khi tạo skill mới cùng domain — đọc một skill tương tự để giữ **cùng tone và cấu trúc**.

---

## Checklist trước khi giao user

- [ ] `name` + `description` đúng format create-skill
- [ ] Pattern tổng quát; ví dụ tách mục riêng
- [ ] SKILL.md < 500 dòng
- [ ] Link file con một cấp; đường dẫn `/` không `\`
- [ ] Thuật ngữ nhất quán trong toàn bộ skill
- [ ] Không gắn skill vào một customer/project cụ thể (trừ ví dụ cuối)
