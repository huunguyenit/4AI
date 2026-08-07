# TARGET-MATRIX — kind × tool → đường dẫn emit

Dạng code (nguồn chạy thật): [tools/lib/paths.mjs](../tools/lib/paths.mjs). File này là
bản đọc; lệch nhau thì sửa cả hai trong cùng một commit.

## Ma trận

| kind | Claude Code | Cursor | VSCode / Copilot | DevWorkFlow |
|---|---|---|---|---|
| `doctrine` | gộp vào `.claude/4ai-context.md` | `.cursor/rules/00-<id>.mdc` (`alwaysApply: true`) | gộp vào `.github/copilot-instructions.md` | `Config/ai/doctrine/<id>.md` |
| `rule` `always: true` | gộp vào `.claude/4ai-context.md` | `.cursor/rules/<id>.mdc` (`alwaysApply: true`) | gộp vào `.github/copilot-instructions.md` | `Config/ai/rules/<id>.md` |
| `rule` + `globs` | `.claude/skills/<id>/SKILL.md` + dòng routing | `.cursor/rules/<id>.mdc` (`globs`) | `.github/instructions/<id>.instructions.md` (`applyTo`) | `Config/ai/rules/<id>.md` |
| `skill` | `.claude/skills/<id>/SKILL.md` | `.cursor/rules/<id>.mdc` (agent-requested) | `.github/instructions/<id>.instructions.md` | `Config/ai/skills/<id>.md` |
| `agent` | `.claude/agents/<id>.md` | `.cursor/commands/<id>.md` (không có sub-agent primitive) | `.github/chatmodes/<id>.chatmode.md` | `Config/ai/agents/<id>.md` |
| `command` | `.claude/commands/<id>.md` | `.cursor/commands/<id>.md` | `.github/prompts/<id>.prompt.md` | `Config/ai/commands/<id>.md` |

Target `user-global` (`scope: user`, dest chính là `~/.claude`): mọi asset — kể cả
doctrine — đều thành `skills/<id>/SKILL.md` (on-demand-only), cộng file mồi `4ai-global.md`
được `CLAUDE.md` user import. Không có gì `always` ở scope global.

## MCP

| Tool | File | Key bọc | Ghi chú |
|---|---|---|---|
| Claude Code | `.mcp.json` | `mcpServers` | + `.claude/settings.json`: `enabledMcpjsonServers`, `permissions.allow` từ `autoApprove` |
| Cursor | `.cursor/mcp.json` | `mcpServers` | cùng shape |
| VSCode | `.vscode/mcp.json` | **`servers`** | key khác; mỗi entry cần `"type": "stdio"` |
| Claude Code user scope | — | — | không ghi file; CLI in lệnh `claude mcp add -s user …` |
| DevWorkFlow | `Config/json/ai-kit.json` → `mcp[]` | mảng | trơ tới khi có loader |

JSON là tài sản chung: merge theo owned-key, không bao giờ clobber. Chi tiết cơ chế trong
`tools/lib/writer.mjs`.

## Hai quyết định cần nhớ

1. **Rule có `globs` thành skill ở Claude Code** — Claude Code không có primitive rule
   theo đường dẫn; nhồi hết vào context là đốt token mọi lượt. `description` của skill
   nêu rõ trigger; routing table trong `4ai-context.md` liệt kê đủ.
2. **`CLAUDE.md` không bao giờ bị 4AI ghi đè** — 4AI sở hữu `4ai-context.md`/`4ai-global.md`
   và chỉ yêu cầu một dòng `@import`. Chưa có `CLAUDE.md` thì tạo tối thiểu một lần rồi
   thôi. Ngược lại `.github/copilot-instructions.md` do 4AI sở hữu trọn.
