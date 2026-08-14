#!/usr/bin/env node
// 4ai.mjs — CLI của hub 4AI. Zero dependency; chạy bằng `node tools/4ai.mjs <lệnh>`.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { HUB, loadAssets, readJson, resolveMcpServers, scanSecrets, ledgerRoot } from './lib/assets.mjs';
import { skeleton, KINDS } from './lib/schema.mjs';
import { stringifyFrontmatter } from './lib/fm.mjs';
import { emitPaths, isAlwaysOn, mcpPath } from './lib/paths.mjs';
import { auditLedger } from './lib/ledger-audit.mjs';

const USAGE = `4AI — hub trợ lý AI cho FBO. Cách dùng:

  node tools/4ai.mjs setup              khai danh tính PM + chuỗi kết nối vào qlda.local.json
                                        (gõ trong terminal của bạn — giá trị KHÔNG đi qua model AI)
  node tools/4ai.mjs doctor             chẩn đoán: hub + sqlcmd + PM + nguồn kết nối. Không ghi
  node tools/4ai.mjs check              validate hub. Exit 0/1. Không bao giờ ghi
  node tools/4ai.mjs list               bảng asset [--kind K] [--domain D] [--json]
  node tools/4ai.mjs explain <id>       asset này emit ra đường dẫn nào, theo từng tool
  node tools/4ai.mjs new <kind> <id>    in skeleton asset ra stdout [--domain D]
  node tools/4ai.mjs targets            liệt kê target: path, tools, reachable
  node tools/4ai.mjs sync               chiếu asset + MCP vào các target đang bật
                                        [--dry-run] [--target T] [--tool X] [--force]
  node tools/4ai.mjs graph check        validate đồ thị. Không bao giờ ghi
  node tools/4ai.mjs graph build        sinh script nạp .4ai/graph/*.sql [--dry-run]
  node tools/4ai.mjs graph push         sinh RỒI nạp thẳng vào DB đồ thị [--dry-run]
  node tools/4ai.mjs graph experience   quét UR đã xong (HT/DT/OK/UP) → kinh nghiệm hiện vật
  node tools/4ai.mjs report             lấy dataset UR cố định, dựng HTML rà soát vào ledger [--dry-run]
                                        [--project MA_DA] chỉ một dự án
                                        [--dept BP] toàn bộ phận (nbphyc.bp_lt, ví dụ FSD)
                                        bỏ trống cả hai = toàn bộ LTQL của PM máy này
  node tools/4ai.mjs report <payload>   (tương thích) payload tay: portfolio / performance / kpi
                                        (mcpDataRoot từ %USERPROFILE%\.cursor\fbo-local.json, lùi về <hub>/ledger nếu chưa có)
  node tools/4ai.mjs serve [path]       mở report qua http://127.0.0.1:<port>, tự mở trình duyệt
                                        [--port N] [--no-open] — Ctrl+C để tắt
                                        path bỏ trống -> tự tìm report mới nhất trong ledger
                                        /review -> trang tổng ngày gần nhất; /review/<MA_DA> -> report dự án đó ngày gần nhất
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

/**
 * `doctor` = `check` (hub có hợp lệ không) + chẩn đoán RUNTIME (máy này chạy được chưa).
 *
 * Tách khỏi `check` vì hai câu hỏi khác nhau: `check` là bài test của compiler, phải sạch trên
 * MỌI máy kể cả máy chưa cấu hình gì; còn thiếu sqlcmd hay chưa khai PM là chuyện riêng của
 * từng máy, không phải lỗi của hub. Cả hai đều KHÔNG BAO GIỜ ghi.
 */
async function cmdDoctor(opts) {
  const { chanDoan, inChanDoan } = await import('./lib/setup.mjs');
  const maHub = cmdCheck(opts, { exit: false });
  const maRuntime = inChanDoan(chanDoan(HUB));
  process.exit(maHub || maRuntime);
}

async function cmdSetup() {
  const { chaySetup } = await import('./lib/setup.mjs');
  process.exit(await chaySetup(HUB));
}

function cmdCheck(opts, { exit = true } = {}) {
  const { assets, errors, warnings, targetsCfg, mcpCfg } = loadHub();
  errors.push(...scanSecrets({}).map((h) => ({ file: h.file, line: h.line, message: h.message })));

  // Audit cơ khí ledger/: entry Xong ↔ CHANGELOG, biên bản handover đủ mục (backstop
  // của agent pm-release-auditor cho phần không cần phán đoán ngữ nghĩa).
  const ledgerAudit = auditLedger({ hub: HUB });
  errors.push(...ledgerAudit.errors);
  warnings.push(...ledgerAudit.warnings);

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
  // `doctor` gọi lại hàm này rồi in tiếp phần runtime — nó tự quyết định mã thoát, nên ở đây
  // chỉ trả về. Gọi trực tiếp (`check`) thì vẫn thoát ngay như cũ: exit 0/1 là hợp đồng của nó.
  if (!exit) return errors.length > 0 ? 1 : 0;
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

/**
 * `graph experience` — quét UR ĐÃ XONG, rút kinh nghiệm ở mức hiện vật, đẩy vào đồ thị.
 *
 * Không gộp vào `report` được: báo cáo chỉ đọc UR ở DD/XN/TH còn kinh nghiệm lấy từ
 * HT/DT/OK/UP — hai tập rời nhau. Xem experience-build.mjs.
 */
async function cmdGraphExperience(opts) {
  const { buildKinhNghiem } = await import('./lib/experience-build.mjs');
  const { loadSchema, graphTuObject, validateGraph, emitSql } = await import('./lib/graph.mjs');
  const { writeArtifacts } = await import('./lib/writer.mjs');
  const { pmIdentity } = await import('./lib/assets.mjs');

  const pm = pmIdentity(HUB);
  let ket;
  try {
    ket = buildKinhNghiem(HUB, {
      boPhan: opts.dept || pm.boPhanLt, maDa: opts.project, boi: pm.maNv, maxRows: opts.maxRows,
    });
  } catch (e) {
    fail(e.message);
  }

  process.stdout.write(`${ket.thongKe.duAn}/${ket.tongDuAnTimThay} dự án nạp được · `
    + `${ket.thongKe.soUr} UR đã xong · ${ket.thongKe.soFact} kinh nghiệm\n`);
  const raDuoc = ket.thongKe.soUr - ket.thongKe.urKhongRaHienVat;
  if (ket.thongKe.soUr) {
    process.stdout.write(`  rút được hiện vật: ${raDuoc}/${ket.thongKe.soUr} UR `
      + `(${(raDuoc / ket.thongKe.soUr * 100).toFixed(1)}%) · `
      + `menu_id phân giải được: ${ket.thongKe.menuIdPhanGiaiDuoc}\n`);
  }
  for (const b of ket.boQua) process.stderr.write(`  bỏ qua: ${b}\n`);
  if (!ket.nodes.length) { process.stdout.write('Không có gì để nạp.\n'); return; }

  const schema = loadSchema(HUB);
  const g = graphTuObject(schema, ket);
  const loi = [...g.errors, ...validateGraph(schema, g)];
  if (loi.length) {
    for (const e of loi.slice(0, 10)) process.stderr.write(`  ${e.message}\n`);
    fail(`${loi.length} lỗi đồ thị — không nạp.`);
  }

  const rel = path.join('.4ai', 'graph', 'experience.sql');
  writeArtifacts({ destRoot: HUB, files: [{ relPath: rel, content: emitSql(schema, g, { scopes: ket.scopes }) }] });
  if (opts.dryRun) {
    process.stdout.write(`DRY RUN — chưa nạp. Script ở ${rel}\n`);
    return;
  }
  const { runGraphScript } = await import('../mcp/fbo/lib/sql.mjs');
  try {
    const r = runGraphScript({ scriptPath: path.join(HUB, rel) });
    process.stdout.write(`Đã nạp vào ${r.database} — scope ${ket.scopes.join(', ')}\n`);
  } catch (e) {
    fail(e.message);
  }
}

async function cmdGraph(sub, opts) {
  if (sub === 'experience') return cmdGraphExperience(opts);
  if (sub && !['build', 'check', 'push'].includes(sub)) {
    fail(`graph: lệnh con không rõ: ${sub} (build | check | push | experience)`);
  }
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

  if (sub !== 'push') {
    process.stdout.write('Nạp vào DB bằng `node tools/4ai.mjs graph push`.\n');
    return;
  }

  // push: build xong thì nạp luôn. Script là upsert theo scope nên chạy lại vô hại —
  // nhưng vẫn là thao tác GHI lên DB dùng chung, nên --dry-run phải dừng ở đây.
  const scriptPath = path.join(HUB, artifact.relPath);
  if (opts.dryRun) {
    process.stdout.write(`DRY RUN — chưa nạp. Script đã sẵn ở ${artifact.relPath}\n`);
    return;
  }
  const { runGraphScript } = await import('../mcp/fbo/lib/sql.mjs');
  let ketQua;
  try {
    ketQua = runGraphScript({ scriptPath });
  } catch (e) {
    fail(e.message);
  }
  process.stdout.write(`Đã nạp vào ${ketQua.database}.\n`);
  const out = ketQua.output.trim();
  if (out) process.stdout.write(`${out.split('\n').slice(-5).join('\n')}\n`);
}

// ---------------------------------------------------------------- report

function writeReportPlan(plan, dryRun) {
  for (const p of plan) {
    const verb = dryRun ? `${p.action} (dry-run)` : p.action;
    process.stdout.write(`  ${verb.padEnd(20)} ${p.relPath}  ${p.bytes} byte\n`);
  }
}

/**
 * Sinh HTML từ dataset cố định — không nhận SQL/payload từ agent.
 * Phần dựng nằm ở `lib/review-report.mjs` vì tool MCP `render_review_report` gọi cùng
 * function đó: hai đường vào, một cách dựng, không có bản báo cáo thứ hai để lệch.
 */
async function cmdReportFromDataset(opts) {
  const { buildReviewReportFiles } = await import('./lib/review-report.mjs');
  const { writeArtifacts } = await import('./lib/writer.mjs');

  let built;
  try {
    built = buildReviewReportFiles(HUB, { project: opts.project, pmDept: opts.dept });
  } catch (e) {
    fail(e.message);
  }

  for (const b of built.boQua) {
    const nhan = b.ma_da ? `bỏ ${b.ma_da}` : 'portfolio';
    for (const e of b.errors) process.stderr.write(`  ${nhan}: ${e}\n`);
  }
  for (const c of built.canhBao) process.stderr.write(`  cảnh báo: ${c}\n`);

  const plan = writeArtifacts({ destRoot: ledgerRoot(HUB), files: built.files, dryRun: opts.dryRun });
  writeReportPlan(plan, opts.dryRun);
  await dayDoThi(built.doThi, opts);
}

/**
 * Đẩy tầng dự án của lần chạy này lên đồ thị.
 *
 * Đây là thứ làm cho quản lý C mở báo cáo N1-N6 thấy ngay phần user A (N1-N3) và user B
 * (N4-N6) đã tổng kết: mỗi lần chạy tự nộp phần của mình, `scope` = mã dự án nên không ai
 * ghi đè phạm vi của ai.
 *
 * KHÔNG được làm hỏng báo cáo. Chưa khai kết nối, hay DB chết, thì báo một dòng rồi thôi —
 * báo cáo HTML mới là thứ PM cần sáng nay, đồ thị là phần cộng thêm.
 */
async function dayDoThi(doThi, opts) {
  if (!doThi?.nodes?.length) return;
  if (opts.dryRun) {
    process.stdout.write(`  đồ thị (dry-run)     ${doThi.nodes.length} node · ${doThi.edges.length} cạnh · scope ${doThi.scopes.join(', ')}\n`);
    return;
  }
  try {
    const { loadSchema, graphTuObject, validateGraph, emitSql } = await import('./lib/graph.mjs');
    const { runGraphScript } = await import('../mcp/fbo/lib/sql.mjs');
    const { writeArtifacts } = await import('./lib/writer.mjs');

    const schema = loadSchema(HUB);
    const g = graphTuObject(schema, doThi);
    // `Status` là lookup tĩnh đã nạp sẵn trong DB từ hạt giống — cạnh HAS_STATUS trỏ ra ngoài
    // lô là đúng thiết kế, không phải cạnh treo. Không khai kind nào khác: mọi tham chiếu
    // còn lại vẫn phải nằm trong chính lô này.
    const loi = [...g.errors, ...validateGraph(schema, g, { kindNgoai: ['Status'] })];
    if (loi.length) {
      process.stderr.write(`  đồ thị: bỏ qua, ${loi.length} lỗi — ${loi[0].message}\n`);
      return;
    }
    // Script đi qua writer như mọi artifact khác, rồi mới nạp — có file để soi khi cần dò lỗi.
    const rel = path.join('.4ai', 'graph', 'review-sync.sql');
    writeArtifacts({ destRoot: HUB, files: [{ relPath: rel, content: emitSql(schema, g, { scopes: doThi.scopes }) }] });
    runGraphScript({ scriptPath: path.join(HUB, rel) });
    process.stdout.write(`  đồ thị               ${g.nodes.size} node · ${g.edges.length} cạnh · scope ${doThi.scopes.join(', ')}\n`);
  } catch (e) {
    process.stderr.write(`  đồ thị: không đẩy được — ${e.message.split('\n')[0]}\n`);
  }
}

async function cmdReport(payloadPath, opts) {
  if (!payloadPath) {
    await cmdReportFromDataset(opts);
    return;
  }
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
  } else if (payload?.kind === 'kpi') {
    const { buildKpiReportArtifact } = await import('./lib/report-kpi.mjs');
    ({ artifact, errors } = buildKpiReportArtifact(payload));
  } else {
    const build = payload?.kind === 'portfolio' ? buildPortfolioArtifact : buildReportArtifact;
    ({ artifact, errors } = build(payload, HUB));
  }
  if (errors.length) {
    for (const e of errors) process.stderr.write(`  ${e}\n`);
    fail(`payload thiếu ${errors.length} chỗ — không dựng báo cáo.`);
  }
  const plan = writeArtifacts({ destRoot: ledgerRoot(HUB), files: [artifact], dryRun: opts.dryRun });
  writeReportPlan(plan, opts.dryRun);
}

// ---------------------------------------------------------------- serve

/** Report mới nhất trong ledger — ưu tiên trang tổng quan portfolio nếu ngày đó có chạy toàn bộ. */
function findLatestReport(root) {
  const reviewDir = path.join(root, 'review');
  if (!fs.existsSync(reviewDir)) return null;
  const dates = fs.readdirSync(reviewDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
  for (const date of dates) {
    const dateDir = path.join(reviewDir, date);
    const tong = path.join(dateDir, '_tong', 'tong.html');
    if (fs.existsSync(tong)) return `review/${date}/_tong/tong.html`;
    const subs = fs.readdirSync(dateDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    for (const s of subs) {
      const p = path.join(dateDir, s.name, 'review.html');
      if (fs.existsSync(p)) return `review/${date}/${s.name}/review.html`;
    }
  }
  return null;
}

async function cmdServe(rest, opts) {
  const { startServer, openBrowser } = await import('./lib/serve.mjs');
  const root = ledgerRoot(HUB);
  if (!fs.existsSync(root)) fail(`chưa có ledger nào để xem: ${root} — chạy \`report\` trước`);

  const openRel = rest[0] ?? findLatestReport(root);
  const port = opts.port ? Number(opts.port) : 0;
  const server = await startServer({ root, port });
  const url = `http://127.0.0.1:${server.address().port}/${openRel ? openRel.replace(/\\/g, '/') : ''}`;

  process.stdout.write(`4ai serve: ${url}\n`);
  process.stdout.write('Ctrl+C để tắt.\n');
  if (!opts['no-open']) openBrowser(url);

  process.on('SIGINT', () => {
    process.stdout.write('\nĐã tắt 4ai serve.\n');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });
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
    port: { type: 'string' },
    'no-open': { type: 'boolean', default: false },
    project: { type: 'string' },
    dept: { type: 'string' },
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
    cmdCheck(values); break;
  case 'doctor':
    await cmdDoctor(values); break;
  case 'setup':
    await cmdSetup(); break;
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
    await cmdReport(rest[0], { ...values, dryRun: values['dry-run'], project: values.project, dept: values.dept }); break;
  case 'sync':
    await cmdSync({ ...values, dryRun: values['dry-run'] }); break;
  case 'serve':
    await cmdServe(rest, values); break;
  default:
    fail(`lệnh không rõ: ${cmd}\n${USAGE}`);
}
