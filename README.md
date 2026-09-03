# 4AI — AI Assistant Hub for FBO/FBI

Một bộ quy tắc (rules), hướng dẫn (skills), và tác nhân tự động (agents) **tập trung cho FBO/FBI** — viết một lần, dùng trên tất cả platform: **Claude Code, Cursor, Antigravity** và VSCode/Copilot.

> **Mới bắt đầu?** Clone repo rồi chạy `sync` — xem [Cài đặt](#-cài-đặt).

## 🎯 Tính năng chính

| Tính năng | Mô tả | Dùng ở đâu |
|---|---|---|
| **Rules** | Quy tắc kiểm soát chất lượng: không lộ secret, tên biến, lỗi phổ biến | Tất cả platform |
| **Skills** | Quy trình cụ thể: customize FBO, rà soát yêu cầu, quản lý dự án | Claude, Cursor |
| **Agents** | Tác nhân tự động: phân tích tài liệu, audit code, kiểm tra compliance | Claude (chạy standalone) |
| **Commands** | Slash command: `/erp-screen-find`, `/pm-status`, `/4ai-sync` | Claude Code, Cursor |
| **Báo cáo** | Dashboard HTML ngoại tuyến: rà soát UR, KPI phòng ban | Export từ tool |
| **MCP Servers** | Kết nối tới database, API QLDA nội bộ | Claude, Cursor |

## 📦 Cài đặt

4AI là một **compiler**, không phải một gói cài sẵn: clone repo, chạy `sync`, nó ghi asset ra
đúng thư mục config của từng tool (`.claude/`, `.cursor/`, `.github/`, `.agents/`) trong workspace
bạn chỉ định ở `targets.json`.

```bash
git clone https://github.com/huunguyenit/4AI
```

```bash
node tools/4ai.mjs check
```

```bash
node tools/4ai.mjs sync --dry-run
```

Xem kế hoạch ghi rồi bỏ `--dry-run` để ghi thật. Chi tiết ở
[Quickstart](#quickstart--sửa-một-điều-gì-đó).

Yêu cầu: **Node.js 22+** (MCP dùng `node:sqlite` built-in). Không cần `npm install` — zero dependency.

Hub hiện có (số đếm ra từ `node tools/4ai.mjs check`, đừng chép tay số này):

- **3 doctrine + 15 rule** — nguyên tắc nền và quy tắc kiểm soát chất lượng
- **30 skill** — quy trình ERP/PM, model tự nạp khi task chạm phạm vi
- **10 agent** — `erp-explorer`, `erp-builder`, `erp-sql-expert`, `pm-analyst`…
- **12 command** — `/erp-screen-find`, `/erp-diff-review`, `/pm-status`, `/pm-review`…
- **MCP `4ai-fbo`** — tra cứu controller, phân giải DTD entity, đo phạm vi Include, `query_sql`
- **CLI `tools/4ai.mjs`** — để nhóm command PM dựng được báo cáo HTML

> **Bề mặt nào chạy được cái gì.** Claude Code có đủ bốn primitive (skill · agent · command ·
> MCP). Chat/Cowork **chỉ có skill và MCP**: `/pm-review` không xuất hiện, sub-agent không giao
> được, `node tools/4ai.mjs` không chạy được. Ở đó đường đúng để có báo cáo rà soát là tool
> `render_review_report` — cùng code dựng với `4ai report`. Đừng để model tự ghép báo cáo từ
> `get_review_dataset`: đó là dữ liệu thô, bản tự chế không qua validate payload và không nằm
> trong ledger.

Cập nhật về sau: `git pull` rồi `sync` lại.

## ⚙️ Cấu hình cục bộ (trước khi tra QLDA / chạy `report`)

MCP `4ai-fbo` cần biết chuỗi kết nối DB **nội bộ** và danh tính
PM trước khi `list_programs`, `get_review_dataset` hay `node tools/4ai.mjs report` chạy được.
`query_sql` trên chương trình **khách** thì không chờ bước này: truyền thẳng đường dẫn program là
chạy, kết nối đọc từ `Web.config` của chính program.
`data/qlda.json` chỉ chứa **tên key**, không bao giờ chứa giá trị thật (bị `4ai check` soi).

### Cách nhanh nhất — `setup` rồi `doctor`

Mở terminal ở gốc repo, chạy hai lệnh:

```bash
node tools/4ai.mjs setup
```

Hỏi lần lượt mã nhân viên PM, bộ phận, rồi ba chuỗi kết nối. **Ký tự gõ vào không hiện lên
màn hình**, và giá trị đi thẳng vào `data/qlda.local.json` trên máy bạn — không đi qua model
AI, không nằm lại trong transcript phiên chat. Bỏ trống một mục = giữ nguyên giá trị cũ.

```bash
node tools/4ai.mjs doctor
```

Báo còn thiếu gì: Node, `sqlcmd`, danh tính PM, chuỗi kết nối, và QLDA đang lấy kết nối từ
đâu. Chỉ in **tên khoá và trạng thái**, không bao giờ in giá trị — dán output này cho người
khác xem để nhờ hỗ trợ được, không lộ gì.

> Đừng nhờ AI ghi hộ chuỗi kết nối qua chat. Truyền qua chat là nó nằm lại trong transcript;
> `setup` tồn tại chính để tránh chuyện đó.

Phần dưới giải thích từng mục, cho ai muốn khai tay.

### 1. Yêu cầu hệ thống

- **Node.js 22+** — MCP dùng `node:sqlite` built-in, không `npm install`.
- **sqlcmd** — tự dò ở PATH rồi tới các thư mục cài quen thuộc (Client SDK\ODBC\<ver>\Tools\Binn,
  SQL Server Tools\Binn, go-sqlcmd). Cài chỗ khác thì đặt env `FBO_SQLCMD` trỏ thẳng vào
  `sqlcmd.exe` — không cần sửa code.

### 2. Danh tính PM — `setup` hoặc `set_pm_identity`

`node tools/4ai.mjs setup` hỏi luôn mục này. Muốn nhờ agent thì gọi tool MCP `set_pm_identity`
với mã nhân viên và mã bộ phận thật — mã NV và bộ phận **không phải bí mật** nên đi qua chat
không sao (khác hẳn chuỗi kết nối):

```
set_pm_identity(maNv: "PM01", boPhanLt: "FSD")
```

Tool tự ghi vào `data/qlda.local.json` (đã gitignore) ở đúng **state root** (dev: gốc hub;
bản mang đi: `%APPDATA%\4ai` — xem [Trạng thái nằm ở đâu](#trạng-thái-nằm-ở-đâu)). Các tool khác (`list_programs`,
`get_review_dataset`, `report`) đọc lại giá trị này ngay lần gọi tiếp theo, không cần khởi động
lại MCP server. Nhập nhầm dạng token mẫu (`{PMName}`) sẽ bị tool từ chối, không âm thầm nuốt.

### 3. Định danh hạ tầng nội bộ — **bắt buộc**, `setup` hỏi ngay

Repo này là **mã nguồn mở**, nên `data/qlda.json` **không**
chứa tên database hay đường dẫn share của công ty bạn — nó chỉ giữ token `{...}`. Giá trị thật
do từng máy khai vào `data/qlda.local.json` (đã gitignore):

| Khoá trong `qlda.local.json` | Token trong `qlda.json` | Dùng cho |
|---|---|---|
| `qldaProgramPath` | `{QldaProgramPath}` | Đường dẫn program QLDA — dấu hiệu phân biệt QLDA với chương trình khách |
| `qldaDatabaseName` | `{QldaDatabaseName}` | Tên DB nghiệp vụ QLDA (`nbdmda`, `nbphyc`…) |
| `qldaSysDatabaseName` | `{QldaSysDatabaseName}` | Tên DB hệ thống QLDA (`userinfo2`…) |
| `graph4aiDatabaseName` | `{Graph4aiDatabaseName}` | Tên DB đồ thị — bỏ trống nếu chuỗi kết nối đã khai `Initial Catalog` |
| `attachmentsFileStoreRoot` | `{AttachmentsFileStoreRoot}` | Share chứa tệp đính kèm — chỉ cần khi đọc tài liệu khảo sát |

Chưa khai thì `list_programs` và mọi tool tra QLDA **báo lỗi kèm chỉ dẫn**, chứ không âm thầm
đoán một cái tên rồi chạy nhầm database. Đây không phải credential (nên `doctor` hiện giá trị
ra màn hình), chỉ là thứ không nên nằm trong một repo công khai.

### 4. Chuỗi kết nối DB — env hoặc `qlda.local.json`

Ba key sau phân giải theo thứ tự **env trước, `data/qlda.local.json` sau — và hết**. Không có
bước dò `Web.config`: đây là hai DB **nội bộ**, chưa khai thì tool báo lỗi kèm chỉ dẫn chứ
không mượn `Web.config` của chương trình QLDA (hai nguồn không bảo đảm trỏ cùng một server —
mượn nhầm thì truy vấn vẫn chạy, vẫn ra số, chỉ là ra từ chỗ khác).

| Biến môi trường | Tương đương trong `qlda.local.json` | Dùng cho |
|---|---|---|
| `QLDA_APP_CONNECTION` | `appConnectionString` | DB nghiệp vụ QLDA |
| `QLDA_SYS_CONNECTION` | `sysConnectionString` | DB hệ thống QLDA |
| `GRAPH_4AI_CONNECTION` | `graphConnectionString` | DB đồ thị nội bộ của hub — kinh nghiệm, gợi ý phân công |

`appConnectionString`/`sysConnectionString` là **bắt buộc** nếu muốn dùng `list_programs` và
mọi tool tra dự án — chúng chạy trên DB nội bộ QLDA. `node tools/4ai.mjs setup` ghi hộ.

`graphConnectionString` thì **bắt buộc** nếu muốn dùng `node tools/4ai.mjs graph push`/
`graph experience` hoặc muốn gợi ý phân công chấm theo kinh nghiệm hiện vật (xem
[Kho kinh nghiệm & đồ thị](#-kho-kinh-nghiệm--đồ-thị) bên dưới) — đồ thị sống hẳn trong DB này,
không còn là chỉ mục tuỳ chọn dựng lại được từ file.

Thứ tự này **chỉ áp cho hai DB nội bộ** ở trên. Chương trình của **khách** đi đường ngược lại
và là đường mặc định của `query_sql`: truyền `program` (đường dẫn hoặc mã dự án `nbdmda.ma_da`)
thì kết nối đọc thẳng từ `Web.config` của chính program đó, **không phải khai trước gì cả**.
Mỗi khách một server/database riêng, không có cách nào khai sẵn bằng env, và không được phép
lấy nhầm kết nối QLDA.

| Tra database nào | Nguồn kết nối | Phải khai trước? |
|---|---|---|
| Chương trình khách (`query_sql`, mọi dự án) | `Web.config` của chính program | Không |
| QLDA (`list_programs`, `report`, UR) | env `QLDA_*_CONNECTION` → `qlda.local.json` | **Có** |
| Đồ thị 4AI (`graph push`, gợi ý phân công) | env `GRAPH_4AI_CONNECTION` → `graphConnectionString` | **Có** |

Khai bằng env/local thì **không phải truyền `database` ở mỗi lệnh** (thiếu `Initial Catalog` thì
lấy `databaseName`/`sysDatabaseName` trong `data/qlda.json`). Muốn kiểm kết nối đang lấy từ đâu
mà không phải in chuỗi bí mật ra màn hình thì dùng `nguonKetNoi(programPath, dbType)` trong
`mcp/fbo/lib/sql.mjs` — nó chỉ trả về tên nguồn (`env` / `qlda.local.json` / `Web.config` /
`chưa khai`), và `doctor` in sẵn cả ba dòng đó.

#### ⚠️ Khai rồi mà vẫn báo chưa khai — hai cái bẫy

**Bẫy 1 — sửa nhầm bản `qlda.local.json`.** Một máy thường có nhiều bản: trong hub, trong một
bản chép mang đi, trong thư mục dữ liệu của phiên. Chỉ **một** bản được đọc:
`%APPDATA%\4ai\data\qlda.local.json` khi `FBO_DATA_ROOT` được đặt, gốc hub khi chạy dev. Copy
file cấu hình của hub sang thư mục khác là công cốc — không ai đọc nó, và lỗi trông y hệt như
chưa sửa gì. Không chắc thì hỏi `doctor`, nó in ra đường dẫn thật đang được đọc.

**Bẫy 2 — đặt biến môi trường sau khi tiến trình đã chạy.** Tiến trình MCP giữ **bản chụp** môi
trường lúc khởi động. `setx` hay sửa trong System Properties xong mà chưa thoát hẳn ứng dụng
host (Claude Desktop/Cowork) thì tiến trình đang chạy vẫn dùng giá trị cũ. Sửa file
`qlda.local.json` thì ngược lại — có hiệu lực **ngay lần gọi tool tiếp theo**.

Không có shell để chạy `doctor` (chat, Cowork) thì gọi **tool MCP `doctor`**: nó trả về data
root đang dùng, **đường dẫn thật** của file cấu hình được đọc, danh sách **tên khoá** đã khai,
nguồn kết nối app/sys/đồ thị, sqlcmd — không bao giờ trả giá trị chuỗi kết nối. Một
lần gọi tool này thay cho việc thử lại nhiều lần rồi đoán.

### Trạng thái nằm ở đâu

Hai gốc, cố ý khác nhau:

| | Gốc | Chứa gì | Mất thì sao |
|---|---|---|---|
| **data root** | `FBO_DATA_ROOT` nếu được đặt, dev: hub | index SQLite | chạy lại `index_program` |
| **state root** | `FBO_STATE_ROOT`, mặc định `%APPDATA%\4ai` khi có `FBO_DATA_ROOT`; dev: hub | `data/qlda.local.json`, `ledger/` | phải khai lại cấu hình |

Tách ra vì thư mục dữ liệu mà host cấp cho `FBO_DATA_ROOT` **không bền**: trong Cowork nó nằm
trong thư mục của **từng phiên**, phiên đóng là mất theo. Trước khi tách, mỗi phiên Cowork mới
là một lần gán lại PM. Index thì dựng lại được nên cứ để nguyên chỗ cũ.

Bản cài cũ không mất gì: lần đầu đọc mà state root chưa có file, 4AI **copy** từ data root sang
(copy chứ không move — rollback về bản cũ vẫn chạy). Muốn chốt chỗ khác (máy nhiều bản cài,
hoặc chạy test) thì đặt `FBO_STATE_ROOT`.

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

### 5. Override target theo máy — `targets.local.json` (tuỳ chọn, chỉ Cách 2)

Chỉ cần khi đường dẫn trong `targets.json` không đúng trên máy bạn (ví dụ hub sync ra ổ đĩa
khác). Tạo `targets.local.json` ở gốc repo (đã gitignore), merge theo `name` vào `targets.json`
lúc `sync` chạy:

```json
{ "targets": [{ "name": "4ai", "path": "D:\\đường\\dẫn\\khác\\4AI" }] }
```

Không cần tạo nếu máy bạn dùng đúng path mặc định trong `targets.json`.

### 6. `.cursor/mcp.json` — không tạo tay

Sinh tự động bởi `sync` (đã gitignore) — đừng chỉnh tay, chỉnh xong `sync` sẽ ghi đè.

## 🚀 Dùng trên từng Platform

### Claude Code
Sau khi `sync`, assets tự động xuất hiện trong thư mục `.claude/`:
- **Rules** → `.claude/rules/` — tự động chạy trước mỗi response
- **Skills** → `.claude/skills/` — gọi bằng `/skill-name`
- **Commands** → `.claude/commands.json` — tích hợp vào command palette
- **Slash commands** → `/erp-screen-find`, `/pm-status`, `/4ai-sync` và 10+ command khác

Ví dụ: `/pm-status` hiển thị trạng thái tất cả task trong `ledger/`, phân theo dự án.

### Cursor
Clone repo rồi `sync` — xem [Cài đặt](#-cài-đặt):
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
# Mở assets/skills/erp/your-skill.md
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
- Claude Code: Chạy `/4ai-sync` để nhận config mới
- Cursor: Reload cửa sổ hoặc `Ctrl+Shift+P` → reload
- Antigravity: Reload workspace để nhận config mới

### Kiểm tra bao gồm gì

```bash
node tools/4ai.mjs list                   # Xem tất cả asset
node tools/4ai.mjs explain <asset-id>    # Asset này emit ra file nào
node tools/4ai.mjs check                  # Validate — exit 0 = OK
```

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

**Cách dùng — có shell:**
```bash
node tools/4ai.mjs report
```
Thêm `--project <MA_DA>` để chỉ dựng một dự án (bỏ trang tổng quan). Lệnh **tự lấy dataset**
từ bốn câu SQL cố định — không cần và không nhận payload viết tay.

**Cách dùng — không có shell** (chat/Cowork): gọi tool MCP `render_review_report()` (thêm
`project` nếu chỉ cần một dự án). Cùng code dựng, cùng output, và trả luôn `ycUR[]` — danh sách
UR trạng thái `YC` kèm nội dung — để phân tích ngay. UR `DD`/`XN`/`TH` cố ý chỉ trả số đếm và hạn
gần nhất: chúng đã qua cổng PM, có mặt trên HTML để theo dõi hạn chứ không phải để phân tích lại.

Kết quả (cả hai đường): `<ledgerRoot>/review/<yyyyMMdd>/<ma_da>/review.html` + `review.payload.json`
cạnh nó, và `_tong/tong.html` khi rà soát nhiều dự án. Mở bằng `node tools/4ai.mjs serve /review`
hoặc mở thẳng file trong browser (offline OK).

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

## 🔧 Prompt Tool

Tạo **prompt tự động** từ schema UR cho agent, giảm thời gian suy nghĩ:
```bash
# Xem `tools/lib/prompt.mjs`
promptCuaUr(urRecord) → prompt hoàn chỉnh cho agent tự viết DDL/SQL
```

**Lợi ích:**
- Prompt luôn phù hợp với cấu trúc UR hiện tại
- Agent không phải suy diễn schema
- Đảm bảo tính nhất quán

## 🕸️ Kho kinh nghiệm & đồ thị

`4ai report` tự gợi ý người tiếp nhận cho UR ở YC, dựa trên kinh nghiệm THẬT chứ không phải
đoán qua tên menu — `nbphyc.menu_id` đo được là không đáng tin (1/25 giá trị trên một dự án
thật sự tồn tại trong cây menu của chính chương trình đó). Thay vào đó hệ thống rút HIỆN VẬT
(chứng từ/báo cáo/controller cụ thể) từ nội dung UR, đối chiếu với `wcommand` của từng khách:

```bash
node tools/4ai.mjs graph push                  # nạp hạt giống (Menu/Controller/Table/SpVersion)
node tools/4ai.mjs graph experience --dept FSD  # quét UR đã xong (HT/DT/OK/UP) → kinh nghiệm hiện vật
node tools/4ai.mjs report --project <MA_DA>        # gợi ý phân công tự chấm theo kinh nghiệm vừa quét
```

Đồ thị sống trong DB nội bộ của hub (SQL Server graph), không phải file — hub dùng cho nhiều
người nên một user chạy báo cáo phải **đọc ngay** phần user khác đã quét, không dựng lại. Mỗi
node mang `scope` (mã dự án, hoặc `system` cho thiết kế FBO chuẩn); nạp lại là `MERGE` theo
phạm vi, không xoá dữ liệu của dự án khác.

Gợi ý phân công cũng tự đối chiếu với thực tế: mỗi lần chạy report, hệ thống ghi lại đã gợi ý
ai, rồi lần chạy SAU đọc `nbphyc.ma_lt1` để tự biết PM có giao đúng người hay không — không
đòi PM xác nhận gì (PM duyệt trên web QLDA, không mở repo). Xem mục "Gợi ý có trúng không"
trên trang tổng quan.

Cấu hình trọng số chấm điểm: `data/qlda.json` → `review.phanCong` ghi đè mặc định
(`tools/lib/assignee.mjs`). Thiết kế đầy đủ, số đo trên dữ liệu thật, và các quyết định đã đảo
ngược giữa chừng: [`docs/experience-engine/`](docs/experience-engine/) và
[`docs/adr/ADR-0001`](docs/adr/ADR-0001-experience-engine-scope.md).

### Hướng dẫn lập trình thực chiến — `playbook`

Kho kinh nghiệm ở trên do MÁY rút, và nó chỉ trả lời được *ai* đã đụng vào *hiện vật nào*.
Câu mà lập trình viên thật sự cần trước khi sửa — *màn hình này làm kiểu gì cho đúng, chỗ nào
dễ sập* — không suy ra được từ `nbphyc.noi_dung`, vì đó là lời khách yêu cầu chứ không phải
nhật ký sửa code. Nên có một kho thứ hai, do **người viết**:

```bash
# LT kể cách đã làm → PM ghi lại
node tools/4ai.mjs playbook add \
  --project HOATP --ur A000572010YC1 \
  --title "Thêm số thứ tự cho màn hình browse danh mục" \
  --how "B1: ... B2: ... B3: KHÔNG đụng Include chung" \
  --warn "Include dùng chung 40 controller" \
  --sysid DMNhanVien --from HOATV

# sửa về sau: CHỈ trường được truyền bị ghi đè, phần còn lại giữ nguyên
node tools/4ai.mjs playbook edit \
  --project HOATP --title "Thêm số thứ tự cho màn hình browse danh mục" \
  --sysid DMNhanVien          # thêm neo, không đụng gì khác
node tools/4ai.mjs playbook edit --project HOATP --title "..." --warn ""   # XOÁ trường

# trước khi bắt tay sửa một màn hình, hỏi kho xem có ai làm rồi chưa
node tools/4ai.mjs playbook search --sysid DMNhanVien
```

`add` và `edit` khác nhau ở chỗ **cờ vắng mặt nghĩa là gì**. `add` là ghi mới nên vắng mặt =
rỗng; `edit` đọc dòng cũ nên vắng mặt = **giữ nguyên**, và muốn xoá thì phải gõ `--warn ""` ra
tường minh. Cần tách vì `MERGE` ghi đè toàn bộ cột: gõ lại `add` chỉ để thêm `--from` mà quên
`--warn` sẽ xoá trắng cảnh báo, im lặng. Tiêu đề nằm trong khoá nên `edit` không đổi được nó —
đổi tiêu đề là một dòng khác, và trong chế độ ghi bổ sung thì dòng cũ sẽ nằm lại vĩnh viễn.
`nhapBoi`/`ngayNhap` luôn là người và lúc ghi **lần đầu**; ai vừa sửa nằm ở cột audit
`capNhatBoi`/`capNhatLuc`.

Kho này chỉ có đường CLI — `playbook_add`/`playbook_search` đã gỡ khỏi bề mặt MCP, nên ở
chat/Cowork (không có shell) hiện không ghi hay tra được.

Ba điều đáng nhớ về thiết kế của nó:

- **Tra bằng hiện vật, KHÔNG bằng mã dự án.** `ma_da` chỉ là *xuất xứ* — nơi cách làm đó đã
  chạy thật. Cả tính năng sinh ra để dự án MỚI dùng lại kinh nghiệm dự án CŨ; lọc theo dự án
  đang làm thì mãi mãi trả rỗng.
- **Bắt buộc có neo** (`--sysid` / `--menu` / `--table` / `--tags`). Không có neo thì không lần
  tra cứu nào chạm tới được, và công gõ vào bị vứt đi — nên CLI chặn thẳng thay vì ghi rồi thôi.
  Ưu tiên `--sysid`: `menu_id` là số hiệu BA gõ tay, khớp qua nó được đánh dấu là *khớp yếu*
  ngay trên báo cáo.
- **Ghi bổ sung, không xoá.** Khác `graph build`/`graph experience` (quét lại từ đầu nên lô là
  bản đầy đủ của scope), `playbook add` chỉ đẩy một dòng — dùng chế độ ghi mặc định sẽ xoá sạch
  hướng dẫn cũ của cùng dự án. Xem `boSung` trong `emitSql()`.

Hướng dẫn đã ghi tự hiện lại ở tab **Gợi ý kỹ thuật** của báo cáo rà soát, ghép theo hiện vật
của từng UR — kể cả khi nó đến từ khách khác.

### Gợi ý kỹ thuật → prompt dán thẳng vào Claude Code

Đầu tab **Gợi ý kỹ thuật** là một prompt cho mỗi UR, gộp sẵn bối cảnh + kinh nghiệm đã có +
luồng dữ liệu + việc cần làm. Các mục bên dưới là cùng nội dung đó, bày ra để đọc bằng mắt —
người sắp code chỉ cần bấm Copy một lần thay vì tự ghép lại từ ba chỗ.

**Script SQL cố ý KHÔNG nằm trong prompt.** Nó là đầu ra xác định của `tools/lib/ddl.mjs` — cùng
đặc tả `ddl` thì sinh lại ra đúng từng byte, và đó chính là thứ hỏng ngay khi cho model đọc:
model sẽ "cải thiện" tên cột, đổi kiểu, thêm index, mỗi lần một khác, rồi không ai đối chiếu lại
được với đặc tả nữa. Prompt chỉ mang phần cần suy nghĩ; script thì chạy nguyên văn. Muốn đổi thì
sửa đặc tả rồi sinh lại, đừng sửa script.

## 📁 Cấu trúc Thư mục

| Nơi | Mục đích |
|---|---|
| **`assets/`** | Tất cả rules, skills, commands, agents. Viết Markdown, auto-emit ra platform |
| `assets/rules/` | Kiểm soát chất lượng (không lộ secret, tên biến, SQL injection, v.v.) |
| `assets/skills/` | Quy trình chi tiết (customize FBO, audit, PM workflow) |
| `assets/agents/` | Tác nhân tự động (phân tích tài liệu, code review) |
| `assets/commands/` | Slash command (`/pm-status`, `/erp-screen-find`, v.v.) |
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
touch assets/skills/erp/my-new-skill.md

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
- **Claude Code:** Ngay lập tức (sau `/4ai-sync`), gọi bằng `/my-skill-id`
- **Cursor:** Reload cửa sổ, dùng bình thường
- **Antigravity:** Reload workspace, agent tự nạp theo `SKILL.md` khi liên quan

### Skill có `references/` — danh mục tra cứu lớn

Skill nào mang theo dữ liệu tra cứu quá lớn để nhét vào thân (danh mục hàm, bảng đối chiếu,
đặc tả dài) thì đặt phần đó thành file reference riêng:

```
assets/skills/<domain>/<id>.md                    ← SKILL, phải có frontmatter
assets/skills/<domain>/<id>/references/<tên>.md   ← markdown TRẦN, không frontmatter
```

Thân SKILL trỏ tới chúng bằng token **`{REFDIR}`** — mỗi dialect thay bằng đường dẫn của
chính nó, nên viết một lần là đúng ở mọi nơi:

| Dialect | File chính | Reference |
|---|---|---|
| Claude Code / Cursor / Antigravity | `skills/<id>/SKILL.md` | `skills/<id>/references/<tên>.md` |
| Copilot | `.github/instructions/<id>.instructions.md` | `.github/instructions/references/<id>/<tên>.md` |

Cursor gọi `references/` đúng cái tên đó và nạp theo yêu cầu, nên layout trùng Claude Code.
Chỉ Copilot còn dạng phẳng vì nó không có primitive skill.

Nhờ tách file, SKILL.md giữ nguyên vai trò mục lục nhẹ — agent chỉ mở reference khi task thật
sự chạm tới. Ví dụ đang có: `erp-sql-reference` (221 function, 747 procedure, 93 bảng `sys*`).

Ràng buộc do `check` cưỡng chế: reference phải có skill chủ cùng `id`, cùng `domain`, và skill
đó **không được** `always: true` (reference sinh ra để nạp theo yêu cầu, không phải luôn nạp).

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
| [docs/experience-engine/](docs/experience-engine/) | Đồ thị kinh nghiệm: assessment, domain model, thuật toán, thiết kế đồ thị trong DB |
| [docs/adr/](docs/adr/) | Quyết định kiến trúc đã chốt về chính hub (ADR — khác `ledger/adr/` gitignore dành cho ADR riêng từng khách) |

## 🤝 Cộng tác

- **Bug hoặc gợi ý:** Mở issue trên GitHub
- **Thay đổi lớn:** Draft PR, mô tả bối cảnh
- **Yêu cầu skill/rule mới:** Discuss issue trước khi code
