# 4AI — AI Assistant Hub for FBO/FBI

Một bộ quy tắc (rules), hướng dẫn (skills), và tác nhân tự động (agents) **tập trung cho FBO/FBI** — viết một lần, dùng trên tất cả platform: **Claude Code, Cursor, Antigravity** và VSCode/Copilot.

## 🎯 Tính năng chính

| Tính năng | Mô tả | Dùng ở đâu |
|---|---|---|
| **Rules** | Quy tắc kiểm soát chất lượng: không lộ secret, tên biến, lỗi phổ biến | Tất cả platform |
| **Skills** | Quy trình cụ thể: customize FBO, rà soát yêu cầu, quản lý dự án | Claude, Cursor |
| **Agents** | Tác nhân tự động: phân tích tài liệu, audit code, kiểm tra compliance | Claude (chạy standalone) |
| **Commands** | Slash command: `/fbo-find`, `/pm-status`, `/sync` | Claude Code, Cursor |
| **Báo cáo** | Dashboard HTML ngoại tuyến: rà soát UR, KPI phòng ban | Export từ tool |
| **MCP Servers** | Kết nối tới database, API QLDA nội bộ | Claude, Cursor |

## 🚀 Dùng trên từng Platform

### Claude Code
Sau khi `sync`, assets tự động xuất hiện trong thư mục `.claude/`:
- **Rules** → `.claude/rules/` — tự động chạy trước mỗi response
- **Skills** → `.claude/skills/` — gọi bằng `/skill-name`
- **Commands** → `.claude/commands.json` — tích hợp vào command palette
- **Slash commands** → `/fbo-find`, `/pm-status`, `/sync` và 10+ command khác

Ví dụ: `/pm-status` hiển thị trạng thái tất cả task trong `ledger/`, phân theo dự án.

### Cursor
Cung cấp rules + commands cho Copilot, để làm việc FBO/FBI tự động:
- **Cursor Rules** → `.cursor/rules/` — chạy mỗi lần gõ, giúp tránh lỗi thường gặp
- **Rules áp dụng:** Không viết SQL tay, luôn dùng `query_sql`; không lộ connection string; dùng `resolve_entities` trước khi sửa XML FBO
- Cursor hoạt động offline — chuẩn bị tài liệu trước bằng `query_sql` rồi truyền vào prompt

### Antigravity
Xuất ra thư mục `.agents/` — rules, skills, agents, workflow (slash command), MCP:
- **Rules** → `.agents/rules/` — doctrine/rule always là `trigger: always_on`, rule có `globs` là `trigger: glob`
- **Skills** → `.agents/skills/<id>/SKILL.md`
- **Agents** → `.agents/agents/<id>.md`
- **Commands** → `.agents/workflows/<id>.md`, gọi bằng `/<id>`

Antigravity đang public preview — mapping trên dựng từ tài liệu công khai, chưa verify trên
workspace thật (xem ghi chú đầu `tools/lib/emit/antigravity.mjs`).

### VSCode / GitHub Copilot
Export rules vào `.github/instructions/` — Copilot tạo PR/review tuân theo tiêu chuẩn.

## 🎓 Cách sử dụng

### Quickstart — Sửa một điều gì đó

Bạn muốn thêm một quy tắc, hướng dẫn, hoặc tác nhân:

```bash
# 1. Clone & setup
git clone https://github.com/huunguyenit/4AI.git
cd 4AI

# 2. Sửa hoặc tạo asset (ví dụ: skill mới)
# Mở assets/skills/fbo-xml/your-skill.md
# Viết theo format: YAML frontmatter + Markdown content

# 3. Validate
node tools/4ai.mjs check

# 4. Xem kế hoạch sync (preview)
node tools/4ai.mjs sync --dry-run

# 5. Sync thật — config update trên tất cả platform
node tools/4ai.mjs sync

# 6. Commit & push
git add .
git commit -m "Add/update skill or rule"
git push
```

**Sau khi push:** 
- Claude Code: Chạy `/sync` để nhận config mới
- Cursor: Reload cửa sổ hoặc `Ctrl+Shift+P` → reload
- Antigravity: Reload workspace để nhận config mới

### Kiểm tra bao gồm gì

```bash
node tools/4ai.mjs list                   # Xem tất cả asset
node tools/4ai.mjs explain <asset-id>    # Asset này emit ra file nào
node tools/4ai.mjs check                  # Validate — exit 0 = OK
```

## 📊 Báo cáo — Dashboard HTML ngoại tuyến

Tạo báo cáo không cần server, không phụ thuộc internet. Dashboard SVG tự render, xem offline:

### 1. Báo cáo Rà Soát Yêu Cầu (UR Review)
**Dùng cho:** PM rà soát tiến độ UR hàng tuần/tháng

**Hiển thị:**
- Danh sách UR quá hạn, sắp tới hạn
- Giai đoạn chưa chốt hẹn → đề xuất cách xử lý
- Kiểm TLKS → yêu cầu nào ngoài scope, cần căn cứ thêm
- Gợi ý DDL → nếu UR nhắc tạo bảng
- Biểu đồ: hạn theo giai đoạn, phân bố UR theo trạng thái, TLKS coverage

**Cách dùng:**
```bash
node tools/4ai.mjs report payload-ur.json
```
Kết quả: `ledger/<ma_da>/review/<ngay>.html` — xem trong browser (offline OK)

### 2. Dashboard Hiệu Suất Nhân Viên (KPI by Department)
**Dùng cho:** Quản lý phòng ban theo dõi khối lượng, so sánh hiệu suất

**Hiển thị:**
- KPI summary: tổng yêu cầu, số NV, hạng phòng bạn
- So sánh phòng ban: bảng + biểu đồ thanh, highlight phòng của bạn
- Xu hướng qua thời gian: phòng bạn vs trung bình công ty
- Top 5 toàn công ty & top 5 trong phòng (theo tháng/tuần)
- Chi tiết từng NV: bảng pivot năng suất

**Cách dùng:**
```bash
node tools/4ai.mjs report payload-perf.json
```
Kết quả: `ledger/_performance/<thang|tuan>-<ngay>.html` — xem trong browser

**Chuẩn bị dữ liệu:**
- Query QLDA database: `SELECT emp, dept, period, yc, sl FROM ...`
- Convert sang JSON (bảng phẳng, không PIVOT)
- Tool xử lý pivot, xếp hạng, render chart tự động

## 📁 Cấu trúc Thư mục

| Nơi | Mục đích |
|---|---|
| **`assets/`** | Tất cả rules, skills, commands, agents. Viết Markdown, auto-emit ra platform |
| `assets/rules/` | Kiểm soát chất lượng (không lộ secret, tên biến, SQL injection, v.v.) |
| `assets/skills/` | Quy trình chi tiết (customize FBO, audit, PM workflow) |
| `assets/agents/` | Tác nhân tự động (phân tích tài liệu, code review) |
| `assets/commands/` | Slash command (`/pm-status`, `/fbo-find`, v.v.) |
| `data/` | Config tham chiếu (khách, chương trình, schema DB) |
| `mcp/servers.json` | Kết nối tới API, database nội bộ |
| `ledger/` | Kho dự án: task, changelog, handover |
| `docs/` | Hướng dẫn viết asset, kiến trúc |

## 🔄 Workflow: Sửa Một Skill

Ví dụ: Bạn muốn tạo skill mới để rà soát yêu cầu tốt hơn.

```bash
# 1. Tạo file mới (hoặc sửa có sẵn)
touch assets/skills/fbo-xml/my-new-skill.md

# 2. Viết theo format (YAML + Markdown)
---
name: my-skill-id
description: Mô tả 1 dòng cho gallery
type: skill
---

# Tiêu đề

Nội dung hướng dẫn...

# 3. Validate
node tools/4ai.mjs check

# 4. Preview & sync
node tools/4ai.mjs sync --dry-run
node tools/4ai.mjs sync

# 5. Commit & push — tất cả platform sẽ nhận được
git add .
git commit -m "Add skill: my-skill-id"
git push
```

**Khi nào skill xuất hiện?**
- **Claude Code:** Ngay lập tức (sau `/sync`), gọi bằng `/my-skill-id`
- **Cursor:** Reload cửa sổ, dùng bình thường
- **Antigravity:** Reload workspace, agent tự nạp theo `SKILL.md` khi liên quan

## 🔐 Bảo Mật

✅ **Cho phép:**
- Program path: `\\server\path\Program`
- DB alias: `QLDA`, `QLDA_APP` (alias, không connection string)
- Quy tắc kiểm soát: "không viết SQL tay"

❌ **Không bao giờ:**
- Connection string: `Server=..;User Id=..;Password=..`
- API key, token, credential
- Tên hoặc mật khẩu khách hàng

Xem chi tiết: [docs/ASSET-FORMAT.md](docs/ASSET-FORMAT.md)

## 📚 Tài liệu

| File | Nội dung |
|---|---|
| [ASSET-FORMAT.md](docs/ASSET-FORMAT.md) | Cách viết rule, skill, agent, command |
| [TARGET-MATRIX.md](docs/TARGET-MATRIX.md) | Asset nào emit ra file nào trên từng platform |

## 🤝 Cộng tác

- **Bug hoặc gợi ý:** Mở issue trên GitHub
- **Thay đổi lớn:** Draft PR, mô tả bối cảnh
- **Yêu cầu skill/rule mới:** Discuss issue trước khi code
