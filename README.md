# 4AI

Hub trợ lý AI cho FBO/FBI. **Nguồn sự thật duy nhất** cho rules, skills, sub-agents, slash
commands và cấu hình MCP — biên dịch ra format native của Claude Code, Cursor, VSCode/Copilot
và DevWorkFlow.

Sửa một chỗ trong `assets/`, chạy `sync`, mọi công cụ cập nhật. Trôi lệch trở thành lỗi
`check` chứ không phải chuyện phát hiện sau sáu tháng.

## Chạy

```bash
node tools/4ai.mjs check          # validate hub, không bao giờ ghi
node tools/4ai.mjs list           # bảng asset
node tools/4ai.mjs explain <id>   # asset này emit ra những đường dẫn nào
node tools/4ai.mjs sync --dry-run # xem kế hoạch ghi
node tools/4ai.mjs sync           # ghi thật
```

Yêu cầu duy nhất: **Node.js ≥ 22**. Không `npm install`, không dependency.

## Bố cục

| Thư mục | Nội dung |
|---|---|
| `assets/` | ★ Nguồn sự thật. Markdown + YAML frontmatter, một file một asset |
| `mcp/servers.json` | Registry MCP chuẩn |
| `data/` | `customers.json` (chương trình khách), `fbo-folders.json` (bản đồ Controllers) |
| `targets.json` | Sync ghi đi đâu, tool nào, domain nào |
| `tools/` | CLI. `4ai.mjs` + `lib/` |
| `docs/` | `ASSET-FORMAT.md`, `TARGET-MATRIX.md`, `DEVWORKFLOW-CONTRACT.md` |
| `ledger/` | Dữ liệu quản lý dự án: task, changelog, biên bản bàn giao |

Chi tiết format asset: [docs/ASSET-FORMAT.md](docs/ASSET-FORMAT.md).
