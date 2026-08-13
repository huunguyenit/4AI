# 4AI — AI Assistant Hub for FBO/FBI

Một bộ quy tắc (rules), hướng dẫn (skills), và tác nhân tự động (agents) **tập trung cho FBO/FBI** — viết một lần, dùng trên tất cả platform: **Claude Code, Cursor, Antigravity** và VSCode/Copilot.

> **Chỉ muốn dùng, không muốn sửa?** Cài bằng một lệnh — xem [Cài đặt](#-cài-đặt--hai-cách).

## 🎯 Tính năng chính

| Tính năng | Mô tả | Dùng ở đâu |
|---|---|---|
| **Rules** | Quy tắc kiểm soát chất lượng: không lộ secret, tên biến, lỗi phổ biến | Tất cả platform |
| **Skills** | Quy trình cụ thể: customize FBO, rà soát yêu cầu, quản lý dự án | Claude, Cursor |
| **Agents** | Tác nhân tự động: phân tích tài liệu, audit code, kiểm tra compliance | Claude (chạy standalone) |
| **Commands** | Slash command: `/fbo-find`, `/pm-status`, `/sync` | Claude Code, Cursor |
| **Báo cáo** | Dashboard HTML ngoại tuyến: rà soát UR, KPI phòng ban | Export từ tool |
| **MCP Servers** | Kết nối tới database, API QLDA nội bộ | Claude, Cursor |

## 📦 Cài đặt — hai cách

Chọn theo việc bạn định làm gì với 4AI.

| | **Cài plugin** | **Clone repo** |
|---|---|---|
| Dành cho | Người **dùng** skill/agent/command | Người **sửa** asset trong hub |
| Cần | Claude Code | Claude Code, Cursor, VSCode hoặc Antigravity |
| Cập nhật | `/plugin marketplace update` | `git pull` + `sync` |
| Gồm | Asset + MCP + CLI, tự chứa | Toàn bộ hub, sửa và emit lại được |

### Cách 1 — Cài plugin (khuyến nghị nếu chỉ để dùng)

Chỉ dùng được trên Claude Code. Cài một lệnh, không phải clone gì:

```bash
/plugin marketplace add huunguyenit/4AI
```

```bash
/plugin install 4ai@fast-source-4ai
```

Xong. Gói đã bao gồm sẵn:
- **26 skill** — doctrine, rule và quy trình FBO/PM, model tự nạp khi task chạm phạm vi
- **9 agent** — `fbo-explorer`, `fbo-customizer`, `pm-ur-analyst`, `pm-deadline-review`…
- **7 command** — `/fbo-find`, `/fbo-review`, `/pm-status`, `/pm-review`…
- **MCP `4ai-fbo`** — tra cứu controller, phân giải DTD entity, đo phạm vi Include, `query_sql`
- **CLI `tools/4ai.mjs`** — để nhóm command PM dựng được báo cáo HTML

Yêu cầu: **Node.js 22+** (MCP dùng `node:sqlite` built-in). Không cần `npm install` — zero dependency.

Cập nhật về sau:

```bash
/plugin marketplace update
```

**Index SQLite sống sót qua update.** Nó nằm ở `${CLAUDE_PLUGIN_DATA}` chứ không nằm trong thư
mục cache của plugin, nên không phải chạy lại `index_program` mỗi lần nâng cấp.

**Lệnh bảo trì hub không có trong plugin** — `/sync`, `/doctor`, `/new-skill`, `/new-rule`,
`/new-agent` chỉ có ý nghĩa khi bạn đang đứng trong repo, nên chúng cố tình bị loại khỏi bản
phân phối. Cần chúng thì dùng cách 2.

### Cách 2 — Clone repo (khi cần sửa asset)

Xem [Quickstart](#quickstart--sửa-một-điều-gì-đó) bên dưới.

## ⚙️ Cấu hình cục bộ (trước khi dùng `query_sql` / `report`)

Áp dụng cho **cả hai cách cài** — MCP `4ai-fbo` cần biết chuỗi kết nối DB và danh tính PM
trước khi `query_sql`, `get_review_dataset` hay `node tools/4ai.mjs report` chạy được.
`data/qlda.json` chỉ chứa **tên key**, không bao giờ chứa giá trị thật (bị `4ai check` soi).

### 1. Yêu cầu hệ thống

- **Node.js 22+** — MCP dùng `node:sqlite` built-in, không `npm install`.
- **sqlcmd** — tự dò ở PATH rồi tới các thư mục cài quen thuộc (Client SDK\ODBC\<ver>\Tools\Binn,
  SQL Server Tools\Binn, go-sqlcmd). Cài chỗ khác thì đặt env `FBO_SQLCMD` trỏ thẳng vào
  `sqlcmd.exe` — không cần sửa code.

### 2. Danh tính PM — `set_pm_identity`

Gọi tool MCP `set_pm_identity` (agent gọi giúp, hoặc tự yêu cầu agent gọi) với mã nhân viên và
mã bộ phận thật:

```
set_pm_identity(maNv: "PM01", boPhanLt: "FSD")
```

Tool tự ghi vào `data/qlda.local.json` (đã gitignore) ở đúng data root của lần cài (dev: gốc
hub; plugin: `${CLAUDE_PLUGIN_DATA}` — sống sót qua update). Các tool khác (`list_programs`,
`get_review_dataset`, `report`) đọc lại giá trị này ngay lần gọi tiếp theo, không cần khởi động
lại MCP server. Nhập nhầm dạng token mẫu (`{PMName}`) sẽ bị tool từ chối, không âm thầm nuốt.

### 3. Chuỗi kết nối DB — env hoặc `qlda.local.json`

Ba key sau đều phân giải theo thứ tự **env trước, `data/qlda.local.json` sau, cuối cùng mới dò
`Web.config` của chương trình QLDA**:

| Biến môi trường | Tương đương trong `qlda.local.json` | Dùng cho |
|---|---|---|
| `QLDA_APP_CONNECTION` | `appConnectionString` | DB nghiệp vụ QLDA |
| `QLDA_SYS_CONNECTION` | `sysConnectionString` | DB hệ thống QLDA |
| `GRAPH_4AI_CONNECTION` | `graphConnectionString` | Chỉ mục đồ thị năng lực |

Đa số máy **không cần khai gì cả** — `Web.config` của QLDA tự phân giải được. Chỉ cần override
khi máy không truy cập được share chứa QLDA, hoặc muốn trỏ DB khác lúc test.

Ví dụ `data/qlda.local.json` đầy đủ (không commit — đã trong `.gitignore`):

```json
{
  "pm": { "maNv": "PM01", "boPhanLt": "FSD" },
  "appConnectionString": "...",
  "sysConnectionString": "...",
  "graphConnectionString": "..."
}
```

**Không bao giờ** dán chuỗi kết nối vào `data/qlda.json` (file commit) — `4ai check` chạy
`scanSecrets` và sẽ fail build.

### 4. Override target theo máy — `targets.local.json` (tuỳ chọn, chỉ Cách 2)

Chỉ cần khi đường dẫn trong `targets.json` không đúng trên máy bạn (ví dụ hub sync ra ổ đĩa
khác). Tạo `targets.local.json` ở gốc repo (đã gitignore), merge theo `name` vào `targets.json`
lúc `sync` chạy:

```json
{ "targets": [{ "name": "4ai", "path": "D:\\đường\\dẫn\\khác\\4AI" }] }
```

Không cần tạo nếu máy bạn dùng đúng path mặc định trong `targets.json`.

### 5. `.cursor/mcp.json` — không tạo tay

Sinh tự động bởi `sync` (đã gitignore) — đừng chỉnh tay, chỉnh xong `sync` sẽ ghi đè.

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

### Dựng lại plugin sau khi sửa asset

Plugin là **phương ngữ thứ năm** của compiler, không phải thư mục dựng tay — `plugins/4ai/`
sinh ra từ chính corpus `assets/`, giống hệt `.claude/` hay `.cursor/`:

```bash
node tools/4ai.mjs sync --dry-run --target plugin
```

```bash
node tools/4ai.mjs sync --target plugin
```

Output **được commit** — nó là artifact người khác cài, diff phải nhìn thấy được. Sửa asset mà
quên dựng lại plugin thì người cài plugin vẫn nhận bản cũ.

Ba điều emitter plugin làm khác các emitter kia:

- **Doctrine và rule `always: true` hạ thành skill.** Plugin không có primitive "context luôn
  nạp" như `.claude/4ai-context.md`, nên chúng thành skill để model tự nạp theo `description` —
  đúng cách scope user-global vẫn làm.
- **Gói kèm runtime.** `mcp/fbo/`, `src/`, `tools/`, `data/` được chép nguyên văn vào gói. Plugin
  cấm đường dẫn `../` ra ngoài gốc, nên mọi thứ asset nhắc tới phải nằm trong gói. Layout giữ
  nguyên so với hub để import tương đối giữa `mcp/fbo/` và `src/` còn đúng.
- **`*.local.json` không bao giờ đi kèm.** Đó là cấu hình per-máy (`data/qlda.local.json` chứa
  mã PM và connection string), gitignore và loại khỏi bản phân phối.

Bump version plugin ở `targets.json` → `pluginVersion`, không sửa tay `plugin.json`.

## 📊 Báo cáo & Template

### Report Templates — HTML Tự Chứa

Báo cáo được dựng từ **template HTML tĩnh** — không CDN, không JavaScript phức tạp, xem offline:

```
tools/templates/report/
├── page.html        # Template trang báo cáo (placeholder: {{title}}, {{body}}, {{metaLine}})
├── dashboard.html   # Dashboard với biểu đồ
└── report.css       # Stylesheet (bảng màu semantic, font hệ thống)
```

**Tùy chỉnh template:**
1. Sửa HTML hoặc CSS
2. Chạy `check` để validate
3. Chạy `sync` để áp dụng trên tất cả platform

### Report Workflow — MCP Tool

Tạo báo cáo từ yêu cầu tự nhiên (tiếng Việt) → SQL → kết quả:

**Bước 1: Plan Report** — phân giải yêu cầu, tạo metadata
```bash
node tools/4ai.mjs plan-report "Báo cáo rà soát dự án tháng 8"
```
Output:
- `queryPlan` — bảng và cột cần truy vấn
- `metadata` — enum, rule kinh doanh
- `prompt` — hướng dẫn cho agent tự viết SQL
- `planId` — dùng trong bước tiếp

**Bước 2: Agent Tự Viết SQL** — sử dụng prompt từ bước 1
Agent (Claude, Cursor) sử dụng `prompt` để tự viết câu SELECT phù hợp

**Bước 3: Execute Report** — validate & chạy SQL
```bash
node tools/4ai.mjs execute-report <planId> "SELECT ..."
```
Output: dữ liệu được validate lại metadata chốt ở bước Plan

**Bảo mật:** SQL luôn qua lớp validation dựa trên metadata đã chốt — không chạy trực tiếp từ input người dùng.

### Dashboard HTML Ngoại Tuyến

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

## 🔧 Tính Năng Mới — Prompt Tool & Assignee

### Prompt Tool
Tạo **prompt tự động** từ schema UR cho agent, giảm thời gian suy nghĩ:
```bash
# Xem `tools/lib/prompt.mjs`
promptCuaUr(urRecord) → prompt hoàn chỉnh cho agent tự viết DDL/SQL
```

**Lợi ích:**
- Prompt luôn phù hợp với cấu trúc UR hiện tại
- Agent không phải suy diễn schema
- Đảm bảo tính nhất quán

### Assignee Tweaks
Gợi ý phân công UR dựa trên **trọng số, lịch sử, năng lực**:
```bash
# Xem `tools/lib/assignee.mjs`
goiYPhanCong(urList, staff) → danh sách gợi ý phân công cân bằng
```

**Chỉ số xem xét:**
- Khối lượng hiện tại (không quá tải)
- Chuyên môn (lịch sử commit)
- Thời gian rảnh (progress UR)
- Mức độ ưu tiên (hạn, dependency)

Cấu hình trọng số: `data/qlda.json` → `review.phanCong` ghi đè mặc định

## 📁 Cấu trúc Thư mục

| Nơi | Mục đích |
|---|---|
| **`assets/`** | Tất cả rules, skills, commands, agents. Viết Markdown, auto-emit ra platform |
| **`plugins/4ai/`** | Bản plugin sinh tự động — **không sửa tay**, chạy `sync --target plugin` |
| `.claude-plugin/marketplace.json` | Catalog marketplace để `/plugin marketplace add` |
| `assets/rules/` | Kiểm soát chất lượng (không lộ secret, tên biến, SQL injection, v.v.) |
| `assets/skills/` | Quy trình chi tiết (customize FBO, audit, PM workflow) |
| `assets/agents/` | Tác nhân tự động (phân tích tài liệu, code review) |
| `assets/commands/` | Slash command (`/pm-status`, `/fbo-find`, v.v.) |
| `data/` | Config tham chiếu (khách, chương trình, schema DB) |
| `mcp/servers.json` | Kết nối tới API, database nội bộ |
| `tools/lib/` | Library: report, prompt, assignee, staffing, template |
| `tools/templates/report/` | HTML template, CSS cho báo cáo |
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
- DB alias: `QLDA`, `NB_A` (alias, không connection string)
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
