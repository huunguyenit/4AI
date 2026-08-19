// cursor-plugin.mjs — emitter cho Cursor Plugin (phương ngữ thứ sáu).
//
// Cùng triết lý với plugin.mjs (Claude Code): output KHÔNG phải cấu hình rắc vào workspace
// có sẵn, mà là artifact tự chứa để cài qua Cursor Marketplace (Team Marketplace import từ
// GitHub, hoặc public marketplace review thủ công). Khác plugin.mjs ở một điểm quan trọng:
// Cursor Plugin CÓ primitive rules/ auto-discover thật (schema xác nhận tại
// cursor.com/docs/reference/plugins), nên doctrine/rule không bị hạ xuống thành skill như
// bên Claude — chúng ra file `.mdc` thật, giống hệt cursor.mjs (project scope).
//
//   <plugin>/.cursor-plugin/plugin.json
//   <plugin>/rules/<id>.mdc            ← doctrine (00- prefix) + rule, alwaysApply theo isAlwaysOn
//   <plugin>/skills/<id>/SKILL.md      ← skill thật (name/description), references/ đi kèm
//   <plugin>/agents/<id>.md            ← subagent thật (name/description/model/readonly)
//   <plugin>/commands/<id>.md
//   <plugin>/mcp.json                  ← ${PLUGIN_ROOT} — KHÔNG dấu chấm đầu, khác Claude
//   <plugin>/{mcp,src,tools,data}/**   ← runtime chép nguyên văn
//
// `skills/` trong gói cũng auto-discover — mỗi thư mục con có `SKILL.md` là một skill
// (cursor.com/docs/reference/plugins). Trước đây 4AI gộp skill vào `.mdc` vì Cursor chưa có
// primitive Skill; nay dùng đúng nó ở CẢ hai nơi, nên người cài qua marketplace và người
// clone+sync vẫn thấy CÙNG một trải nghiệm.
//
// Biến đường dẫn built-in `${PLUGIN_ROOT}` đã xác nhận qua tài liệu Cursor (Agent Plugin MCP
// mẫu dùng `"cwd": "${PLUGIN_ROOT}"`). Biến kiểu ${CLAUDE_PLUGIN_DATA} (thư mục ghi được, sống
// sót qua update) KHÔNG có xác nhận tương đương phía Cursor — nên KHÔNG set FBO_DATA_ROOT ở
// đây: index SQLite sẽ ghi ngay trong thư mục cài, giống hành vi chạy dev từ hub. Nếu Cursor
// xác nhận có biến tương đương sau này, thêm vào đây và ghi lại nguồn.

import fs from 'node:fs';
import path from 'node:path';
import { emitPaths, mcpPath, isAlwaysOn } from '../paths.mjs';
import {
  banner, seeAlsoLine, isReadonlyAgent, runtimeFiles, bareCommand, forEmit, referenceFiles,
} from './common.mjs';
import { stringifyFrontmatter } from '../fm.mjs';
import { stableStringify } from '../json.mjs';
import { HUB } from '../assets.mjs';

// Cùng lý do pluginText() ở plugin.mjs: đây là artifact PHÂN PHỐI, phải giữ token
// {PMName}/{PMDept} literal — runtime tự resolve theo qlda.local.json của TỪNG máy cài.
function pluginText(asset) {
  return {
    description: asset.descriptionRaw ?? asset.description,
    body: asset.bodyRaw ?? asset.body,
  };
}

function mdcFile(asset) {
  const { description, body } = pluginText(asset);
  const fm = stringifyFrontmatter({
    description,
    ...(asset.globs?.length ? { globs: asset.globs } : {}),
    alwaysApply: isAlwaysOn(asset),
  });
  const head = asset.severity === 'hard'
    ? `> **Rule cứng (severity: hard)** — vi phạm là sai, không phải lựa chọn.\n\n`
    : '';
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${head}${body}${seeAlsoLine(asset)}`;
}

/** Skill thật của Cursor — `name` bắt buộc trùng tên thư mục cha, tức `id` của asset. */
function skillFile(asset) {
  const { description, body } = pluginText(asset);
  const fm = stringifyFrontmatter({
    name: asset.id,
    description,
    ...(asset.globs?.length ? { paths: asset.globs } : {}),
  });
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${body}${seeAlsoLine(asset)}`;
}

function agentFile(asset) {
  const { description, body } = pluginText(asset);
  const fm = stringifyFrontmatter({
    name: asset.id,
    description,
    model: asset.model,
    ...(isReadonlyAgent(asset) ? { readonly: true } : {}),
  });
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${body}${seeAlsoLine(asset)}`;
}

function commandFile(asset) {
  const { body } = pluginText(asset);
  return `${banner(asset)}\n\n# ${asset.title}\n\n${body}${seeAlsoLine(asset)}`;
}

/**
 * @returns {{textFiles: [], jsonFiles: [], notes: []}}
 */
export function emitCursorPlugin({ assets, mcpServers, target }) {
  const textFiles = [];
  const notes = [];

  for (const a of assets) {
    const x = forEmit(a, 'cursor-plugin');
    for (const e of emitPaths(x, 'cursor-plugin')) {
      if (e.mode !== 'file') continue;
      if (a.kind === 'agent') textFiles.push({ relPath: e.path, content: agentFile(x), sourceId: a.id, sourceVersion: a.version });
      else if (a.kind === 'command') textFiles.push({ relPath: e.path, content: commandFile(x), sourceId: a.id, sourceVersion: a.version });
      else if (a.kind === 'skill') textFiles.push({ relPath: e.path, content: skillFile(x), sourceId: a.id, sourceVersion: a.version });
      else textFiles.push({ relPath: e.path, content: mdcFile(x), sourceId: a.id, sourceVersion: a.version });
    }
    textFiles.push(...referenceFiles(x, 'cursor-plugin'));
  }

  // Runtime chép nguyên văn. Đọc là input — writer vẫn là nơi duy nhất ghi.
  for (const rel of runtimeFiles()) {
    textFiles.push({ relPath: rel, content: fs.readFileSync(path.join(HUB, rel), 'utf8') });
  }

  const mp = mcpPath('cursor-plugin');
  const serverIds = Object.keys(mcpServers);
  if (serverIds.length > 0) {
    const servers = {};
    for (const [id, srv] of Object.entries(mcpServers)) {
      servers[id] = {
        // Cùng lý do plugin.mjs: đường dẫn node.exe tuyệt đối chỉ đúng trên máy build.
        command: bareCommand(srv.command),
        args: (srv.args ?? []).map(pluginRootPath),
        cwd: '${PLUGIN_ROOT}',
        ...(srv.env && Object.keys(srv.env).length ? { env: srv.env } : {}),
      };
    }
    textFiles.push({ relPath: mp.path, content: stableStringify({ [mp.key]: servers }) });
  }

  textFiles.push({
    relPath: '.cursor-plugin/plugin.json',
    content: stableStringify(manifest(target, assets)),
  });

  notes.push(`Cursor plugin dựng tại ${target.path} — publish qua Team Marketplace (Dashboard → Plugins → Add Marketplace → Import from Repo) hoặc cursor.com/marketplace/publish.`);

  return { textFiles, jsonFiles: [], notes };
}

/** {{HUB}} trong mcp/servers.json trỏ về gốc plugin khi chạy dưới dạng Cursor plugin. */
function pluginRootPath(v) {
  return typeof v === 'string' ? v.replaceAll('{{HUB}}', '${PLUGIN_ROOT}').replace(/\\/g, '/') : v;
}

function pluginName(target) {
  return target.pluginName ?? '4ai';
}

function manifest(target, assets) {
  const n = (k) => assets.filter((a) => a.kind === k).length;
  const rules = assets.length - n('agent') - n('command');
  return {
    name: pluginName(target),
    description: target.pluginDescription
      ?? `Trợ lý FBO/FBI: ${rules} rule, ${n('agent')} agent, ${n('command')} command, kèm MCP tra cứu controller và SQL.`,
    version: target.pluginVersion ?? '0.1.0',
    author: { name: 'Fast Source' },
  };
}
