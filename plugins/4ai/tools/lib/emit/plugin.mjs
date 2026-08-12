// plugin.mjs — emitter cho Claude Code plugin (phương ngữ thứ năm).
//
// Khác ba emitter kia ở một điểm: output KHÔNG phải cấu hình rắc vào workspace có sẵn,
// mà là một artifact tự chứa để phân phối qua marketplace. Nên nó còn gói kèm runtime
// (mcp/fbo, src, tools, data) — plugin cấm đường dẫn `../` ra ngoài gốc, mọi thứ asset
// nhắc tới phải nằm trong gói.
//
//   <plugin>/.claude-plugin/plugin.json
//   <plugin>/skills/<id>/SKILL.md      ← skill + rule có globs + doctrine + rule always
//   <plugin>/agents/<id>.md
//   <plugin>/commands/<id>.md
//   <plugin>/.mcp.json                 ← ${CLAUDE_PLUGIN_ROOT} / ${CLAUDE_PLUGIN_DATA}
//   <plugin>/{mcp,src,tools,data}/**   ← runtime chép nguyên văn
//
// Plugin không có primitive "context luôn nạp" như .claude/4ai-context.md: doctrine và
// rule always:true hạ xuống thành skill, giống hệt cách scope user-global vẫn làm.

import fs from 'node:fs';
import path from 'node:path';
import { emitPaths, mcpPath } from '../paths.mjs';
import { banner, seeAlsoLine, alwaysOnAssets, onDemandAssets } from './common.mjs';
import { stringifyFrontmatter } from '../fm.mjs';
import { stableStringify } from '../json.mjs';
import { HUB } from '../assets.mjs';

// Cây runtime chép vào gói. Giữ NGUYÊN đường dẫn tương đối so với hub: mcp/fbo/lib/tools.mjs
// import '../../../src/...' và src/database/*.mjs import '../../mcp/fbo/lib/...' — chép cùng
// layout thì mọi import còn đúng, không phải viết lại đường dẫn.
const RUNTIME_DIRS = ['mcp/fbo', 'src', 'tools', 'data'];

// *.local.json là cấu hình per-máy, gitignore — không bao giờ đi kèm bản phân phối.
const RUNTIME_EXCLUDE = /(^|\/)[^/]*\.local\.json$/;

// Plugin là artifact PHÂN PHỐI — không phải cấu hình riêng của máy build. asset.description/
// asset.body đã bị applyPmTemplate() thay token {PMName}/{PMDept} bằng danh tính PM của máy
// đang chạy `4ai sync`/`4ai plugin`; dùng thẳng hai field đó sẽ đóng cứng tên NGƯỜI BUILD vào
// gói mà người khác cài — sai cho mọi installer không phải chính người đó. descriptionRaw/
// bodyRaw (gắn ở assets.mjs, trước khi thay token) mới là bản đúng để đóng gói: giữ token
// literal, runtime tự resolve theo qlda.local.json của TỪNG máy cài (xem qlda-metadata.mjs).
function pluginText(asset) {
  return {
    description: asset.descriptionRaw ?? asset.description,
    body: asset.bodyRaw ?? asset.body,
  };
}

function skillFile(asset) {
  const { description, body } = pluginText(asset);
  const fm = stringifyFrontmatter({
    name: asset.id,
    description,
  });
  const head = asset.severity === 'hard'
    ? `> **Rule cứng (severity: hard)** — vi phạm là sai, không phải lựa chọn.\n\n`
    : '';
  const scope = asset.globs?.length
    ? `> Phạm vi: \`${asset.globs.join('`, `')}\`\n\n`
    : '';
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${head}${scope}${body}${seeAlsoLine(asset)}`;
}

function agentFile(asset) {
  const { description, body } = pluginText(asset);
  const fm = stringifyFrontmatter({
    name: asset.id,
    description,
    tools: (asset.tools ?? []).join(', '),
    ...(asset.model && asset.model !== 'inherit' ? { model: asset.model } : {}),
  });
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${body}${seeAlsoLine(asset)}`;
}

function commandFile(asset) {
  const { description, body } = pluginText(asset);
  const fm = stringifyFrontmatter({
    description,
    ...(asset['argument-hint'] ? { 'argument-hint': asset['argument-hint'] } : {}),
  });
  return `${fm}\n${banner(asset)}\n\n${body}`;
}

/** Liệt kê file runtime cần chép, đường dẫn tương đối so với hub, thứ tự ổn định. */
function runtimeFiles() {
  const out = [];
  for (const dir of RUNTIME_DIRS) {
    const abs = path.join(HUB, dir);
    if (!fs.existsSync(abs)) continue;
    // node:fs.globSync không có `nodir` (đó là option của npm glob) — lọc thư mục bằng dirent.
    for (const d of fs.globSync('**/*', { cwd: abs, withFileTypes: true })) {
      if (!d.isFile()) continue;
      const sub = path.relative(abs, path.join(d.parentPath ?? d.path, d.name));
      const rel = `${dir}/${sub.replace(/\\/g, '/')}`;
      if (RUNTIME_EXCLUDE.test(rel)) continue;
      out.push(rel);
    }
  }
  return out.sort();
}

/**
 * @returns {{textFiles: [], jsonFiles: [], notes: []}}
 */
export function emitPlugin({ assets, mcpServers, target }) {
  const textFiles = [];
  const notes = [];

  // Doctrine và rule always không có chỗ đứng riêng trong plugin — thành skill hết.
  const asSkills = [...alwaysOnAssets(assets), ...onDemandAssets(assets)];

  for (const a of asSkills) {
    for (const e of emitPaths({ ...a, always: false, kind: a.kind === 'doctrine' ? 'skill' : a.kind }, 'plugin')) {
      if (e.mode !== 'file') continue;
      if (a.kind === 'agent') textFiles.push({ relPath: e.path, content: agentFile(a), sourceId: a.id, sourceVersion: a.version });
      else if (a.kind === 'command') textFiles.push({ relPath: e.path, content: commandFile(a), sourceId: a.id, sourceVersion: a.version });
      else textFiles.push({ relPath: e.path, content: skillFile(a), sourceId: a.id, sourceVersion: a.version });
    }
  }

  // Runtime chép nguyên văn. Đọc là input — writer vẫn là nơi duy nhất ghi.
  for (const rel of runtimeFiles()) {
    textFiles.push({ relPath: rel, content: fs.readFileSync(path.join(HUB, rel), 'utf8') });
  }

  // MCP: đường dẫn trỏ vào chính gói; index ghi ra ${CLAUDE_PLUGIN_DATA} để sống sót update.
  const mp = mcpPath('plugin');
  const serverIds = Object.keys(mcpServers);
  if (serverIds.length > 0) {
    const servers = {};
    for (const [id, srv] of Object.entries(mcpServers)) {
      servers[id] = {
        command: srv.command,
        args: (srv.args ?? []).map(pluginPath),
        cwd: '${CLAUDE_PLUGIN_ROOT}',
        env: { ...(srv.env ?? {}), FBO_DATA_ROOT: '${CLAUDE_PLUGIN_DATA}' },
      };
    }
    textFiles.push({ relPath: mp.path, content: stableStringify({ [mp.key]: servers }) });
  }

  textFiles.push({
    relPath: '.claude-plugin/plugin.json',
    content: stableStringify(manifest(target, asSkills)),
  });

  notes.push(`Plugin dựng tại ${target.path} — cài bằng \`/plugin marketplace add\` rồi \`/plugin install ${pluginName(target)}\`.`);

  return { textFiles, jsonFiles: [], notes };
}

/** {{HUB}} trong mcp/servers.json trỏ về gốc plugin khi chạy dưới dạng plugin. */
function pluginPath(v) {
  return typeof v === 'string' ? v.replaceAll('{{HUB}}', '${CLAUDE_PLUGIN_ROOT}').replace(/\\/g, '/') : v;
}

function pluginName(target) {
  return target.pluginName ?? '4ai';
}

function manifest(target, assets) {
  // Đếm theo file THỰC SỰ sinh ra, không theo kind gốc: doctrine và rule đều hạ thành skill.
  const n = (k) => assets.filter((a) => a.kind === k).length;
  const skills = assets.length - n('agent') - n('command');
  return {
    name: pluginName(target),
    description: target.pluginDescription
      ?? `Trợ lý FBO/FBI: ${skills} skill, ${n('agent')} agent, ${n('command')} command, kèm MCP tra cứu controller và SQL.`,
    version: target.pluginVersion ?? '0.1.0',
    author: { name: 'Fast Source' },
  };
}
