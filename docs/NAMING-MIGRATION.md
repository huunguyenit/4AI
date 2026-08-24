# Migration đặt tên — bảng tra tên cũ

**Migration đã xong.** Toàn bộ 67 asset đạt chuẩn `docs/NAMING.md`; `NAMING_ENFORCED`
phủ mọi kind nên sai tên là ERROR chặn sync.

File này lẽ ra xoá khi đợt cuối đóng. Giữ lại vì tên cũ vẫn sống ở hai chỗ không sửa
được: các mục `## [Chưa phát hành]` trong `CHANGELOG.md` (ghi chép lịch sử) và trí nhớ
người dùng. Xoá khi không ai còn tra tên cũ nữa — không có mốc thời gian cứng cho việc đó.

Mỗi đợt là một commit. Sau mỗi đợt: `check` phải exit 0, `sync --dry-run` chạy hai lần
phải cho cùng kết quả, và kind vừa xong được chuyển từ `WARN` sang `ERROR` trong
`schema.mjs:NAMING_ENFORCED`.

| Đợt | Nội dung | Trạng thái |
|---|---|---|
| 0 | `docs/NAMING.md`, field `status`/`owner`, check ở mức WARN | ✅ xong |
| 1 | thư mục domain (mọi kind) + doctrine (3) + rule (14) | ✅ xong |
| 2 | skill (26) — kéo theo thư mục `references/` | ✅ xong |
| 3 | agent (12) — gồm 3 asset đổi kind | ✅ xong |
| 4 | command (12) — đổi tên slash command người dùng gõ | ✅ xong |
| 5 | sync thật, cập nhật README + CHANGELOG | ✅ xong |

Thư mục domain đổi tên **một lần, cho mọi kind, trong đợt 1**: `core/` → `4ai/`,
`fbo-xml/` → `erp/`, `project-mgmt/` → `pm/`. Đổi từng đợt sẽ bắt `targets.json` phải khai
sáu domain song song suốt bốn commit — một file config chung ở trạng thái nửa vời là chỗ
dễ có người sửa nhầm nhất. Đổi `domain:` không đụng tới `id`, nên các kind chưa migrate
vẫn nguyên tên.

## Đợt 1 — doctrine

| Cũ | Mới |
|---|---|
| `core-doctrine` | `4ai-doctrine` |
| `fbo-doctrine` | `erp-doctrine` |
| `pm-doctrine` | *giữ nguyên* |

## Đợt 1 — rule

| Cũ | Mới | Ghi chú |
|---|---|---|
| `my-style-sql` | `erp-sql-style` | không có scope, tên cá nhân hoá |
| `fbo-sql-via-mcp` | `erp-sql-access` | |
| `fbo-encoding-and-newlines` | `erp-xml-encoding` | |
| `fbo-f-vs-xml-pairing` | `erp-xml-pairing` | |
| `fbo-entity-resolution-first` | `erp-xml-entity-resolution` | |
| `fbo-never-invent-files` | `erp-xml-existence` | concern là danh từ, không phải mệnh lệnh |
| `fbo-customization-scope` | `erp-program-scope` | |
| `fbo-lookup-discipline` | `erp-mcp-lookup` | |
| `fbo-layer-routing` | `erp-agent-routing` | |
| `pm-no-secrets-in-notes` | `pm-notes-secrets` | |
| `pm-program-from-workspace` | `pm-program-detection` | |
| `pm-scope-question-first` | `pm-scope-clarification` | |
| `pm-ledger-discipline` | *giữ nguyên* | đã đúng 3 segment |
| `pm-ur-routing` | *giữ nguyên* | |

## Đợt 2 — skill

| Cũ | Mới | Ghi chú |
|---|---|---|
| `4ai-asset-authoring` | `4ai-asset-author` | |
| `fbo-tim-qua-khu` | `erp-history-search` | id tiếng Việt |
| `fbo-nd252-ty-gia-hq` | `erp-nd252-implement` | id tiếng Việt |
| `fbo-create-category` | `erp-category-create` | |
| `fbo-create-hddv` | `erp-hddv-migrate` | |
| `fbo-create-skill` | `erp-skill-author` | ⚠ chồng trách nhiệm với `4ai-asset-author` |
| `fbo-customization-workflow` | `erp-customization-execute` | |
| `fbo-design-view-field` | `erp-view-design` | |
| `fbo-einvoice-customize` | `erp-einvoice-customize` | |
| `fbo-einvoice-nd70-discount` | `erp-einvoice-nd70-implement` | |
| `fbo-get-voucher-data` | `erp-voucher-data-lookup` | |
| `fbo-new-table-proposal` | `erp-table-propose` | |
| `fbo-js-patterns` | `erp-js-implement` | |
| `fbo-report` | `erp-report-create` | |
| `fbo-report-pivot` | `erp-report-pivot-create` | |
| `fbo-controller-anatomy` | `erp-controller-reference` | tri thức thuần |
| `fbo-js-api` | `erp-js-api-reference` | tri thức thuần |
| `fbo-glossary-reference` | `erp-glossary-reference` | |
| `fbo-sql-reference` | `erp-sql-reference` | |
| `fbo-navigation-recipes` | `erp-navigation-lookup` | |
| `fbo-program-config` | `erp-program-config-lookup` | |
| `fbo-sql-object-lookup` | `erp-sql-object-lookup` | |
| `pm-adr` | `pm-adr-author` | |
| `pm-capability-graph` | `pm-graph-maintain` | |
| `pm-customer-program-registry` | `pm-program-lookup` | |
| `pm-task-ledger` | `pm-ledger-maintain` | |

## Đợt 3 — agent

| Cũ | Mới | Ghi chú |
|---|---|---|
| `fbo-backend` | `erp-sql-expert` | tên cũ nói tầng, không nói vai |
| `fbo-frontend` | `erp-xml-expert` | |
| `fbo-glossary` | `erp-glossary-expert` | |
| `fbo-change-reviewer` | `erp-reviewer` | |
| `fbo-customizer` | `erp-builder` | |
| `fbo-explorer` | `erp-explorer` | |
| `pm-planner` | `pm-architect` | |
| `pm-ur-analyst` | `pm-analyst` | |
| `pm-release-auditor` | `pm-auditor` | |

Ba asset **đổi kind** — chúng là quy trình, không phải vai:

| Cũ (agent) | Thành | Ghi chú |
|---|---|---|
| `fbo-regulatory-rollout` | skill `erp-rollout-execute` | mất context riêng; đọc kỹ body trước khi chuyển |
| `pm-release-handover` | skill `pm-handover-author` | |
| `pm-deadline-review` | skill `pm-deadline-review` (id giữ nguyên) | **đổi so với kế hoạch**: gộp vào command sẽ nhét một quy trình 85 dòng vào thân `/pm-review`, mà command đó còn hai nhánh có-shell / không-shell cùng cần quy trình ấy. Để nó làm skill thì cả hai nhánh trỏ về một nguồn. `pm-deadline-review` vốn đã hợp lệ theo pattern skill (`review` là capability), nên id không phải đổi. |

## Đợt 4 — command

| Cũ | Mới |
|---|---|
| `/doctor` | `/4ai-doctor` |
| `/sync` | `/4ai-sync` |
| `/new-rule` | `/4ai-rule-create` |
| `/new-skill` | `/4ai-skill-create` |
| `/new-agent` | `/4ai-agent-create` |
| `/fbo-customize` | `/erp-customize` |
| `/fbo-find` | `/erp-screen-find` |
| `/fbo-review` | `/erp-diff-review` |
| `/fbo-sql` | `/erp-sql-query` |
| `/pm-new-adr` | `/pm-adr-create` |
| `/pm-review` | *giữ nguyên* — đợt 3 đã lấy id `pm-deadline-review` cho skill; `pm-review` vốn đã hợp lệ (`<scope>-<action>`) |
| `/pm-status` | *giữ nguyên* |

## Nợ kỹ thuật ghi nhận, chưa xử lý

- `docs/ASSET-FORMAT.md` và `docs/TARGET-MATRIX.md` được `CLAUDE.md` khai là nguồn chuẩn
  cao nhất nhưng **không tồn tại trong repo**.
- `erp-skill-author` và `4ai-asset-author` chồng trách nhiệm — cân nhắc gộp ở đợt 5.
- README đếm sai số asset trong gói plugin (`26 skill`, thực tế thư mục plugin đang có 42).
  Số đúng chỉ biết sau khi sync thật ở đợt 5 — đừng đoán, đếm rồi sửa.
