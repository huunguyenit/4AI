#!/usr/bin/env node
// 4ai.mjs — CLI của hub 4AI. Zero dependency; chạy bằng `node tools/4ai.mjs <lệnh>`.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { HUB, loadAssets, readJson, resolveMcpServers, scanSecrets } from './lib/assets.mjs';
import { skeleton, KINDS } from './lib/schema.mjs';
import { stringifyFrontmatter } from './lib/fm.mjs';
import { emitPaths, isAlwaysOn, mcpPath } from './lib/paths.mjs';

const USAGE = `4AI — hub trợ lý AI cho FBO. Cách dùng:

  node tools/4ai.mjs check              validate hub. Exit 0/1. Không bao giờ ghi
  node tools/4ai.mjs list               bảng asset [--kind K] [--domain D] [--json]
  node tools/4ai.mjs explain <id>       asset này emit ra đường dẫn nào, theo từng tool
  node tools/4ai.mjs new <kind> <id>    in skeleton asset ra stdout [--domain D]
  node tools/4ai.mjs targets            liệt kê target: path, tools, reachable
  node tools/4ai.mjs sync               chiếu asset + MCP vào các target đang bật
                                        [--dry-run] [--target T] [--tool X] [--force]
  node tools/4ai.mjs graph check        validate đồ thị JSONL. Không bao giờ ghi
  node tools/4ai.mjs graph build        sinh script nạp .4ai/graph/*.sql [--dry-run]
  node tools/4ai.mjs report <payload>   dựng báo cáo rà soát HTML vào ledger/ [--dry-run]
                                        payload có "kind":"portfolio" -> tổng quan nhiều dự án
                                        payload có "kind":"performance" -> hiệu suất theo phòng ban
`;

function fail(msg) {
  process.stderr.write(`4ai: ${msg}\n`);
  process.exit(1);
}

function loadConfig() {
  const targetsCfg = readJson(path.join(HUB, 'targets.json'), { version: 1, domains: null, targets: [] });
  const localTargets = readJson(path.join(HUB, 'targets.local.json'), { targets: [] });
  // Merge local overrides vào targets config
  if (localTargets.targets?.length) {
    const localByName = new Map(localTargets.targets.map((t) => [t.name, t]));
    targetsCfg.targets = targetsCfg.targets.map((t) => ({ ...t, ...localByName.get(t.name) }));
  }
  const mcpCfg = readJson(path.join(HUB, 'mcp', 'servers.json'), { version: 1, servers: {} });
  mcpCfg.servers = resolveMcpServers(mcpCfg.servers);
  return { targetsCfg, mcpCfg };
}

function loadHub() {
  const { targetsCfg, mcpCfg } = loadConfig();
  const loaded = loadAssets({
    domains: targetsCfg.domains ?? null,
    mcpServerIds: Object.keys(mcpCfg.servers),
  });
  return { ...loaded, targetsCfg, mcpCfg };
}

// ---------------------------------------------------------------- check

function cmdCheck(opts) {
  const { assets, errors, warnings, targetsCfg, mcpCfg } = loadHub();
  errors.push(...scanSecrets({}).map((h) => ({ file: h.file, line: h.line, message: h.message })));

  // MCP server: command và mọi arg là đường dẫn phải tồn tại thật.
  for (const [id, srv] of Object.entries(mcpCfg.servers)) {
    if (!fs.existsSync(srv.command)) {
      errors.push({ file: 'mcp/servers.json', line: 0,
        message: `server \`${id}\`: command không tồn tại: ${srv.command}` });
    }
    for (const a of srv.args ?? []) {
      if (/[\\/]/.test(a) && /\.(mjs|js|exe|cmd|py)$/i.test(a) && !fs.existsSync(a)) {
        errors.push({ file: 'mcp/servers.json', line: 0,
          message: `server \`${id}\`: arg trỏ tới file không tồn tại: ${a}` });
      }
    }
    if (srv.cwd && !fs.existsSync(srv.cwd)) {
      errors.push({ file: 'mcp/servers.json', line: 0,
        message: `server \`${id}\`: cwd không tồn tại: ${srv.cwd}` });
    }
    for (const [k, v] of Object.entries(srv.env ?? {})) {
      if (/PATH$/i.test(k) && !fs.existsSync(v)) {
        warnings.push({ file: 'mcp/servers.json', line: 0,
          message: `server \`${id}\`: env ${k} trỏ tới đường dẫn không tồn tại: ${v}` });
      }
    }
  }

  // Reachability của target đang bật.
  for (const t of targetsCfg.targets) {
    if (t.enabled && !fs.existsSync(t.path)) {
      errors.push({ file: 'targets.json', line: 0,
        message: `target \`${t.name}\` đang bật nhưng path không tồn tại: ${t.path}` });
    }
  }

  const counts = {};
  for (const a of assets) counts[a.kind] = (counts[a.kind] ?? 0) + 1;
  const summary = [
    `${assets.length} assets`,
    ...KINDS.filter((k) => counts[k]).map((k) => `${counts[k]} ${k}`),
    `${Object.keys(mcpCfg.servers).length} mcp server`,
    `${errors.length} errors`,
    `${warnings.length} warnings`,
  ].join(' · ');

  if (opts.json) {
    process.stdout.write(JSON.stringify({ summary, errors, warnings }, null, 2) + '\n');
  } else {
    for (const e of errors) process.stdout.write(`ERROR ${e.file}:${e.line} — ${e.message}\n`);
    for (const w of warnings) process.stdout.write(`WARN  ${w.file}:${w.line} — ${w.message}\n`);
    process.stdout.write(summary + '\n');
  }
  process.exit(errors.length > 0 ? 1 : 0);
}

// ---------------------------------------------------------------- list

function cmdList(opts) {
  const { assets, errors } = loadHub();
  if (errors.length > 0) {
    process.stderr.write(`4ai: hub có ${errors.length} lỗi — chạy \`check\` để xem chi tiết. Bảng dưới chỉ gồm asset parse được.\n`);
  }
  let rows = assets;
  if (opts.kind) rows = rows.filter((a) => a.kind === opts.kind);
  if (opts.domain) rows = rows.filter((a) => a.domain === opts.domain);
  rows = rows.slice().sort((a, b) =>
    a.domain === b.domain
      ? (a.kind === b.kind ? (a.id < b.id ? -1 : 1) : (a.kind < b.kind ? -1 : 1))
      : (a.domain < b.domain ? -1 : 1));

  if (opts.json) {
    process.stdout.write(JSON.stringify(rows.map(({ id, kind, domain, version, targets, description, always, severity }) =>
      ({ id, kind, domain, version, targets, description, always, severity })), null, 2) + '\n');
    return;
  }
  const w1 = Math.max(4, ...rows.map((a) => a.id.length));
  const w2 = 8, w3 = Math.max(6, ...rows.map((a) => a.domain.length));
  for (const a of rows) {
    const flags = [a.always ? 'always' : null, a.severity ?? null].filter(Boolean).join(',');
    process.stdout.write(
      `${a.id.padEnd(w1)}  ${a.kind.padEnd(w2)}  ${a.domain.padEnd(w3)}  v${a.version}  ${(flags || '-').padEnd(11)}  ${a.description}\n`);
  }
  process.stdout.write(`— ${rows.length} asset\n`);
}

// ---------------------------------------------------------------- explain

function cmdExplain(id, opts) {
  const { byId, targetsCfg } = loadHub();
  const asset = byId.get(id);
  if (!asset) fail(`không có asset \`${id}\` — chạy \`list\` để xem danh sách`);

  const info = {
    id: asset.id, title: asset.title, kind: asset.kind, domain: asset.domain,
    description: asset.description, version: asset.version, targets: asset.targets,
    always: asset.always, globs: asset.globs, severity: asset.severity,
    tools: asset.tools, model: asset.model, requires: asset.requires,
    source: asset.rel,
    emits: {},
  };
  for (const tool of asset.targets) {
    info.emits[tool] = emitPaths(asset, tool).map((e) =>
      e.mode === 'inline' ? `${e.path} (gộp chung)` : e.path);
  }
  // Target nào thực sự sẽ nhận nó.
  info.syncedTo = targetsCfg.targets
    .filter((t) => t.enabled && !t.role && t.domains.includes(asset.domain)
      && t.tools.some((tool) => asset.targets.includes(tool)))
    .map((t) => t.name);

  if (opts.json) { process.stdout.write(JSON.stringify(info, null, 2) + '\n'); return; }
  process.stdout.write(`${asset.rel} (v${asset.version})\n`);
  process.stdout.write(`  ${asset.kind} · ${asset.domain} · ${isAlwaysOn(asset) ? 'luôn nạp' : 'nạp theo yêu cầu'}${asset.severity ? ` · ${asset.severity}` : ''}\n`);
  process.stdout.write(`  ${asset.description}\n`);
  for (const [tool, paths] of Object.entries(info.emits)) {
    process.stdout.write(`  ${tool.padEnd(12)} ${paths.join(', ')}\n`);
  }
  process.stdout.write(`  sync tới: ${info.syncedTo.join(', ') || '(chưa có target nào bật)'}\n`);
}

// ---------------------------------------------------------------- new

function cmdNew(kind, id, opts) {
  if (!KINDS.includes(kind)) fail(`kind phải là một trong: ${KINDS.join(' | ')}`);
  if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail('id phải là kebab-case, ví dụ: fbo-check-options');
  const domain = opts.domain ?? (id.startsWith('fbo-') ? 'fbo-xml' : id.startsWith('pm-') ? 'project-mgmt' : 'core');
  const fm = skeleton(kind, id, domain);
  const folder = kind === 'doctrine' ? 'assets/doctrine' : `assets/${kind}s/${domain}`;
  process.stdout.write(`# Lưu vào: ${folder}/${id}.md\n`);
  process.stdout.write(stringifyFrontmatter(fm) + '\n');
  process.stdout.write(`
## Vì sao

<2-4 câu: nếu thiếu asset này thì hỏng cái gì.>

## Quy tắc

- <bullet mệnh lệnh; dùng BẮT BUỘC / KHÔNG ĐƯỢC khi severity: hard>

## Ví dụ

<path thật, mã controller thật, query thật — không lorem ipsum.>

## Bẫy

- <cái bẫy tốn một giờ của người đi trước>
`);
}

// ---------------------------------------------------------------- targets

function cmdTargets(opts) {
  const { targetsCfg } = loadConfig();
  const rows = targetsCfg.targets.map((t) => ({
    name: t.name,
    path: t.path,
    enabled: !!t.enabled,
    role: t.role ?? 'sync',
    tools: t.tools,
    domains: t.domains,
    reachable: fs.existsSync(t.path),
    lastSync: (() => {
      const mf = path.join(t.path, '.4ai', 'manifest.json');
      try { return readJson(mf).syncedAt ?? null; } catch { return null; }
    })(),
  }));
  if (opts.json) { process.stdout.write(JSON.stringify(rows, null, 2) + '\n'); return; }
  for (const r of rows) {
    const state = r.enabled ? 'BẬT ' : 'tắt ';
    const reach = r.reachable ? '' : '  [KHÔNG TỚI ĐƯỢC]';
    process.stdout.write(`${state} ${r.name.padEnd(16)} ${r.role.padEnd(16)} ${r.path}${reach}\n`);
    process.stdout.write(`     tools: ${r.tools.join(', ') || '-'} · domains: ${r.domains.join(', ') || '-'} · sync cuối: ${r.lastSync ?? 'chưa'}\n`);
  }
}

// ---------------------------------------------------------------- graph

async function cmdGraph(sub, opts) {
  if (sub && !['build', 'check'].includes(sub)) fail(`graph: lệnh con không rõ: ${sub} (build | check)`);
  const { buildGraphArtifact } = await import('./lib/graph.mjs');
  const { writeArtifacts } = await import('./lib/writer.mjs');

  const { artifact, errors, stats } = buildGraphArtifact(HUB);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ stats, errors, output: artifact?.relPath ?? null }, null, 2) + '\n');
    process.exit(errors.length ? 1 : 0);
  }

  const kinds = Object.entries(stats.byKind).map(([k, c]) => `${k}:${c}`).join(' ');
  const types = Object.entries(stats.byEdgeType).map(([t, c]) => `${t}:${c}`).join(' ');
  process.stdout.write(`${stats.nodes} node · ${stats.edges} cạnh\n`);
  if (kinds) process.stdout.write(`  node: ${kinds}\n`);
  if (types) process.stdout.write(`  cạnh: ${types}\n`);

  if (errors.length) {
    for (const e of errors) {
      process.stderr.write(`  ${e.file}:${e.line}  ${e.message}\n`);
    }
    process.stderr.write(`4ai: ${errors.length} lỗi — không sinh script.\n`);
    process.exit(1);
  }

  if (sub === 'check') { process.stdout.write('graph hợp lệ. (check không bao giờ ghi)\n'); process.exit(0); }

  const plan = writeArtifacts({ destRoot: HUB, files: [artifact], dryRun: opts.dryRun });
  for (const p of plan) {
    const verb = opts.dryRun ? `${p.action} (dry-run)` : p.action;
    process.stdout.write(`  ${verb.padEnd(20)} ${p.relPath}  ${p.bytes} byte\n`);
  }
  process.stdout.write('Nạp bằng sqlcmd hoặc query_sql — CHỈ sau khi PM xác nhận.\n');
}

// ---------------------------------------------------------------- report

async function cmdReport(payloadPath, opts) {
  if (!fs.existsSync(payloadPath)) fail(`không tìm thấy payload: ${payloadPath}`);
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  } catch (e) {
    fail(`payload không parse được: ${e.message}`);
  }
  const { buildReportArtifact, buildPortfolioArtifact } = await import('./lib/report.mjs');
  const { writeArtifacts } = await import('./lib/writer.mjs');

  let artifact, errors;
  if (payload?.kind === 'performance') {
    const { buildPerformanceReportArtifact } = await import('./lib/report-performance.mjs');
    ({ artifact, errors } = buildPerformanceReportArtifact(payload));
  } else {
    const build = payload?.kind === 'portfolio' ? buildPortfolioArtifact : buildReportArtifact;
    ({ artifact, errors } = build(payload, HUB));
  }
  if (errors.length) {
    for (const e of errors) process.stderr.write(`  ${e}\n`);
    fail(`payload thiếu ${errors.length} chỗ — không dựng báo cáo.`);
  }
  const plan = writeArtifacts({ destRoot: HUB, files: [artifact], dryRun: opts.dryRun });
  for (const p of plan) {
    const verb = opts.dryRun ? `${p.action} (dry-run)` : p.action;
    process.stdout.write(`  ${verb.padEnd(20)} ${p.relPath}  ${p.bytes} byte\n`);
  }
}

// ---------------------------------------------------------------- sync

async function cmdSync(opts) {
  const { runSync } = await import('./lib/sync.mjs');
  const code = await runSync(opts);
  process.exit(code);
}

// ---------------------------------------------------------------- main

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'dry-run': { type: 'boolean', default: false },
    target: { type: 'string', multiple: true },
    tool: { type: 'string', multiple: true },
    dest: { type: 'string' },
    force: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
    kind: { type: 'string' },
    domain: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

const [cmd, ...rest] = positionals;

if (values.help || !cmd) {
  process.stdout.write(USAGE);
  process.exit(cmd ? 0 : 1);
}

switch (cmd) {
  case 'check':
  case 'doctor':
    cmdCheck(values); break;
  case 'list':
    cmdList(values); break;
  case 'explain':
    if (!rest[0]) fail('cách dùng: explain <id>');
    cmdExplain(rest[0], values); break;
  case 'new':
    if (rest.length < 2) fail('cách dùng: new <kind> <id> [--domain D]');
    cmdNew(rest[0], rest[1], values); break;
  case 'targets':
    cmdTargets(values); break;
  case 'graph':
    await cmdGraph(rest[0] ?? 'build', { ...values, dryRun: values['dry-run'] }); break;
  case 'report':
    if (!rest[0]) fail('cách dùng: report <payload.json> [--dry-run]');
    await cmdReport(rest[0], { ...values, dryRun: values['dry-run'] }); break;
  case 'sync':
    await cmdSync({ ...values, dryRun: values['dry-run'] }); break;
  default:
    fail(`lệnh không rõ: ${cmd}\n${USAGE}`);
}
