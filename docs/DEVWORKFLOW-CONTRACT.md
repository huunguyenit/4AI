# DEVWORKFLOW-CONTRACT — DevWorkFlow cần gì để tiêu thụ ai-kit.json

Trạng thái hôm nay: **DevWorkFlow chưa có một dòng code AI nào** (audit 2026-08-05 —
không Plugin Loader, không Provider Registry; `docs/01-ARCHITECTURE.md` đặt MCP +
OpenAI-compatible API ở Level 6). 4AI vẫn sync được vào repo vì output là file **trơ**:
không gì đọc chúng, build không đổi. `check` báo `inert (no loader)` — đó là trạng thái
dự kiến, không phải lỗi.

## 4AI emit gì

Vào **source tree** (build của DevWorkFlow link `DevWorkFlow.UI/Config/` sang
`Runtime/Config/`):

```
DevWorkFlow.UI/Config/json/ai-kit.json      manifest
DevWorkFlow.UI/Config/ai/doctrine/*.md      payload markdown thuần
DevWorkFlow.UI/Config/ai/rules/*.md
DevWorkFlow.UI/Config/ai/skills/*.md
DevWorkFlow.UI/Config/ai/agents/*.md
DevWorkFlow.UI/Config/ai/commands/*.md
```

### Schema `ai-kit.json` (schemaVersion 1)

```json
{
  "schemaVersion": 1,
  "generatedBy": "4AI",
  "hubPath": "D:\\Fast Source\\4AI",
  "payloadRoot": "ai",
  "domains": ["core", "fbo-xml", "project-mgmt"],
  "assets": [
    {
      "id": "fbo-radar-query-discipline",
      "kind": "rule",
      "domain": "fbo-xml",
      "title": "Radar (Kuzu) query discipline",
      "description": "…",
      "always": false,
      "severity": "hard",
      "globs": ["**/App_Data/Controllers/**"],
      "requires": ["fastbusiness-mcp"],
      "path": "ai/rules/fbo-radar-query-discipline.md",
      "sha256": "…",
      "version": 1
    }
  ],
  "mcp": [
    {
      "id": "fastbusiness-mcp",
      "transport": "stdio",
      "command": "D:\\fastbusiness_mcp\\fastbusiness_mcp.exe",
      "args": [],
      "cwd": "D:\\fastbusiness_mcp",
      "env": { "FASTBUSINESS_VSCODE_DB_PATH": "…" }
    }
  ]
}
```

`path` tương đối so với **config root** (thư mục chứa `json/`). `sha256` là hash nội dung
file payload (LF, có trailing newline).

## Hợp đồng phía DevWorkFlow (khi implement)

1. **`AiKitOptions` record + `AiKitStore`**, nạp bởi `AppConfigStore` giống hệt cách
   `files.json` được nạp — thêm một filename vào danh sách cứng, không probe mới
   (`RuntimeLayout.ConfigRoot` đã phân giải thư mục).
2. **`ai-kit.json` là tuỳ chọn**: vắng mặt ⇒ tính năng AI tắt, không exception. Đây là
   điều cho phép 4AI sync ngay hôm nay mà không phá build.
3. `schemaVersion` lớn hơn mức biết ⇒ log warning và bỏ qua, **không throw**.
4. Phân giải `path` **tương đối config root**; từ chối path thoát ra ngoài (`..`);
   verify `sha256` trước khi dùng payload.
5. `mcp[]` là descriptor khởi chạy process — nối vào MCP client Level 6 khi có.
   Chưa có thì bỏ qua.
6. Vị trí code: options/model trong `DevWorkFlow.Application` (domain config), việc đọc
   file ở composition root qua `AppConfigStore` — khớp quy tắc chỉ composition root chạm
   `RuntimeLayout`.

## Kiểm chứng tính trơ

Sau mỗi lần sync vào DevWorkFlow:

```bash
dotnet build "D:\Fast Source\Development\DevWorkFlow\DevWorkFlow.slnx"
```

phải thành công y như trước sync. `CLAUDE.md` viết tay của repo không đổi một byte
(4AI chỉ nhắc thêm dòng `@.claude/4ai-context.md` — người thêm là bạn).
