# Định dạng asset

`CLAUDE.md` khai file này là **thẩm quyền cao nhất** khi các nguồn mâu thuẫn:

    docs/ASSET-FORMAT.md > tools/lib/schema.mjs > emitter

Nghĩa là nếu `schema.mjs` làm khác file này, `schema.mjs` sai. Nhưng đừng dùng điều đó để
chữa cháy: `schema.mjs` là bản máy đọc được của cùng hợp đồng này, và `check` chỉ cưỡng chế
được cái nằm trong code. Sửa một bên mà không sửa bên kia là để hai nguồn nói khác nhau.

Riêng phần **tên** thuộc `docs/NAMING.md` — file này không lặp lại.

## Vị trí file

    assets/<kind>s/<domain>/<id>.md          rule, skill, agent, command
    assets/doctrine/<id>.md                  doctrine — đặt phẳng, KHÔNG có thư mục domain
    assets/skills/<domain>/<id>/references/<name>.md    phụ lục của một skill

Ba thứ `check` cưỡng chế về vị trí:

- Thư mục cấp 1 quyết định `kind`. `assets/rules/` chỉ chứa `kind: rule`.
- Thư mục cấp 2 phải bằng `domain` trong frontmatter. Lệch thì **frontmatter mới là chuẩn** —
  chuyển file, đừng sửa frontmatter.
- Tên file (không đuôi) phải bằng `id`.

`id` là **khoá duy nhất toàn hub**, không phải duy nhất trong một kind: một skill và một
command không thể cùng `id`.

## Frontmatter — subset YAML

`fm.mjs` là parser tự viết, không dependency. Nó hỗ trợ đúng những dạng sau:

    key: scalar              scalar = bare | "double" | 'single' | true | false | số nguyên
    key: [a, b, c]           flow sequence của scalar
    key:                     block sequence
      - item
    # comment                comment đứng riêng một dòng

Mọi thứ khác là **lỗi parse kèm số dòng**, không phải đoán: nested map, anchor/alias, block
scalar `|` và `>`, multi-document, `null`/`~`, số thực, giá trị rỗng.

Ba cái bẫy thật:

- `description` chứa `: ` (hai chấm + khoảng trắng) **phải bọc nháy kép**, không thì parser
  đọc thành nested map.
- Giá trị là chuỗi mà bắt đầu bằng `[` cũng phải bọc nháy, không thì bị đọc thành sequence.
- Muốn bỏ một field thì **xoá hẳn dòng đó**. Không có `null`, không có giá trị rỗng.

## Field

Cột *Kind* trống nghĩa là dùng được với mọi kind.

| Field | Kiểu | Bắt buộc | Kind | Giá trị |
|---|---|---|---|---|
| `id` | string | ✅ | | kebab-case `^[a-z0-9]+(-[a-z0-9]+)*$`, bằng tên file |
| `title` | string | ✅ | | một dòng, tiếng Anh |
| `kind` | enum | ✅ | | `doctrine` `rule` `skill` `agent` `command` |
| `domain` | string | ✅ | | kebab-case, bằng thư mục cấp 2 và bằng scope trong `id` |
| `description` | string | ✅ | | **≤200 ký tự**, một dòng |
| `version` | int | ✅ | | ≥1, tăng khi sửa có ý nghĩa |
| `status` | enum | | | `draft` `active` `deprecated` — mặc định `active` |
| `owner` | enum | | | `core` `backend` `frontend` `pm` |
| `targets` | enumArray | | | `claude` `cursor` `vscode` `antigravity` — mặc định tất cả |
| `always` | bool | | | mặc định `true` với doctrine, `false` với phần còn lại |
| `globs` | stringArray | | | phạm vi kích hoạt theo đường dẫn |
| `requires` | stringArray | | | id **MCP server** trong `mcp/servers.json`, KHÔNG phải id asset — `check` báo lỗi nếu server không được khai |
| `see-also` | stringArray | | | id **asset** — `check` báo lỗi nếu trỏ tới id không tồn tại |
| `severity` | enum | ✅ với rule | rule | `hard` `soft` |
| `tools` | stringArray | | agent | danh sách tool tối thiểu; agent read-only thì KHÔNG có `Edit`/`Write` |
| `model` | enum | | agent | `haiku` `sonnet` `opus` `inherit` — mặc định `inherit` |
| `argument-hint` | string | | command | gợi ý tham số hiện cạnh `/<id>` |
| `mode` | enum | | command | `agent` `ask` — mặc định `agent` |
| `disable-model-invocation` | bool | | skill | skill chỉ chạy khi gọi đích danh, model không tự nạp theo `description` |

Field không có trong bảng này là **lỗi**, kèm gợi ý field gần giống nếu có.

`disable-model-invocation` dành cho quy trình dài mà tự kích hoạt sẽ gây nhiễu — báo cáo,
pivot, luồng lấy dữ liệu. Đừng bật nó cho skill tri thức: chặn tự nạp một từ điển nghĩa là
không ai tra nó nữa.

## Ràng buộc liên field

- `always: true` và `globs` **loại trừ lẫn nhau** — một rule hoặc luôn áp dụng, hoặc có phạm vi.
- doctrine không nhận `globs`, và không thể `always: false`.
- Skill có thư mục `references/` không được `always: true` — reference sinh ra để nạp theo
  yêu cầu; luôn nạp thì mất hết ý nghĩa.

## Body

- Phải có **ít nhất một heading `## `**. Body rỗng là lỗi.
- Khung quy ước: `## Vì sao` · `## Quy tắc` · `## Ví dụ` · `## Bẫy`.
- Rule `severity: hard` viết **BẮT BUỘC** / **KHÔNG ĐƯỢC** — không viết "nên", "cân nhắc".
- Ví dụ dùng **path thật, mã controller thật, query thật**. Không lorem ipsum, không
  `foo`/`bar`.

Hai token được thay lúc emit:

| Token | Thay bằng |
|---|---|
| `{REFDIR}` | đường dẫn tương đối tới thư mục `references/` của chính skill đó, theo layout của từng dialect |
| `{PMName}` `{PMDept}` | danh tính PM của máy đang chạy sync, đọc từ `data/qlda.local.json` |

Nhờ `{REFDIR}` mà một thân skill viết một lần vẫn trỏ đúng ở cả bốn dialect, dù layout mỗi
nơi một khác. Đừng hardcode `references/…` — xem `docs/TARGET-MATRIX.md`.

## references/

Chỉ **skill** mang được `references/`. Thư mục cha phải tên bằng `id` của skill chủ, và
nằm cùng `domain`. Sai một trong ba điều đó là lỗi:

    assets/skills/erp/erp-sql-reference/references/functions.md    ✅
    assets/skills/erp/erp-sql-reference/functions.md               ❌ thiếu references/
    assets/skills/pm/erp-sql-reference/references/functions.md     ❌ lệch domain

## Không bao giờ có secret

`check` fail nếu thấy shape connection string trong `assets/**` hoặc `ledger/**`:
`Data Source=`, `Initial Catalog=`, `Password=`, `Pwd=`, `User ID=`, `Uid=`, và
`-----BEGIN … PRIVATE KEY-----`.

Dòng **nói về** pattern (tài liệu cấm secret) đánh dấu waiver tường minh bằng marker
`4ai:allow-secret-pattern` trên chính dòng đó. Waiver phải nhìn thấy được trong diff —
đó là điểm của nó.

## Output được cưỡng chế ở writer.mjs

Không lặp lại các quy tắc này ở nơi khác:

- File generate: **UTF-8 không BOM**, newline **LF**, có trailing newline.
- JSON: indent 2, key sorted — chạy lại phải ra file giống hệt từng byte.
- File nguồn FBO thì ngược lại: có thể Windows-1258 + CRLF, **giữ nguyên**.

## Bước kết thúc bắt buộc

Viết xong asset mà chưa chạy hai lệnh này thì **task chưa xong**:

    node tools/4ai.mjs check
    node tools/4ai.mjs sync --dry-run

`check` phải exit 0. `sync --dry-run` chạy hai lần liên tiếp phải cho **cùng kết quả** — đó
là bài kiểm tra idempotency, và không có test runner nào khác.

Báo cáo lại: `id`, đường dẫn nguồn, các đường dẫn sẽ emit (lấy từ `node tools/4ai.mjs
explain <id>`), và kết quả check.

Đừng sửa file generate trong `.claude/` `.cursor/` `.github/` `.agents/` — sync
sẽ refuse. Sửa nguồn trong `assets/` rồi sync lại.
