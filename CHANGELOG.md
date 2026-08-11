# Changelog

Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/). Version đánh theo mốc bàn giao
beta nội bộ, chưa theo semver nghiêm ngặt vì dự án chưa có `package.json`.

## [v0.1.0-beta] — 2026-08-11

Bản đóng gói đầu tiên để đồng nghiệp nội bộ (dev/PM dùng FBO) thử nghiệm beta. Giai đoạn 1 —
compiler hub và bộ asset FBO/FBI — coi như hoàn tất; từ đây tập trung thu feedback trước khi
mở rộng.

### Có gì trong bản này

- **Compiler hub** (`tools/4ai.mjs`): `check` / `sync` / `sync --dry-run` / `list` / `explain` —
  biên dịch một corpus markdown thành bốn phương ngữ config (Claude Code, Cursor, Antigravity,
  VSCode/Copilot).
- **49 asset**: 3 doctrine, 13 rule, 15 skill, 6 agent, 12 command — bao phủ quy trình FBO
  (customize, review diff, tra cứu SQL, điều tra màn hình) và PM (ledger, deadline review,
  customer/program registry, capability graph).
- **Report templates**: dashboard HTML ngoại tuyến (rà soát UR, KPI phòng ban), template tĩnh
  không CDN, xem được offline.
- **Report workflow qua MCP**: `plan_report` → agent tự viết SQL → `execute_report`, SQL luôn
  qua lớp validate theo metadata đã chốt.
- **Prompt tool** (`tools/lib/prompt.mjs`): sinh prompt gợi ý từ payload rà soát UR để dán thẳng
  vào Claude Code, không phải gõ lại ngữ cảnh tay.
- **Assignee tweaks** (`tools/lib/assignee.mjs`): gợi ý phân công UR dựa trên khối lượng, chuyên
  môn, thời gian rảnh, mức ưu tiên.
- **MCP server** `4ai-fbo`: `find_controller`, `describe_controller`, `resolve_entities`,
  `query_sql`, `list_related`, `search_content`, và các tool tra cứu khác cho chương trình FBO.

### Đã sửa trước khi đóng gói

- `tools/lib/prompt.mjs`: bỏ hardcode tên MCP tool cụ thể (`resolve_entities`,
  `data/customers.json`) trong prompt sinh tự động — môi trường có nhiều MCP nội bộ khác nhau,
  để agent tự chọn tool phù hợp theo ngữ cảnh thay vì ép một tên cố định.

### Biết trước khi test

- Mapping cho **Antigravity** dựng từ tài liệu công khai, **chưa verify** trên workspace thật —
  xem ghi chú đầu `tools/lib/emit/antigravity.mjs`.
- Chưa có test runner tự động hoá qua CI (`.github/` chưa có workflow) — `node tools/4ai.mjs check`
  và các file trong `tests/` phải chạy tay trước khi commit.
- Chưa có cơ chế version/package chính thức (`package.json`) — dự án cố tình zero npm dependency,
  cài đặt bằng `git clone` + chạy trực tiếp bằng Node.

### Cách feedback

Xem [BETA.md](BETA.md).
