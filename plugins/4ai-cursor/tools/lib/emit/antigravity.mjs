// antigravity.mjs — emitter cho Google Antigravity IDE.
//
// Antigravity đang public preview — mapping dưới đây dựng từ tài liệu công khai
// (antigravity.google/docs), CHƯA verify trên một workspace Antigravity thật.
// Điểm rủi ro nhất: tên field kích hoạt rule (`trigger`) và giá trị của nó suy
// theo định dạng rule của Windsurf (đội ngũ tiền thân, cùng convention
// always_on/glob/model_decision/manual) — Antigravity có thể đặt tên khác.
// Verify lại rồi xoá ghi chú này.
//
//   .agents/rules/<id>.md            doctrine + rule, frontmatter trigger/globs
//   .agents/skills/<id>/SKILL.md     skill
//   .agents/agents/<id>.md           agent
//   .agents/workflows/<id>.md        command → slash workflow /<id>
//   .agents/mcp_config.json          key `mcpServers`, cùng shape Cursor (không cần `type`)

import { emitPaths, mcpPath, isAlwaysOn } from '../paths.mjs';
import { banner, seeAlsoLine } from './common.mjs';
import { stringifyFrontmatter } from '../fm.mjs';

const MODEL_TIER = { inherit: 'inherit', haiku: 'flash', sonnet: 'pro', opus: 'pro' };

function ruleFile(asset) {
  const trigger = isAlwaysOn(asset) ? 'always_on' : asset.globs?.length ? 'glob' : 'model_decision';
  const fm = stringifyFrontmatter({
    description: asset.description,
    trigger,
    ...(trigger === 'glob' ? { globs: asset.globs } : {}),
  });
  const head = asset.severity === 'hard'
    ? `> **Rule cứng (severity: hard)** — vi phạm là sai, không phải lựa chọn.\n\n`
    : '';
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${head}${asset.body}${seeAlsoLine(asset)}`;
}

function skillFile(asset) {
  const fm = stringifyFrontmatter({ name: asset.id, description: asset.description });
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${asset.body}${seeAlsoLine(asset)}`;
}

function agentFile(asset) {
  const fm = stringifyFrontmatter({
    name: asset.id,
    description: asset.description,
    ...(asset.tools?.length ? { tools: asset.tools } : {}),
    model: MODEL_TIER[asset.model] ?? 'inherit',
  });
  return `${fm}\n${banner(asset)}\n\n# ${asset.title}\n\n${asset.body}${seeAlsoLine(asset)}`;
}

function workflowFile(asset) {
  const fm = stringifyFrontmatter({ description: asset.description });
  return `${fm}\n${banner(asset)}\n\n${asset.body}`;
}

export function emitAntigravity({ assets, mcpServers }) {
  const textFiles = [];
  const jsonFiles = [];
  const notes = ['Antigravity: mapping rule trigger/globs suy từ tài liệu Windsurf-kế-thừa, chưa xác nhận trên IDE thật — kiểm tra lại trước khi tin cậy.'];

  for (const a of assets) {
    for (const e of emitPaths(a, 'antigravity')) {
      if (a.kind === 'agent') textFiles.push({ relPath: e.path, content: agentFile(a), sourceId: a.id, sourceVersion: a.version });
      else if (a.kind === 'command') textFiles.push({ relPath: e.path, content: workflowFile(a), sourceId: a.id, sourceVersion: a.version });
      else if (a.kind === 'skill') textFiles.push({ relPath: e.path, content: skillFile(a), sourceId: a.id, sourceVersion: a.version });
      else textFiles.push({ relPath: e.path, content: ruleFile(a), sourceId: a.id, sourceVersion: a.version });
    }
  }

  const mp = mcpPath('antigravity');
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
