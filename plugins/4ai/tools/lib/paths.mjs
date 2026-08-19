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
 * @param {'claude'|'cursor'|'vscode'|'antigravity'|'plugin'|'cursor-plugin'} tool
 * @param {{claudeRoot?: string, cursorRoot?: string}} opts
 *        claudeRoot: '.claude' cho project scope, '.' khi dest CHÍNH LÀ ~/.claude
 *        cursorRoot: '.cursor' cho project scope, '.' khi dest CHÍNH LÀ ~/.cursor
 * @returns {Array<{path: string, mode: 'file'|'inline'}>}
 */
export function emitPaths(asset, tool, opts = {}) {
  const id = asset.id;
  const claudeRoot = opts.claudeRoot ?? '.claude';
  const cursorRoot = opts.cursorRoot ?? '.cursor';
  const c = (p) => (claudeRoot === '.' ? p : `${claudeRoot}/${p}`);
  const cu = (p) => (cursorRoot === '.' ? p : `${cursorRoot}/${p}`);
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
      // Cursor có subagent primitive thật (đọc .cursor/agents/ VÀ .claude/agents/ cho
      // "Claude compatibility") — kind:agent ra file subagent thật, không còn giả làm command.
      // User scope: dest = ~/.cursor → cursorRoot='.' → agents/<id>.md (không lồng .cursor/).
      if (asset.kind === 'agent') {
        return [{ path: cu(`agents/${id}.md`), mode: 'file' }];
      }
      if (asset.kind === 'command') {
        return [{ path: cu(`commands/${id}.md`), mode: 'file' }];
      }
      // Cursor CÓ primitive Skill thật, auto-discover ở `.cursor/skills/` (project) và
      // `~/.cursor/skills/` (user) — cùng layout `<id>/SKILL.md` với Claude Code, và
      // `references/` bên trong là thư mục đi kèm được hỗ trợ chính thức.
      if (asset.kind === 'skill') {
        return [{ path: cu(`skills/${id}/SKILL.md`), mode: 'file' }];
      }
      // doctrine + rule vẫn là rule: chúng cần `alwaysApply`/`globs` — cơ chế kích hoạt mà
      // skill không có. Đổi chúng thành skill là mất phần "luôn nạp".
      if (asset.kind === 'doctrine') {
        return [{ path: cu(`rules/00-${id}.mdc`), mode: 'file' }];
      }
      return [{ path: cu(`rules/${id}.mdc`), mode: 'file' }];

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

    // Plugin Claude Code — cùng primitive với claude nhưng nằm ở gốc plugin, không
    // lồng .claude/. Plugin KHÔNG có primitive "context luôn nạp": doctrine và rule
    // always đều hạ thành skill, như scope user-global vẫn làm.
    case 'plugin':
      if (asset.kind === 'agent') return [{ path: `agents/${id}.md`, mode: 'file' }];
      if (asset.kind === 'command') return [{ path: `commands/${id}.md`, mode: 'file' }];
      return [{ path: `skills/${id}/SKILL.md`, mode: 'file' }];

    // Plugin Cursor (.cursor-plugin/) — cùng primitive với cursor nhưng nằm ở gốc plugin,
    // không lồng .cursor/. Cursor plugin có rules/ auto-discover thật (không như Claude
    // plugin), nên mapping giống hệt case 'cursor' project scope, chỉ bỏ tiền tố .cursor/.
    case 'cursor-plugin':
      if (asset.kind === 'agent') return [{ path: `agents/${id}.md`, mode: 'file' }];
      if (asset.kind === 'command') return [{ path: `commands/${id}.md`, mode: 'file' }];
      // `skills/` trong gói plugin cũng auto-discover — mỗi thư mục con có `SKILL.md`.
      if (asset.kind === 'skill') return [{ path: `skills/${id}/SKILL.md`, mode: 'file' }];
      if (asset.kind === 'doctrine') return [{ path: `rules/00-${id}.mdc`, mode: 'file' }];
      return [{ path: `rules/${id}.mdc`, mode: 'file' }];

    default:
      throw new Error(`tool không rõ: ${tool}`);
  }
}

/** Đường dẫn file cấu hình MCP của từng tool. */
export function mcpPath(tool, opts = {}) {
  const claudeRoot = opts.claudeRoot ?? '.claude';
  const cursorRoot = opts.cursorRoot ?? '.cursor';
  switch (tool) {
    case 'claude':
      // Scope user (~/.claude) không dùng .mcp.json — xem docs/TARGET-MATRIX.md.
      return claudeRoot === '.' ? null : { path: '.mcp.json', key: 'mcpServers' };
    case 'cursor':
      // User scope: dest = ~/.cursor → mcp.json (không lồng .cursor/mcp.json).
      return {
        path: cursorRoot === '.' ? 'mcp.json' : '.cursor/mcp.json',
        key: 'mcpServers',
      };
    case 'vscode':
      return { path: '.vscode/mcp.json', key: 'servers' };
    case 'antigravity':
      return { path: '.agents/mcp_config.json', key: 'mcpServers' };
    case 'plugin':
      return { path: '.mcp.json', key: 'mcpServers' };
    // Cursor plugin auto-discovery quét đúng tên `mcp.json` ở gốc gói (không có dấu chấm
    // đầu, khác Claude plugin) — xem bảng auto-discovery trong cursor.com/docs/reference/plugins.
    case 'cursor-plugin':
      return { path: 'mcp.json', key: 'mcpServers' };
    default:
      return null;
  }
}

/**
 * Thư mục chứa file `references/*.md` đi kèm một skill, cho từng dialect.
 *
 * Hai hình dạng, do primitive của dialect quyết định — không phải lựa chọn thẩm mỹ:
 *  - dialect có skill là THƯ MỤC (`skills/<id>/SKILL.md`): reference nằm ngay trong đó,
 *    `skills/<id>/references/`. Đây là layout Claude Code/Antigravity đọc được.
 *  - dialect có asset là MỘT FILE (`rules/<id>.mdc`, `<id>.instructions.md`): không có thư
 *    mục riêng để chui vào, nên phải tự tạo và đặt tên theo id — `references/<id>/` — nếu
 *    không hai skill cùng thư mục sẽ ghi đè reference của nhau.
 *
 * @returns {string|null} đường dẫn thư mục (rel so với dest root), null nếu asset không ra file
 */
export function referenceDir(asset, tool, opts = {}) {
  const first = emitPaths(asset, tool, opts)[0];
  if (!first || first.mode !== 'file') return null;
  const p = first.path;
  const slash = p.lastIndexOf('/');
  const dir = slash === -1 ? '' : p.slice(0, slash);
  const base = slash === -1 ? p : p.slice(slash + 1);
  const tail = base === 'SKILL.md' ? 'references' : `references/${asset.id}`;
  return dir === '' ? tail : `${dir}/${tail}`;
}

/**
 * Đường dẫn TƯƠNG ĐỐI từ file chính tới thư mục reference — giá trị thay cho token
 * `{REFDIR}` trong thân asset. Nhờ nó một thân asset viết một lần vẫn trỏ đúng ở mọi
 * dialect, dù layout mỗi nơi một khác.
 */
export function referenceRef(asset, tool, opts = {}) {
  const dir = referenceDir(asset, tool, opts);
  if (!dir) return null;
  const primary = emitPaths(asset, tool, opts)[0].path;
  const slash = primary.lastIndexOf('/');
  const from = slash === -1 ? '' : primary.slice(0, slash + 1);
  return dir.startsWith(from) ? dir.slice(from.length) : dir;
}
