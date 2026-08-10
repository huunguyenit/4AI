// paths.mjs — ma trận projection dưới dạng code.
// `explain` và các emitter dùng chung file này để không bao giờ lệch nhau.
// Bản chữ tương ứng: docs/TARGET-MATRIX.md

/** File dùng chung mà nhiều asset cùng gộp vào. */
export const SHARED = {
  claudeContext: '4ai-context.md',
  copilotInstructions: '.github/copilot-instructions.md',
};

/**
 * Asset này thuộc nhóm "luôn nạp" (doctrine, hoặc rule always:true) hay nhóm
 * "nạp theo yêu cầu"? Quyết định projection ở Claude Code và Copilot.
 */
export function isAlwaysOn(asset) {
  return asset.kind === 'doctrine' || asset.always === true;
}

/**
 * @param {object} asset  asset đã applyDefaults
 * @param {'claude'|'cursor'|'vscode'|'antigravity'} tool
 * @param {{claudeRoot?: string}} opts
 *        claudeRoot: '.claude' cho project scope, '.' khi dest CHÍNH LÀ ~/.claude
 * @returns {Array<{path: string, mode: 'file'|'inline'}>}
 */
export function emitPaths(asset, tool, opts = {}) {
  const id = asset.id;
  const claudeRoot = opts.claudeRoot ?? '.claude';
  const c = (p) => (claudeRoot === '.' ? p : `${claudeRoot}/${p}`);
  const alwaysOn = isAlwaysOn(asset);

  switch (tool) {
    case 'claude':
      if (alwaysOn) return [{ path: c(SHARED.claudeContext), mode: 'inline' }];
      if (asset.kind === 'agent') return [{ path: c(`agents/${id}.md`), mode: 'file' }];
      if (asset.kind === 'command') return [{ path: c(`commands/${id}.md`), mode: 'file' }];
      // rule có phạm vi và skill đều thành skill — Claude Code không có primitive
      // rule kích hoạt theo đường dẫn.
      return [{ path: c(`skills/${id}/SKILL.md`), mode: 'file' }];

    case 'cursor':
      if (asset.kind === 'agent' || asset.kind === 'command') {
        return [{ path: `.cursor/commands/${id}.md`, mode: 'file' }];
      }
      if (asset.kind === 'doctrine') {
        return [{ path: `.cursor/rules/00-${id}.mdc`, mode: 'file' }];
      }
      return [{ path: `.cursor/rules/${id}.mdc`, mode: 'file' }];

    case 'vscode':
      if (asset.kind === 'agent') {
        return [{ path: `.github/chatmodes/${id}.chatmode.md`, mode: 'file' }];
      }
      if (asset.kind === 'command') {
        return [{ path: `.github/prompts/${id}.prompt.md`, mode: 'file' }];
      }
      if (alwaysOn) return [{ path: SHARED.copilotInstructions, mode: 'inline' }];
      return [{ path: `.github/instructions/${id}.instructions.md`, mode: 'file' }];

    // Antigravity — mapping best-effort theo tài liệu công khai (public preview,
    // chưa xác nhận trên máy thật). Xem ghi chú trong emit/antigravity.mjs.
    case 'antigravity':
      if (asset.kind === 'agent') return [{ path: `.agents/agents/${id}.md`, mode: 'file' }];
      if (asset.kind === 'command') return [{ path: `.agents/workflows/${id}.md`, mode: 'file' }];
      if (asset.kind === 'skill') return [{ path: `.agents/skills/${id}/SKILL.md`, mode: 'file' }];
      // doctrine + rule (always hay globs) đều là rule file riêng — activation mode
      // (always_on/glob/model_decision) nằm trong frontmatter, không gộp chung một file.
      return [{ path: `.agents/rules/${id}.md`, mode: 'file' }];

    default:
      throw new Error(`tool không rõ: ${tool}`);
  }
}

/** Đường dẫn file cấu hình MCP của từng tool. */
export function mcpPath(tool, opts = {}) {
  const claudeRoot = opts.claudeRoot ?? '.claude';
  switch (tool) {
    case 'claude':
      // Scope user (~/.claude) không dùng .mcp.json — xem docs/TARGET-MATRIX.md.
      return claudeRoot === '.' ? null : { path: '.mcp.json', key: 'mcpServers' };
    case 'cursor':
      return { path: '.cursor/mcp.json', key: 'mcpServers' };
    case 'vscode':
      return { path: '.vscode/mcp.json', key: 'servers' };
    case 'antigravity':
      return { path: '.agents/mcp_config.json', key: 'mcpServers' };
    default:
      return null;
  }
}
