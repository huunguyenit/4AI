// cursor.mjs — emitter cho Cursor.
//   .cursor/rules/<id>.mdc            frontmatter: description, globs, alwaysApply
//   .cursor/commands/<id>.md          agent + command (Cursor không có sub-agent primitive)
//   .cursor/mcp.json                  mcpServers (merge)

import { emitPaths, mcpPath } from '../paths.mjs';
import { banner, seeAlsoLine } from './common.mjs';
import { stringifyFrontmatter } from '../fm.mjs';
import { isAlwaysOn } from '../paths.mjs';

function mdcFile(asset) {
  const fm = stringifyFrontmatter({
    description: asset.description,
    ...(asset.globs?.length ? { globs: asset.globs } : {}),
    alwaysApply: isAlwaysOn(asset),
  });
  const head = asset.severity === 'hard'
    ? `> **Rule cứng (severity: hard)** — vi phạm là sai, không phải lựa chọn.\n\n`
    : '';
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${head}${asset.body}${seeAlsoLine(asset)}`;
}

function commandFile(asset) {
  const label = asset.kind === 'agent'
    ? `> Vai trò sub-agent (Cursor không có primitive riêng — chạy như một command có kịch bản).\n\n`
    : '';
  return `${banner(asset)}\n\n# ${asset.title}\n\n${label}${asset.body}${seeAlsoLine(asset)}`;
}

export function emitCursor({ assets, mcpServers }) {
  const textFiles = [];
  const jsonFiles = [];
  const notes = [];

  for (const a of assets) {
    for (const e of emitPaths(a, 'cursor')) {
      if (a.kind === 'agent' || a.kind === 'command') {
        textFiles.push({ relPath: e.path, content: commandFile(a), sourceId: a.id, sourceVersion: a.version });
      } else {
        textFiles.push({ relPath: e.path, content: mdcFile(a), sourceId: a.id, sourceVersion: a.version });
      }
    }
  }

  const mp = mcpPath('cursor');
  const serverIds = Object.keys(mcpServers);
  if (serverIds.length > 0) {
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
