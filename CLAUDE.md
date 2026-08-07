# 4AI

Hub biên dịch cấu hình trợ lý AI cho FBO/FBI. Một corpus markdown → bốn phương ngữ config
(Claude Code, Cursor, VSCode/Copilot, DevWorkFlow). Không phải một ứng dụng, không host LLM,
không chạy lúc edit — nó là **compiler**.

## Commands

```bash
node tools/4ai.mjs check            # validate hub. Exit 0/1. Không bao giờ ghi
node tools/4ai.mjs sync --dry-run   # kế hoạch ghi, không ghi
node tools/4ai.mjs sync             # ghi thật
```

Không có test runner. `check` chính là test suite; `sync --dry-run` chạy hai lần liên tiếp
phải cho cùng kết quả — đó là bài kiểm tra idempotency.

## Hard rules

- **`writer.mjs` là nơi DUY NHẤT chạm filesystem output.** Emitter trả về mô tả file, không ghi.
  Vi phạm điều này là `--dry-run` mất tác dụng và không ai phát hiện được.
- **`schema.mjs` là nơi DUY NHẤT tên field tồn tại.** Không hardcode tên field ở emitter.
- **Zero npm dependency.** Bề mặt dependency đúng bằng bốn thứ: `TextDecoder('windows-1258')`,
  `node:util.parseArgs`, `node:fs.globSync`, `node:crypto.createHash`. Thêm dependency là
  thay đổi kiến trúc, cần bàn trước.
- **Không bao giờ ghi vào target có `role: customer-program`.** Đó là phần mềm đang chạy của khách.
- **`fm.mjs` chỉ hỗ trợ subset YAML đã khai báo.** Gặp cú pháp ngoài subset thì báo lỗi kèm số
  dòng, không đoán.

## Context files — chỉ mở cái task cần

| File | Mở khi |
|---|---|
| `docs/ASSET-FORMAT.md` | Viết hoặc sửa asset trong `assets/` |
| `docs/TARGET-MATRIX.md` | Sửa emitter, hoặc hỏi "asset này ra file nào" |
| `docs/DEVWORKFLOW-CONTRACT.md` | Làm việc với `emit/devworkflow.mjs` hoặc `ai-kit.json` |
| `targets.json` | Thêm/bật/tắt nơi sync ghi tới |
| `mcp/servers.json` | Đụng tới cấu hình MCP |

Đừng đọc cả bộ để "lấy context".

## Conventions

- Văn xuôi **tiếng Việt**, identifier/heading/tên module **tiếng Anh**.
- Output generate: UTF-8 **không BOM**, newline **LF**, có trailing newline. Cưỡng chế trong
  `writer.mjs`, không lặp lại ở nơi khác.
- Input là file nguồn FBO thì ngược lại: có thể Windows-1258 + CRLF, **giữ nguyên**.
- JSON ghi ra: indent 2, key sorted — chạy lại phải ra file giống hệt từng byte.
- ES modules (`.mjs`), không CommonJS.

## Thẩm quyền khi các nguồn mâu thuẫn

`docs/ASSET-FORMAT.md` > `schema.mjs` > emitter. Nếu emitter làm khác schema, emitter sai.
