// vscode.mjs — emitter cho VSCode / GitHub Copilot.
//   .github/copilot-instructions.md               ← doctrine + rule always (gộp, 4AI sở hữu trọn)
//   .github/instructions/<id>.instructions.md     ← rule globs + skill, frontmatter applyTo
//   .github/chatmodes/<id>.chatmode.md            ← agent
//   .github/prompts/<id>.prompt.md                ← command, frontmatter mode/description
//   .vscode/mcp.json                              ← key `servers` (KHÁC mcpServers) + type stdio

import { emitPaths, mcpPath } from '../paths.mjs';
import {
  banner, bannerAggregate, seeAlsoLine, alwaysOnAssets, onDemandAssets, forEmit, referenceFiles,
} from './common.mjs';
import { stringifyFrontmatter } from '../fm.mjs';

function instructionsFile(asset) {
  const fm = stringifyFrontmatter({
    applyTo: asset.globs?.length ? asset.globs.join(', ') : '**',
    description: asset.description,
  });
  const head = asset.severity === 'hard'
    ? `> **Rule cứng (severity: hard)** — vi phạm là sai, không phải lựa chọn.\n\n`
    : '';
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${head}${asset.body}${seeAlsoLine(asset)}`;
}

function chatmodeFile(asset) {
  const fm = stringifyFrontmatter({
    description: asset.description,
    ...(asset.tools?.length ? { tools: asset.tools } : {}),
  });
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${asset.body}${seeAlsoLine(asset)}`;
}

function promptFile(asset) {
  const fm = stringifyFrontmatter({
    mode: asset.mode ?? 'agent',
    description: asset.description,
  });
  return `${fm}\n${banner(asset)}\n\n${asset.body}`;
}

function copilotInstructions(always) {
  const parts = [bannerAggregate(`Gộp từ ${always.length} asset luôn-nạp. Nguồn: assets/ trong hub.`)];
  parts.push('\n# 4AI — hướng dẫn Copilot (generate)\n');
  for (const a of always) {
    const sev = a.severity === 'hard' ? ' · **BẮT BUỘC**' : '';
    parts.push(`\n## ${a.title}${sev}\n\n<!-- ${a.rel} v${a.version} -->\n${a.body.trim()}`);
  }
  return parts.join('\n');
}

export function emitVscode({ assets, mcpServers }) {
  const textFiles = [];
  const jsonFiles = [];
  const notes = [];

  const always = alwaysOnAssets(assets);
  const onDemand = onDemandAssets(assets);

  if (always.length > 0) {
    textFiles.push({ relPath: '.github/copilot-instructions.md', content: copilotInstructions(always) });
  }

  for (const a of onDemand) {
    const x = forEmit(a, 'vscode');
    for (const e of emitPaths(x, 'vscode')) {
      if (e.mode !== 'file') continue;
      if (a.kind === 'agent') textFiles.push({ relPath: e.path, content: chatmodeFile(x), sourceId: a.id, sourceVersion: a.version });
      else if (a.kind === 'command') textFiles.push({ relPath: e.path, content: promptFile(x), sourceId: a.id, sourceVersion: a.version });
      else textFiles.push({ relPath: e.path, content: instructionsFile(x), sourceId: a.id, sourceVersion: a.version });
    }
    textFiles.push(...referenceFiles(x, 'vscode'));
  }

  const mp = mcpPath('vscode');
  const serverIds = Object.keys(mcpServers);
  if (serverIds.length > 0) {
    const patch = { [mp.key]: {} };
    for (const [id, srv] of Object.entries(mcpServers)) {
      patch[mp.key][id] = {
        type: 'stdio', // VSCode bắt buộc khai type — khác Claude/Cursor
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
