// cursor.mjs — emitter cho Cursor.
//
// Project scope (cursorRoot='.cursor'):
//   .cursor/rules/<id>.mdc            doctrine + rule — frontmatter: description, globs, alwaysApply
//   .cursor/skills/<id>/SKILL.md      skill — frontmatter: name, description
//   .cursor/skills/<id>/references/   phụ lục skill, Cursor nạp theo yêu cầu
//   .cursor/commands/<id>.md
//   .cursor/agents/<id>.md            subagent thật
//   .cursor/mcp.json                  mcpServers (merge)
//
// User scope (cursorRoot='.', globalPolicy 'on-demand-only', dest = ~/.cursor):
//   agents/ commands/ rules/ skills/ như trên (không lồng .cursor/), alwaysApply luôn false.
//   mcp.json — merge MCP user-level (Cursor đọc ~/.cursor/mcp.json).
//
// Skill KHÔNG còn bị hạ xuống rule. Cursor có primitive Skill thật, auto-discover ở
// `.cursor/skills/` và `~/.cursor/skills/`, cùng layout `<id>/SKILL.md` với Claude Code
// (cursor.com/docs/context/skills). Trước đây 4AI gộp skill vào `.mdc` vì Cursor chưa có
// primitive đó — nay có thì dùng đúng nó: rule mang `alwaysApply`/`globs`, skill mang
// `name`/`description` và nạp theo yêu cầu; ép skill thành rule là mất đúng sự phân biệt ấy.

import { emitPaths, mcpPath, isAlwaysOn } from '../paths.mjs';
import {
  banner, seeAlsoLine, linkCrossRefs, isReadonlyAgent,
  alwaysOnAssets, onDemandAssets, forEmit, referenceFiles,
} from './common.mjs';
import { stringifyFrontmatter } from '../fm.mjs';

function mdcFile(asset, body, { forceOnDemand = false } = {}) {
  const fm = stringifyFrontmatter({
    description: asset.description,
    ...(asset.globs?.length ? { globs: asset.globs } : {}),
    alwaysApply: forceOnDemand ? false : isAlwaysOn(asset),
  });
  const head = asset.severity === 'hard'
    ? `> **Rule cứng (severity: hard)** — vi phạm là sai, không phải lựa chọn.\n\n`
    : '';
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${head}${body}${seeAlsoLine(asset)}`;
}

/**
 * Skill của Cursor. `name` BẮT BUỘC trùng tên thư mục cha — hub đã ràng `id` = tên file
 * nên điều đó tự đúng. Không có `alwaysApply`: skill vốn chỉ nạp theo yêu cầu.
 */
function skillFile(asset, body) {
  const fm = stringifyFrontmatter({
    name: asset.id,
    description: asset.description,
    ...(asset.globs?.length ? { paths: asset.globs } : {}),
  });
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${body}${seeAlsoLine(asset)}`;
}

function commandFile(asset, body) {
  return `${banner(asset)}\n\n# ${asset.title}\n\n${body}${seeAlsoLine(asset)}`;
}

/** Subagent thật của Cursor — cùng field với .claude/agents/ (Cursor đọc thẳng thư mục đó
 * cho "Claude compatibility"), cộng `readonly` suy từ allowlist `tools`. */
function agentFile(asset, body) {
  const fm = stringifyFrontmatter({
    name: asset.id,
    description: asset.description,
    model: asset.model,
    ...(isReadonlyAgent(asset) ? { readonly: true } : {}),
  });
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${body}${seeAlsoLine(asset)}`;
}

/**
 * @returns {{textFiles: [], jsonFiles: [], notes: []}}
 */
export function emitCursor({ assets, mcpServers, target = {} }) {
  const isUserScope = target.scope === 'user';
  const cursorRoot = isUserScope ? '.' : '.cursor';
  const pathOpts = { cursorRoot };
  const textFiles = [];
  const jsonFiles = [];
  const notes = [];

  // User scope on-demand-only: không đẩy alwaysApply:true lên global. Doctrine/rule always
  // vẫn emit thành file rule nhưng alwaysApply=false (agent chỉ nạp khi được nhắc tới).
  const list = isUserScope
    ? [
      ...alwaysOnAssets(assets).filter((a) => a.kind !== 'doctrine'),
      ...onDemandAssets(assets),
      ...alwaysOnAssets(assets).filter((a) => a.kind === 'doctrine'),
    ]
    : assets;

  for (const a of list) {
    const forPath = forEmit(a, 'cursor', pathOpts, isUserScope ? { always: false } : {});
    for (const e of emitPaths(forPath, 'cursor', pathOpts)) {
      const body = linkCrossRefs(forPath.body, {
        assets: list, tool: 'cursor', fromPath: e.path, opts: pathOpts,
      });
      const content = a.kind === 'agent' ? agentFile(a, body)
        : a.kind === 'command' ? commandFile(a, body)
        : a.kind === 'skill' ? skillFile(a, body)
        : mdcFile(a, body, { forceOnDemand: isUserScope });
      textFiles.push({ relPath: e.path, content, sourceId: a.id, sourceVersion: a.version });
    }
    textFiles.push(...referenceFiles(forPath, 'cursor', pathOpts));
  }

  const mp = mcpPath('cursor', pathOpts);
  const serverIds = Object.keys(mcpServers);
  if (mp && serverIds.length > 0) {
    const patch = { [mp.key]: {} };
    for (const [id, srv] of Object.entries(mcpServers)) {
      patch[mp.key][id] = {
        command: srv.command,
        args: srv.args ?? [],
        ...(srv.cwd ? { cwd: srv.cwd } : {}),
        ...(srv.env && Object.keys(srv.env).length ? { env: srv.env } : {}),
      };
    }
    jsonFiles.push({ relPath: mp.path, patch, ownedKeys: serverIds.map((id) => `${mp.key}.${id}`) });
  }

  return { textFiles, jsonFiles, notes };
}
