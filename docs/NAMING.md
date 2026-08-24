# Quy ước đặt tên asset

Thẩm quyền: file này đứng ngang `docs/ASSET-FORMAT.md` cho riêng phần **tên**. Khi
`schema.mjs` và file này mâu thuẫn về vocabulary, file này đúng và `schema.mjs` phải sửa
theo.

Cưỡng chế bằng `node tools/4ai.mjs check`. Trong lúc migration còn dở, vi phạm hiện dưới
dạng `WARN`; mỗi kind chuyển sang `ERROR` ngay khi đợt rename của kind đó đóng.

## Nguyên tắc nền

**Một artifact = một trách nhiệm.** Không có `erp-general-rules.md` gom SQL + XML + MVC +
Git. Cũng không tách tới mức `sql-select.md` / `sql-where.md` / `sql-join.md`. Ranh giới
đúng nằm ở chỗ: *người đọc có bao giờ cần đúng một nửa file này không?* Nếu không bao giờ,
đừng tách.

**Tên là hợp đồng, không phải nhãn.** `id` bằng tên file, và với command thì `id` chính là
cái người dùng gõ. Đổi tên là breaking change — phải đi qua một đợt migration, không đổi lẻ.

**Identifier tiếng Anh.** Văn xuôi tiếng Việt, nhưng `id`, `title`, tên thư mục thì tiếng
Anh. `fbo-tim-qua-khu` (nay là `erp-history-search`) là vi phạm, không phải ngoại lệ.

## Scope

Segment đầu của mọi `id`, và bằng đúng `domain`, và bằng đúng tên thư mục cấp 2.

| Scope | Thư mục | Bao gồm |
|---|---|---|
| `4ai` | `assets/<kind>s/4ai/` | Asset về chính hub 4AI — schema, sync, doctor, cách viết asset |
| `erp` | `assets/<kind>s/erp/` | Fast ERP: FBO và FBI gộp làm một (khác nhau ở SP version, không ở tri thức) |
| `pm` | `assets/<kind>s/pm/` | Quản lý dự án khách — ledger, UR, ADR, bàn giao |

Thêm scope mới là thay đổi kiến trúc: phải khai trong `targets.json:domains`, trong
`SCOPES` của `schema.mjs`, và trong bảng trên.

## Pattern theo kind

### doctrine — `<scope>-doctrine`

Mỗi scope đúng một doctrine. Luôn nạp. Không có biến thể.

    4ai-doctrine   erp-doctrine   pm-doctrine

### rule — `<scope>-<domain>-<concern>`

Ba segment trở lên. `<domain>` là mặt kỹ thuật bị ràng buộc (`xml`, `sql`, `program`,
`ledger`, `mcp`), `<concern>` là **danh từ** chỉ điều bị ràng buộc — không phải câu mệnh lệnh.

    erp-xml-encoding        erp-sql-style        pm-ledger-discipline
    erp-xml-pairing         erp-sql-access       pm-notes-secrets

Không: `erp-never-invent-files` (mệnh lệnh), `my-style-sql` (không có scope).

### skill — `<scope>-<object>-<capability>`

Capability đứng **cuối**, là động từ, lấy trong danh sách đóng dưới đây. Đối tượng đứng
trước động từ vì thư mục sort theo alphabet sẽ gom mọi skill cùng đối tượng lại một chỗ:
`erp-report-create` và `erp-report-pivot-create` nằm cạnh nhau, `erp-create-report` thì không.

**Capability hành động:** `create` · `generate` · `migrate` · `customize` · `implement` ·
`validate` · `analyze` · `optimize` · `review` · `author` · `maintain` · `propose` ·
`design` · `search` · `execute` · `apply`

**Capability tra cứu:** `lookup` (hỏi một thứ, trả một kết quả) · `reference` (từ điển,
đọc để biết bề mặt)

Hai capability tra cứu tồn tại có chủ đích. Skill tri thức thuần — `erp-sql-reference`,
`erp-glossary-reference` — không có động từ hành động nào đúng cả; ép một cái vào sẽ ra
tên nói dối về việc file đó làm gì.

    erp-category-create     erp-view-design        erp-sql-reference
    erp-hddv-migrate        erp-history-search     erp-navigation-lookup
    pm-ledger-maintain      pm-adr-author          pm-program-lookup

### agent — `<scope>-[<specialty>-]<role>`

Role đứng cuối, lấy trong danh sách đóng:

`architect` · `expert` · `reviewer` · `builder` · `debugger` · `tester` · `explorer` ·
`analyst` · `auditor`

`explorer` và `analyst` là phần mở rộng so với sáu role gốc, vì hub có hai agent điều tra
read-only không ánh xạ được vào role nào trong sáu: `erp-explorer` khảo sát một màn hình,
`pm-analyst` bóc một UR. Gọi chúng là `expert` sẽ xoá mất thông tin quan trọng nhất —
chúng **không có quyền ghi**.

    erp-sql-expert    erp-xml-expert    erp-reviewer
    erp-builder       erp-explorer      pm-architect

**Agent phải là một vai, không phải một quy trình.** Nếu tên tự nhiên của nó là một chuỗi
bước (`regulatory-rollout`, `release-handover`) thì nó là skill hoặc command đặt nhầm kind.

### command — `<scope>-<action>[-<object>]`

Scope đứng đầu, không phải action. Claude Code sort slash command theo alphabet: scope-first
thì `/erp-*` nằm chụm một cụm; action-first thì `/customize-erp` và `/review-erp` văng ra
hai đầu danh sách.

    /4ai-sync          /erp-customize       /pm-status
    /4ai-skill-create  /erp-diff-review     /pm-adr-create

### hook — chưa có trong hub

Hub hiện không có `kind: hook`. Nếu thêm sau này, pattern là `<event>-<action>`
(`validate-before-commit`, `format-after-edit`) — hook đặt tên theo *khi nào chạy*, không
theo *thuộc module nào*, vì runtime chọn hook theo event chứ không theo domain.

## Số thứ tự cho hierarchy

Đánh số ở **thư mục**, không ở file:

    assets/rules/10-erp/erp-xml-encoding.md      ✅
    assets/rules/erp/10-erp-xml-encoding.md      ❌

Vì `id` phải bằng tên file, số ở file sẽ chui vào `id` và ra tới slash command
(`/10-erp-customize`). Số ở thư mục chỉ để người đọc `ls` thấy thứ tự đọc, không ai gõ nó.

*(Hiện chưa bật đánh số — ba scope chưa đủ nhiều để cần.)*

## Metadata

Ngoài các field đã có trong `schema.mjs`:

| Field | Bắt buộc | Giá trị |
|---|---|---|
| `status` | không, mặc định `active` | `draft` · `active` · `deprecated` |
| `owner` | không | `core` · `backend` · `frontend` · `pm` |

`status: draft` — asset đang viết dở, vẫn emit nhưng `check` cảnh báo nếu để quá lâu.
`status: deprecated` — còn emit để không gãy tham chiếu, nhưng không được `see-also` tới nữa.

Hub **không** dùng id dạng `ERP-SQL-001`. `id` kebab-case đã là khoá duy nhất và đã được
`check` cưỡng chế không trùng; thêm một khoá số song song nghĩa là hai thứ phải giữ đồng bộ
bằng tay, và cái người dùng gõ vẫn là kebab-case.
