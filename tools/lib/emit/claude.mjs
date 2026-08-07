// claude.mjs — emitter cho Claude Code.
//
// Project scope (claudeRoot='.claude'):
//   .claude/4ai-context.md            ← doctrine + rule always:true, gộp
//   .claude/skills/<id>/SKILL.md      ← skill + rule có globs
//   .claude/agents/<id>.md
//   .claude/commands/<id>.md
//   .mcp.json                         ← mcpServers (merge)
//   .claude/settings.json             ← enabledMcpjsonServers + permissions.allow (merge)
//
// User scope (claudeRoot='.', globalPolicy 'on-demand-only'):
//   skills/ agents/ commands/ như trên, KHÔNG có 4ai-context đầy đủ —
//   thay bằng một đoạn ngắn trong CLAUDE.md (global) trỏ tới skill.
//   MCP: không ghi file — in lệnh `claude mcp add` cho người dùng.

import { emitPaths, mcpPath } from '../paths.mjs';
import { banner, bannerAggregate, seeAlsoLine, alwaysOnAssets, onDemandAssets } from './common.mjs';
import { stringifyFrontmatter } from '../fm.mjs';

function skillFile(asset) {
  const fm = stringifyFrontmatter({
    name: asset.id,
    description: asset.description,
  });
  const head = asset.severity === 'hard'
    ? `> **Rule cứng (severity: hard)** — vi phạm là sai, không phải lựa chọn.\n\n`
    : '';
  const scope = asset.globs?.length
    ? `> Phạm vi: \`${asset.globs.join('`, `')}\`\n\n`
    : '';
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${head}${scope}${asset.body}${seeAlsoLine(asset)}`;
}

function agentFile(asset) {
  const fm = stringifyFrontmatter({
    name: asset.id,
    description: asset.description,
    tools: (asset.tools ?? []).join(', '),
    ...(asset.model && asset.model !== 'inherit' ? { model: asset.model } : {}),
  });
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${asset.body}${seeAlsoLine(asset)}`;
}

function commandFile(asset) {
  const fm = stringifyFrontmatter({
    description: asset.description,
    ...(asset['argument-hint'] ? { 'argument-hint': asset['argument-hint'] } : {}),
  });
  return `${fm}\n${banner(asset)}\n\n${asset.body}`;
}

function contextFile(always, onDemand) {
  const parts = [bannerAggregate(
    `Gộp từ ${always.length} asset luôn-nạp. Nguồn: assets/ trong hub.`)];
  parts.push('\n# 4AI — bối cảnh FBO (generate)\n');
  for (const a of always) {
    const sev = a.severity === 'hard' ? ' · **BẮT BUỘC**' : '';
    parts.push(`\n## ${a.title}${sev}\n\n<!-- ${a.rel} v${a.version} -->\n${a.body.trim()}`);
  }
  if (onDemand.length > 0) {
    parts.push('\n\n## Routing — nạp skill khi task chạm phạm vi\n');
    parts.push('| Skill | Nạp khi |');
    parts.push('|---|---|');
    for (const a of onDemand) {
      parts.push(`| \`${a.id}\` | ${a.description} |`);
    }
  }
  return parts.join('\n');
}

/**
 * @returns {{textFiles: [], jsonFiles: [], notes: []}}
 */
export function emitClaude({ assets, mcpServers, target }) {
  const isUserScope = target.scope === 'user';
  const claudeRoot = isUserScope ? '.' : '.claude';
  const textFiles = [];
  const jsonFiles = [];
  const notes = [];

  const always = alwaysOnAssets(assets);
  const onDemand = onDemandAssets(assets);

  // User scope, chính sách on-demand-only: KHÔNG đẩy asset always lên global.
  // Chúng chuyển thành skill như mọi asset khác.
  const asSkills = isUserScope ? [...always.filter((a) => a.kind !== 'doctrine'), ...onDemand]
    : onDemand;
  const doctrines = isUserScope ? always.filter((a) => a.kind === 'doctrine') : [];

  if (!isUserScope) {
    textFiles.push({
      relPath: `${claudeRoot}/4ai-context.md`,
      content: contextFile(always, onDemand),
    });
  } else {
    // Global: một file mồi NGẮN — nói khi nào thì nạp gì. Doctrine cũng thành skill.
    for (const d of doctrines) asSkills.unshift(d);
    const lines = [bannerAggregate('File mồi cho scope user-global (on-demand-only).')];
    lines.push('\n# 4AI — FBO (global, generate)\n');
    lines.push('Chỉ áp dụng khi làm việc với chương trình FBO/FBI (thư mục có `App_Data\\Controllers\\`)');
    lines.push('hoặc khi người dùng nhắc tới FBO, controller, Radar, customize màn hình.');
    lines.push('Khi đó, nạp skill theo bảng — ngoài ra bỏ qua toàn bộ.\n');
    lines.push('| Skill | Nạp khi |');
    lines.push('|---|---|');
    for (const a of asSkills) lines.push(`| \`${a.id}\` | ${a.description} |`);
    textFiles.push({ relPath: '4ai-global.md', content: lines.join('\n') });
  }

  for (const a of asSkills) {
    for (const e of emitPaths({ ...a, always: false, kind: a.kind === 'doctrine' ? 'skill' : a.kind }, 'claude', { claudeRoot })) {
      if (e.mode !== 'file') continue;
      if (a.kind === 'agent') textFiles.push({ relPath: e.path, content: agentFile(a), sourceId: a.id, sourceVersion: a.version });
      else if (a.kind === 'command') textFiles.push({ relPath: e.path, content: commandFile(a), sourceId: a.id, sourceVersion: a.version });
      else textFiles.push({ relPath: e.path, content: skillFile(a), sourceId: a.id, sourceVersion: a.version });
    }
  }

  // MCP — chỉ project scope.
  const mp = mcpPath('claude', { claudeRoot });
  const serverIds = Object.keys(mcpServers);
  if (mp && serverIds.length > 0) {
    const patch = { [mp.key]: {} };
    for (const [id, srv] of Object.entries(mcpServers)) {
      patch[mp.key][id] = {
        command: srv.command,
        ...(srv.args?.length ? { args: srv.args } : { args: [] }),
        ...(srv.cwd ? { cwd: srv.cwd } : {}),
        ...(srv.env && Object.keys(srv.env).length ? { env: srv.env } : {}),
      };
    }
    jsonFiles.push({ relPath: '.mcp.json', patch, ownedKeys: serverIds.map((id) => `${mp.key}.${id}`) });

    const allow = [];
    for (const [id, srv] of Object.entries(mcpServers)) {
      for (const tool of srv.autoApprove ?? []) allow.push(`mcp__${id}__${tool}`);
    }
    jsonFiles.push({
      relPath: '.claude/settings.json',
      patch: {
        enabledMcpjsonServers: serverIds,
        ...(allow.length ? { permissions: { allow } } : {}),
      },
      ownedKeys: ['enabledMcpjsonServers', 'permissions.allow'],
    });
  } else if (isUserScope && serverIds.length > 0) {
    for (const [id, srv] of Object.entries(mcpServers)) {
      const envArgs = Object.entries(srv.env ?? {}).map(([k, v]) => `--env ${k}="${v}"`).join(' ');
      notes.push(`MCP scope user không ghi file (Claude Code tự quản ~/.claude.json). Chạy tay nếu muốn: claude mcp add -s user ${id} ${envArgs} -- "${srv.command}"`.trim());
    }
  }

  return { textFiles, jsonFiles, notes };
}
