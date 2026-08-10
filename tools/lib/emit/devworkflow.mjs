// devworkflow.mjs — emitter cho DevWorkFlow IDE.
//
// DevWorkFlow HÔM NAY chưa đọc được gì (không có AiKitStore) — output này là
// hợp đồng trung lập, TRƠ cho tới khi IDE implement loader.
// Hợp đồng: docs/DEVWORKFLOW-CONTRACT.md.
//
//   DevWorkFlow.UI/Config/json/ai-kit.json   ← manifest (schemaVersion, assets[], mcp[])
//   DevWorkFlow.UI/Config/ai/<kind>/<id>.md  ← payload markdown thuần

import { emitPaths } from '../paths.mjs';
import { banner } from './common.mjs';
import { sha256 } from '../writer.mjs';
import { HUB } from '../assets.mjs';

// Vị trí trong SOURCE TREE của DevWorkFlow — build link Config/ sang Runtime/Config/.
const CONFIG_ROOT = 'DevWorkFlow.UI/Config';

function payloadFile(asset) {
  // Markdown thuần + header tự mô tả — DevWorkFlow render hoặc bơm vào prompt tuỳ nó.
  const meta = [
    `id: ${asset.id}`,
    `kind: ${asset.kind}`,
    `domain: ${asset.domain}`,
    ...(asset.severity ? [`severity: ${asset.severity}`] : []),
    `version: ${asset.version}`,
  ].map((l) => `> ${l}`).join('\n');
  return `${banner(asset)}\n\n# ${asset.title}\n\n${meta}\n\n${asset.body}`;
}

export function emitDevworkflow({ assets, mcpServers }) {
  const textFiles = [];
  const notes = [];
  const kitAssets = [];

  for (const a of assets) {
    const [e] = emitPaths(a, 'devworkflow'); // Config/ai/<kind>/<id>.md
    const relPath = `${CONFIG_ROOT}/${e.path.replace(/^Config\//, '')}`;
    const content = payloadFile(a);
    textFiles.push({ relPath, content, sourceId: a.id, sourceVersion: a.version });
    kitAssets.push({
      id: a.id,
      kind: a.kind,
      domain: a.domain,
      title: a.title,
      description: a.description,
      always: a.always === true,
      ...(a.severity ? { severity: a.severity } : {}),
      ...(a.globs?.length ? { globs: a.globs } : {}),
      ...(a.requires?.length ? { requires: a.requires } : {}),
      path: e.path.replace(/^Config\//, ''), // tương đối so với config root
      sha256: sha256(content.replace(/\r\n/g, '\n').replace(/\n*$/, '\n')),
      version: a.version,
    });
  }

  const kit = {
    schemaVersion: 1,
    generatedBy: '4AI',
    hubPath: HUB,
    payloadRoot: 'ai',
    domains: [...new Set(assets.map((a) => a.domain))].sort(),
    assets: kitAssets.sort((x, y) => (x.id < y.id ? -1 : 1)),
    mcp: Object.entries(mcpServers).map(([id, srv]) => ({
      id,
      transport: srv.transport ?? 'stdio',
      command: srv.command,
      args: srv.args ?? [],
      ...(srv.cwd ? { cwd: srv.cwd } : {}),
      ...(srv.env && Object.keys(srv.env).length ? { env: srv.env } : {}),
    })),
  };

  // ai-kit.json là file 4AI sở hữu trọn — emit như text để giữ banner-free strict JSON.
  const kitJson = JSON.stringify(kit, null, 2);
  textFiles.push({ relPath: `${CONFIG_ROOT}/json/ai-kit.json`, content: kitJson });

  notes.push('DevWorkFlow chưa có AiKitStore — ai-kit.json trơ cho tới khi loader được viết (docs/DEVWORKFLOW-CONTRACT.md). Trạng thái này là dự kiến, không phải lỗi.');

  return { textFiles, jsonFiles: [], notes };
}
