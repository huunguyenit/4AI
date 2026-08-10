# ASSET-FORMAT — hợp đồng frontmatter

Một file trong `assets/` = một asset. UTF-8 **không BOM**, newline **LF**, bắt đầu bằng
`---` ở dòng 1. **Tên file (bỏ `.md`) phải bằng `id`.** Thư mục chỉ là chỗ đặt; `domain`
trong frontmatter mới là chuẩn — `check` fail nếu hai thứ lệch nhau.

Đường dẫn: `assets/doctrine/<id>.md` (phẳng) · `assets/{rules,skills,agents,commands}/<domain>/<id>.md`.

Nơi thi hành schema trong code: [tools/lib/schema.mjs](../tools/lib/schema.mjs).
Thẩm quyền khi lệch nhau: **file này > schema.mjs > emitter**.

## Field

| Field | Bắt buộc | Kiểu | Ý nghĩa |
|---|---|---|---|
| `id` | ✓ | kebab-case, unique toàn hub | Tên file emit ở mọi target, khoá join của manifest |
| `title` | ✓ | chuỗi | Tiêu đề tiếng Anh |
| `kind` | ✓ | `doctrine` `rule` `skill` `agent` `command` | Quyết định emitter nào chạy |
| `domain` | ✓ | kebab-case, phải có trong `targets.json:domains` | Namespace |
| `description` | ✓ | 1 dòng, ≤200 ký tự | Emit **nguyên văn** sang mọi tool. Model đọc riêng dòng này phải quyết định được có nạp hay không |
| `version` | ✓ | số nguyên ≥1 | Tăng khi sửa có ý nghĩa; hiện trong banner output |
| `targets` | | mảng `claude` `cursor` `vscode` `antigravity` | Mặc định: cả bốn |
| `always` | | bool | `true` ⇒ nạp mọi lượt. Mặc định `true` cho doctrine, `false` cho phần còn lại. Loại trừ với `globs` |
| `globs` | | mảng glob | Phạm vi đường dẫn |
| `severity` | rule ✓ | `hard` `soft` | `hard` render thành BẮT BUỘC/KHÔNG ĐƯỢC |
| `requires` | | mảng id server trong `mcp/servers.json` | Dangling ⇒ lỗi |
| `see-also` | | mảng id asset | Dangling ⇒ lỗi |
| `tools` | chỉ agent | mảng tên tool | Tên MCP tool viết dạng `mcp__<server>__<tool>` |
| `model` | chỉ agent | `haiku` `sonnet` `opus` `inherit` | Mặc định `inherit` |
| `argument-hint` | chỉ command | chuỗi | Gợi ý tham số |
| `mode` | chỉ command | `agent` `ask` | Cho Copilot `.prompt.md`. Mặc định `agent` |

## Subset YAML được hỗ trợ (và CHỈ thế)

```yaml
key: bare string          # chuỗi trần
key: "double quoted"      # escape: \" \\ \n \t
key: 'single quoted'      # escape: ''
key: true                 # bool
key: 42                   # số nguyên
key: [a, b, c]            # flow sequence một dòng
key:                      # block sequence
  - item
# comment đứng riêng dòng
```

**Lỗi parse kèm số dòng:** nested map, anchor/alias (`&` `*`), block scalar (`|` `>`),
tag (`!`), multi-document, `null`, số thực, key trùng, sequence lồng nhau. Đây là hợp đồng
khiến parser 120 dòng không dependency là đúng đắn — muốn cấu trúc phức tạp hơn thì đưa
vào **body**, không đưa vào frontmatter.

## Body

Văn xuôi tiếng Việt, identifier/heading tiếng Anh. Phải có ít nhất một heading `## `.
Khung khuyến nghị:

```
## Vì sao          ← 2-4 câu: thiếu asset này thì hỏng cái gì
## Quy tắc         ← bullet mệnh lệnh; BẮT BUỘC / KHÔNG ĐƯỢC khi severity: hard
## Ví dụ           ← path thật, mã controller thật, query thật
## Bẫy             ← cái bẫy tốn một giờ của người đi trước
```

Agent thay `## Quy tắc` bằng `## Nhiệm vụ` + `## Quy trình` + `## Định dạng báo cáo (bắt buộc)`
+ `## Ràng buộc`.

**Cấm tuyệt đối trong body và mọi file `ledger/`, `data/`:** connection string, credential
(`Data Source=`, `Password=`, `Uid=`…). `check` grep và fail.

## Chọn `kind` thế nào

- **rule** — ràng buộc luôn đúng trong phạm vi của nó. Vi phạm là sai, không phải là lựa chọn.
- **skill** — quy trình/kiến thức nạp theo yêu cầu khi task cần.
- **agent** — tác vụ có biên giới, chạy trong context riêng, có danh sách `tools` riêng.
- **doctrine** — nền tảng domain, luôn nạp. Ít và ngắn — mỗi domain đúng một file.
- **command** — điểm vào do người dùng gõ `/<id>`.

## Vòng đời

Viết/sửa asset xong **chưa xong việc**. Xong việc = `node tools/4ai.mjs check` exit 0,
rồi `node tools/4ai.mjs sync --dry-run` và báo cáo đường dẫn sẽ emit.
