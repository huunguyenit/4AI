# Ma trận projection

Một asset trong `assets/` chiếu ra sáu phương ngữ config. File này là **bản chữ** của
`tools/lib/paths.mjs` — chính file đó là nguồn chuẩn máy đọc được, và `explain` cùng mọi
emitter đều gọi nó nên chúng không bao giờ lệch nhau.

Muốn biết một asset cụ thể ra file nào, đừng tra bảng — hỏi thẳng:

```bash
node tools/4ai.mjs explain erp-sql-style
```

## Kind → đường dẫn (project scope)

| Kind | Claude Code | Cursor | VSCode / Copilot | Antigravity ⚠ | Plugin (Claude) | Plugin (Cursor) |
|---|---|---|---|---|---|---|
| doctrine | *inline* `.claude/4ai-context.md` | `.cursor/rules/00-<id>.mdc` | *inline* `.github/copilot-instructions.md` | `.agents/rules/<id>.md` | `skills/<id>/SKILL.md` | `rules/00-<id>.mdc` |
| rule `always: true` | *inline* `.claude/4ai-context.md` | `.cursor/rules/<id>.mdc` | *inline* `.github/copilot-instructions.md` | `.agents/rules/<id>.md` | `skills/<id>/SKILL.md` | `rules/<id>.mdc` |
| rule có `globs` | `.claude/skills/<id>/SKILL.md` | `.cursor/rules/<id>.mdc` | `.github/instructions/<id>.instructions.md` | `.agents/rules/<id>.md` | `skills/<id>/SKILL.md` | `rules/<id>.mdc` |
| skill | `.claude/skills/<id>/SKILL.md` | `.cursor/skills/<id>/SKILL.md` | `.github/instructions/<id>.instructions.md` | `.agents/skills/<id>/SKILL.md` | `skills/<id>/SKILL.md` | `skills/<id>/SKILL.md` |
| agent | `.claude/agents/<id>.md` | `.cursor/agents/<id>.md` | `.github/chatmodes/<id>.chatmode.md` | `.agents/agents/<id>.md` | `agents/<id>.md` | `agents/<id>.md` |
| command | `.claude/commands/<id>.md` | `.cursor/commands/<id>.md` | `.github/prompts/<id>.prompt.md` | `.agents/workflows/<id>.md` | `commands/<id>.md` | `commands/<id>.md` |

*inline* = nhiều asset gộp vào **một** file dùng chung, không phải file riêng.

⚠ **Cột Antigravity chưa được xác nhận.** Mapping dựng từ tài liệu công khai
(antigravity.google/docs) trong lúc IDE còn public preview, **chưa verify trên workspace
thật**. Điểm rủi ro nhất: tên field kích hoạt rule (`trigger`) và các giá trị
`always_on` / `glob` / `model_decision` suy theo định dạng rule của Windsurf — cùng đội tiền
thân, cùng convention, nhưng Antigravity có thể đặt tên khác. Verify rồi xoá cảnh báo này ở
cả đây và đầu `tools/lib/emit/antigravity.mjs`.

### Ba chỗ projection không phải ánh xạ 1-1

**Rule có `globs` ở Claude Code thành skill.** Claude Code không có primitive "rule kích
hoạt theo đường dẫn". Giữ nó là rule thì không có gì đọc; hạ thành skill thì model nạp theo
`description`. Mất phần kích hoạt tự động theo path — đó là giá phải trả, không phải lỗi.

**Plugin Claude không có "context luôn nạp".** Không có primitive nào tương đương
`.claude/4ai-context.md`, nên doctrine và rule `always: true` đều hạ thành skill, đúng như
scope user-global vẫn làm. Plugin Cursor thì **có** `rules/` auto-discover thật, nên bên đó
doctrine và rule ra file `.mdc` thật — hai bản plugin khác nhau ở đúng chỗ này.

**Doctrine ở Cursor mang tiền tố `00-`.** Cursor nạp rule theo thứ tự tên file; `00-` đẩy
doctrine lên trước mọi rule khác.

## MCP config

| Tool | File | Key | Ghi chú |
|---|---|---|---|
| Claude Code | `.mcp.json` | `mcpServers` | merge, không ghi đè phần của người khác |
| Claude Code | `.claude/settings.json` | `enabledMcpjsonServers`, `permissions.allow` | merge |
| Cursor | `.cursor/mcp.json` | `mcpServers` | merge |
| VSCode | `.vscode/mcp.json` | **`servers`** | tên key KHÁC mọi tool còn lại, cộng `type: stdio` |
| Antigravity ⚠ | `.agents/mcp_config.json` | `mcpServers` | cùng shape Cursor, không cần `type` |
| Plugin (Claude) | `.mcp.json` | `mcpServers` | dùng `${CLAUDE_PLUGIN_ROOT}` và `${CLAUDE_PLUGIN_DATA}` |
| Plugin (Cursor) | `mcp.json` | `mcpServers` | **không có dấu chấm đầu** — auto-discovery của Cursor quét đúng tên này |

Plugin Cursor **không** set `FBO_DATA_ROOT`: `${PLUGIN_ROOT}` đã xác nhận qua tài liệu
Cursor, nhưng biến kiểu `${CLAUDE_PLUGIN_DATA}` (thư mục ghi được, sống sót qua update) thì
chưa có xác nhận tương đương. Nên index SQLite ghi ngay trong thư mục cài, giống hành vi
chạy dev từ hub. Nếu Cursor xác nhận có biến tương đương, thêm vào đây và ghi lại nguồn.

## Project scope vs user scope

Target khai `scope: "user"` khi `path` trỏ thẳng vào `~/.claude` hoặc `~/.cursor`. Khi đó
**bỏ tiền tố** `.claude/` / `.cursor/` khỏi mọi đường dẫn ở bảng trên — vì thư mục đích
chính nó đã là cái đó rồi:

    project scope:  .cursor/skills/<id>/SKILL.md
    user scope:     skills/<id>/SKILL.md          (dest = C:\Users\<u>\.cursor)

Hai khác biệt nữa ở scope user:

- **Claude Code**: không ghi `.mcp.json` (scope user không dùng nó) — sync **in ra lệnh**
  `claude mcp add` để người dùng tự chạy. Cũng không có `4ai-context.md` đầy đủ; thay bằng
  một đoạn ngắn trong `CLAUDE.md` global trỏ tới skill (`@4ai-global.md`).
- **Cursor**: `alwaysApply` luôn `false`. Rule global luôn nạp sẽ đè lên mọi project khác
  trên máy, kể cả project không liên quan gì tới FBO.

## references/

Hai hình dạng, do primitive của dialect quyết định — không phải lựa chọn thẩm mỹ:

| Dialect có | Reference nằm ở |
|---|---|
| skill là **thư mục** (`skills/<id>/SKILL.md`) | `skills/<id>/references/` |
| asset là **một file** (`rules/<id>.mdc`, `<id>.instructions.md`) | `references/<id>/` cạnh nó |

Trường hợp thứ hai phải chèn `<id>` vào đường dẫn: không có thư mục riêng để chui vào, nên
hai skill cùng thư mục sẽ ghi đè reference của nhau nếu không đặt tên theo id.

Thân asset **không được hardcode** đường dẫn này — dùng token `{REFDIR}`, emitter thay theo
layout đúng của từng dialect. Xem `docs/ASSET-FORMAT.md`.

## targets.json

| Field | Ý nghĩa |
|---|---|
| `domains` (gốc file) | danh sách domain hợp lệ toàn hub. `check` fail nếu asset khai domain ngoài danh sách |
| `name` | định danh target, dùng cho `sync --target <name>` |
| `path` | thư mục đích |
| `tools` | phương ngữ nào được emit vào target này |
| `domains` | lọc theo domain — target chỉ nhận asset thuộc các domain này |
| `enabled` | `false` thì sync bỏ qua |
| `role` | **có `role` là sync KHÔNG BAO GIỜ ghi.** `customer-program` = phần mềm đang chạy của khách; `fbo-corpus` = chỉ đăng ký để tra cứu |
| `scope` | `"user"` → xem mục scope ở trên |
| `pluginName`, `pluginVersion` | metadata cho hai target plugin |
| `notes` | ghi chú cho người đọc, code không dùng |

`targets.local.json` (gitignore) gộp lên trên: **override target trùng `name`, VÀ thêm
target mới**. Dùng nó cho đường dẫn khác nhau theo từng máy — `~/.cursor` là ví dụ chuẩn.
Đường dẫn máy-cụ-thể không bao giờ vào `targets.json`.

Xem target nào đang bật và có với tới được không:

```bash
node tools/4ai.mjs targets
```

`scope: "user"` là **công tắc duy nhất** cho hành vi scope user. Từng có một field
`globalPolicy: "on-demand-only"` nằm cạnh nó trong config, nhưng không dòng code nào đọc —
đã xoá. Đừng khai lại: field không ai đọc là bằng chứng giả về một cơ chế không tồn tại.

## Sync ghi thế nào

`writer.mjs` là **nơi duy nhất** chạm filesystem output. Emitter chỉ trả về mô tả file. Vi
phạm điều đó là `--dry-run` mất tác dụng mà không ai phát hiện được.

Bốn kết cục cho mỗi file, đếm ra ở cuối mỗi target:

| | |
|---|---|
| **created** / **updated** | file sinh từ asset |
| **merged** | file 4AI chỉ sở hữu một phần (`.mcp.json`, `settings.json`) — gộp vào, giữ phần của người khác |
| **pruned** | file 4AI từng sinh nhưng asset nguồn không còn — xoá. Đây là cách một đợt đổi tên asset dọn được file tên cũ |
| **refused** | file bị sửa tay sau lần sync trước. Sync **không ghi đè**. Đưa sửa đổi về nguồn, hoặc `--force` để mất chúng |

`sync --dry-run` chạy hai lần liên tiếp phải cho cùng kết quả. Đó là bài kiểm tra
idempotency, và không có test runner nào khác.
