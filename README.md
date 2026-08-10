# 4AI

Hub trợ lý AI cho FBO/FBI. **Nguồn sự thật duy nhất** cho rules, skills, sub-agents, slash
commands và cấu hình MCP — biên dịch ra format native của Claude Code, Cursor, VSCode/Copilot
và DevWorkFlow.

Sửa một chỗ trong `assets/`, chạy `sync`, mọi công cụ cập nhật. Trôi lệch trở thành lỗi
`check` chứ không phải chuyện phát hiện sau sáu tháng.

## Cài đặt & Chạy

**Yêu cầu:** Node.js ≥ 22. Không cần `npm install`, zero dependency.

```bash
# Clone repo
git clone https://github.com/huunguyenit/4AI.git
cd 4AI

# Kiểm tra tính hợp lệ (không ghi file)
node tools/4ai.mjs check

# Xem bảng tất cả asset
node tools/4ai.mjs list

# Xem một asset emit ra đâu
node tools/4ai.mjs explain <asset-id>

# Xem kế hoạch sync (không ghi)
node tools/4ai.mjs sync --dry-run

# Sync thật — ghi config vào Claude Code, Cursor, VSCode, DevWorkFlow
node tools/4ai.mjs sync
```

## Workflow — Sửa & Kiểm tra

1. **Sửa asset** trong `assets/` (Markdown + YAML frontmatter)
2. **Validate:** `node tools/4ai.mjs check` — exit 0 = OK
3. **Xem kế hoạch:** `node tools/4ai.mjs sync --dry-run`
4. **Sync:** `node tools/4ai.mjs sync` → config update trên tất cả platform

Chạy `check` hai lần không lỗi → không có side effect, an toàn push.

## Cấu trúc & File cần biết

| Thư mục / File | Mục đích |
|---|---|
| **`assets/`** | ★ **Nguồn sự thật**. Mỗi file = một asset (rule / skill / command / agent). Format: Markdown + YAML frontmatter |
| `mcp/servers.json` | Cấu hình MCP server |
| `data/` | Dữ liệu tham chiếu: `customers.json` (khách/program), `fbo-folders.json` (bản đồ FBO Controllers), `fbo-ddl.json` (schema DB) |
| `targets.json` | Nơi sync ghi tới (Claude Code, Cursor, VSCode, DevWorkFlow) |
| `tools/4ai.mjs` | CLI chính. Check / list / explain / sync |
| `tools/lib/` | Module (schema, emitter, writer) |
| `docs/` | Hướng dẫn chi tiết: `ASSET-FORMAT.md`, `TARGET-MATRIX.md`, `DEVWORKFLOW-CONTRACT.md` |
| `ledger/` | Dự án: task list, changelog, biên bản bàn giao |

## Tạo / Sửa Asset

### Format cơ bản

Mỗi asset là một file Markdown với YAML frontmatter:

```yaml
---
name: my-skill
description: Tóm tắt một dòng cho gallery
type: skill
metadata:
  category: project-mgmt
---

# Nội dung Markdown

Viết hướng dẫn, công thức, quy trình...
```

**Các loại asset:** `rule`, `skill`, `agent`, `command`, `doctrine`

Cách ghi chi tiết: [docs/ASSET-FORMAT.md](docs/ASSET-FORMAT.md)

### Kiểm tra trước khi push

```bash
# Validate tất cả asset
node tools/4ai.mjs check

# Xem asset này emit ra file nào
node tools/4ai.mjs explain my-skill
```

**Lỗi thường gặp:**
- Thiếu field `name`, `description`, `type` trong frontmatter
- `name` không unique
- Markdown syntax sai
- Reference asset không tồn tại

## Sync — Đưa lên Tool

Khi `check` pass, sync sẽ:
- **Claude Code:** Ghi vào `.claude/` (rules, commands, skills)
- **Cursor:** Ghi vào `.cursor/` (bộ quy tắc `rules`, command)
- **VSCode/Copilot:** Ghi vào `.github/` (instructions, prompts)
- **DevWorkFlow:** Ghi vào `ai-kit.json` + `emit/devworkflow.json`

```bash
# Preview trước khi commit
node tools/4ai.mjs sync --dry-run

# Ghi thật
node tools/4ai.mjs sync

# Commit & push
git add .
git commit -m "Update assets: add/fix my-skill"
git push
```

**Sau khi push**, collaborator khác chạy `sync` ở máy họ để nhận config mới.

## Bảo mật — Không lộ Secret

❌ **Không bao giờ commit:**
- Connection string, password, API key
- Dữ liệu nhạy cảm khách hàng
- Token hoặc credential

✅ **Nếu phải reference:**
- Dùng program path: `D:\path\to\program\App_Data`
- Dùng DB alias: `PROD_DB`, `DEV_DB` (định nghĩa ở đâu khác)
- Không viết giá trị thực trong asset

## Hỏi & Trao đổi

- **Bug hoặc gợi ý:** Mở issue trên GitHub
- **Thay đổi lớn:** Tạo draft PR, mô tả bối cảnh & lý do
