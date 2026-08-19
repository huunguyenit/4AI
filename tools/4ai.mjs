#!/usr/bin/env node
// 4ai.mjs — CLI của hub 4AI. Zero dependency; chạy bằng `node tools/4ai.mjs <lệnh>`.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { HUB, loadAssets, loadTargets, readJson, resolveMcpServers, scanSecrets, ledgerRoot } from './lib/assets.mjs';
import { skeleton, KINDS } from './lib/schema.mjs';
import { stringifyFrontmatter } from './lib/fm.mjs';
import { emitPaths, isAlwaysOn, mcpPath } from './lib/paths.mjs';
import { auditLedger } from './lib/ledger-audit.mjs';

const USAGE = `4AI — hub trợ lý AI cho FBO. Cách dùng:

  node tools/4ai.mjs setup              khai danh tính PM + chuỗi kết nối vào qlda.local.json
                                        (gõ trong terminal của bạn — giá trị KHÔNG đi qua model AI)
  node tools/4ai.mjs doctor             chẩn đoán: hub + sqlcmd + PM + nguồn kết nối. Không ghi
  node tools/4ai.mjs license            trạng thái giấy phép + Device ID của máy này
                                        id | import <file.json> | path | keygen | issue
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
  node tools/4ai.mjs playbook add       ghi một cách làm vào kho hướng dẫn lập trình (vào đồ thị)
                                        --project MA_DA --title "..." --how "..." bắt buộc
                                        neo tra cứu: --sysid | --menu | --table | --tags a,b (ít nhất một)
                                        --ur A000...YC1 --when "..." --warn "..." --from MA_LT --dry-run
  node tools/4ai.mjs playbook edit      sửa hướng dẫn đã có, CHỈ trường được truyền
                                        --project MA_DA --title "<tiêu đề đang có>" để chỉ dòng
                                        không truyền = giữ nguyên; truyền "" = XOÁ trường đó
                                        tiêu đề nằm trong khoá nên không đổi được bằng edit
  node tools/4ai.mjs playbook search    tra kho: [--sysid S] [--menu M] [--table T] [<từ khoá>] [--json]
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
  const targetsCfg = loadTargets(HUB);
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

// ---------------------------------------------------------------- license

async function cmdLicense(sub, rest, opts) {
  const { runLicense } = await import('./lib/license-cli.mjs');
  process.exit(runLicense(HUB, sub, rest, opts));
}

/**
 * Cổng giấy phép cho các lệnh RUNTIME — thứ đi theo gói phân phối và tạo ra giá trị cho
 * người dùng cuối (`report`, `serve`, `graph`).
 *
 * KHÔNG chặn compiler (`check`, `sync`, `list`, `explain`, `new`, `targets`) và không chặn
 * chẩn đoán (`doctor`, `setup`): chúng chỉ có nghĩa khi có mã nguồn hub trong tay, mà ai có
 * hub thì giấy phép không còn là hàng rào gì. Chặn chúng chỉ tổ làm người phát triển kẹt.
 *
 * `requireLicense` tự bỏ qua khi đang chạy từ chính repo hub — xem isSourceHub().
 */
async function chanGiayPhep(lenh) {
  const { requireLicense } = await import('../mcp/fbo/lib/license.mjs');
  try {
    requireLicense(HUB, { what: lenh });
  } catch (e) {
    fail(e.message);
  }
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

// ---------------------------------------------------------------- playbook

/**
 * `playbook add` — PM gõ một cách làm vào kho hướng dẫn lập trình.
 *
 * Đi qua ĐÚNG đường đẩy của `graph experience`: entry → node → emitSql → runGraphScript. Không
 * có đường ghi tắt nào vào DB, vì mọi thứ vào đồ thị đều phải qua validate schema — hướng dẫn
 * ghi sai kiểu thì dự án sau đọc ra rác, mà lúc đó không còn ai nhớ để sửa.
 */
/** Đối số CLI → hình dạng `entry`. Giữ nguyên `undefined` cho cờ VẮNG MẶT — xem gopEntry(). */
function entryTuOpts(opts) {
  return {
    maDa: opts.project,
    sttRec: opts.ur,
    tieuDe: opts.title,
    boiCanh: opts.when,
    cachLam: opts.how,
    canhBao: opts.warn,
    sysid: opts.sysid,
    menuId: opts.menu,
    bang: opts.table,
    tags: opts.tags,
    nguonLt: opts.from,
    doTinCay: opts.confidence,
  };
}

/** Entry đã chốt → validate → sinh script → nạp. Dùng chung cho `add` và `edit`. */
async function napPlaybook(entry, { dryRun }) {
  const { kiemEntry, entryToGraph } = await import('./lib/playbook.mjs');
  const { loadSchema, graphTuObject, validateGraph, emitSql } = await import('./lib/graph.mjs');
  const { writeArtifacts } = await import('./lib/writer.mjs');
  const { pmIdentity } = await import('./lib/assets.mjs');

  const loi = kiemEntry(entry);
  if (loi.length) {
    for (const e of loi) process.stderr.write(`  ${e}\n`);
    fail(`${loi.length} chỗ chưa đủ để ghi hướng dẫn.`);
  }

  const pm = pmIdentity(HUB);
  const ngay = new Date().toISOString().slice(0, 10);
  const ket = entryToGraph(entry, { boi: pm.maNv, ngay });

  const schema = loadSchema(HUB);
  const g = graphTuObject(schema, ket);
  // Request là node NGOÀI lô: nó do đường báo cáo nạp, đã nằm sẵn trong DB. Dựng lại ở đây sẽ
  // ghi đè bản đầy đủ bằng một bản chỉ có mỗi stt_rec.
  const errs = [...g.errors, ...validateGraph(schema, g, { kindNgoai: ['Request'] })];
  if (errs.length) {
    for (const e of errs.slice(0, 10)) process.stderr.write(`  ${e.message}\n`);
    fail(`${errs.length} lỗi đồ thị — không nạp.`);
  }

  const rel = path.join('.4ai', 'graph', 'playbook.sql');
  // boSung: lô này có ĐÚNG MỘT hướng dẫn. Chế độ mặc định của emitter hiểu lô là bản đầy đủ
  // của scope và sẽ xoá mọi hướng dẫn khác của cùng dự án — xem chú thích ở emitSql().
  writeArtifacts({ destRoot: HUB,
    files: [{ relPath: rel, content: emitSql(schema, g, { scopes: ket.scopes, boSung: true }) }] });

  const tags = Array.isArray(entry.tags) ? entry.tags
    : String(entry.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  process.stdout.write(`Hướng dẫn: ${entry.tieuDe}\n`);
  process.stdout.write(`  khoá  ${ket.scopes[0]}|${ket.id}\n`);
  process.stdout.write(`  neo   ${[entry.sysid && `sysid=${entry.sysid}`, entry.menuId && `menu=${entry.menuId}`,
    entry.bang && `bảng=${entry.bang}`, tags.length && `tags=${tags.join(',')}`]
    .filter(Boolean).join(' · ') || '(không có)'}\n`);
  if (dryRun) {
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

async function cmdPlaybookAdd(opts) {
  const entry = entryTuOpts(opts);
  // `add` là ghi MỚI: cờ vắng mặt nghĩa là trường đó rỗng, không có gì cũ để giữ.
  entry.tags = opts.tags ? String(opts.tags).split(',') : [];
  await napPlaybook(entry, { dryRun: opts.dryRun });
}

/**
 * `playbook edit` — đọc dòng cũ, chỉ ghi đè trường ĐƯỢC TRUYỀN.
 *
 * Vì sao cần lệnh riêng thay vì bảo người dùng gõ lại `add`: MERGE ghi đè toàn bộ cột từ lô,
 * nên `add` gõ lại chỉ để thêm `--from` mà quên `--warn` sẽ xoá trắng `canhBao` — im lặng,
 * `kiemEntry` không biết cái gì "đáng lẽ phải còn đó".
 *
 * Định vị dòng bằng `--project` + `--title`: tiêu đề CHÍNH LÀ nửa sau của khoá (qua slug), nên
 * đổi tiêu đề là đổi khoá, tức là một dòng khác. Đây không phải hạn chế tạm — đổi tên trong
 * chế độ ghi bổ sung sẽ để lại dòng cũ nằm đó mà không ai gọi được nữa, tệ hơn là không cho đổi.
 */
async function cmdPlaybookEdit(opts) {
  const { slugTieuDe, docTheoKhoa, rowToEntry, gopEntry } = await import('./lib/playbook.mjs');
  const { runGraphSql } = await import('../mcp/fbo/lib/sql.mjs');

  const maDa = String(opts.project ?? '').trim();
  const tieuDe = String(opts.title ?? '').trim();
  if (!maDa || !tieuDe) {
    fail('cách dùng: playbook edit --project MA_DA --title "<tiêu đề đang có>" [trường cần đổi]\n'
      + '  Truyền chuỗi rỗng để XOÁ một trường, ví dụ --warn ""\n'
      + '  Không truyền thì trường đó giữ nguyên.');
  }

  let dong;
  try {
    dong = docTheoKhoa({ runGraphSql }, maDa, slugTieuDe(tieuDe));
  } catch (e) {
    fail(e.message);
  }
  if (!dong.length) {
    fail(`không có hướng dẫn nào của \`${maDa}\` mang tiêu đề "${tieuDe}".\n`
      + '  Tiêu đề là một PHẦN của khoá — sửa nó không đổi được bằng `edit`.\n'
      + '  Xem tiêu đề đang có: `4ai playbook search`');
  }
  if (dong.length > 1 && !opts.ur) {
    process.stderr.write(`  ${dong.length} hướng dẫn cùng tiêu đề, khác UR:\n`);
    for (const d of dong) process.stderr.write(`    --ur ${d.stt_rec || '(không có)'}\n`);
    fail('thêm `--ur` để chỉ đúng một.');
  }
  const cu = rowToEntry(opts.ur
    ? dong.find((d) => String(d.stt_rec).trim() === String(opts.ur).trim()) ?? dong[0]
    : dong[0]);

  // Không cho `edit` đổi thứ tạo nên khoá — đổi được thì nó là `add` một dòng mới, còn dòng cũ
  // nằm lại vĩnh viễn. Nói thẳng chứ không lặng lẽ bỏ qua đối số người ta vừa gõ.
  const moi = entryTuOpts(opts);
  if (moi.sttRec !== undefined && String(moi.sttRec).trim() !== String(cu.sttRec).trim()) {
    fail(`\`--ur\` ở đây để CHỌN dòng, không đổi được: nó nằm trong khoá. `
      + `Dòng đang chọn có UR \`${cu.sttRec || '(không có)'}\`.`);
  }
  delete moi.maDa; delete moi.sttRec; delete moi.tieuDe;

  const daDoi = Object.entries(moi).filter(([, v]) => v !== undefined).map(([k]) => k);
  if (!daDoi.length) {
    fail('không có trường nào để đổi. Truyền ít nhất một, ví dụ --warn "..." (hoặc --warn "" để xoá).');
  }

  const sau = gopEntry(cu, moi);
  process.stdout.write(`Sửa ${daDoi.length} trường: ${daDoi.join(', ')}\n`);
  for (const k of daDoi) {
    const truoc = Array.isArray(cu[k]) ? cu[k].join(',') : String(cu[k] ?? '');
    const nay = Array.isArray(sau[k]) ? sau[k].join(',') : String(sau[k] ?? '');
    process.stdout.write(`  ${k}: ${truoc ? `"${cutNgan(truoc)}"` : '(rỗng)'}`
      + ` → ${nay ? `"${cutNgan(nay)}"` : '(XOÁ)'}\n`);
  }
  await napPlaybook(sau, { dryRun: opts.dryRun });
}

const cutNgan = (s) => (s.length > 60 ? s.slice(0, 59).replace(/\n/g, ' ') + '…' : s.replace(/\n/g, ' '));

/** `playbook search` — tra kho. Cố ý KHÔNG lọc theo dự án: xem chú thích đầu playbook.mjs. */
async function cmdPlaybookSearch(rest, opts) {
  const { docPlaybook } = await import('./lib/playbook.mjs');
  const { runGraphSql } = await import('../mcp/fbo/lib/sql.mjs');

  const rows = docPlaybook({ runGraphSql }, {
    sysids: opts.sysid ? [opts.sysid] : [],
    menuIds: opts.menu ? [opts.menu] : [],
    bangs: opts.table ? [opts.table] : [],
    tuKhoa: rest[0] ?? opts.tags ?? '',
    // Người gõ lệnh thì phải thấy lỗi: câu SQL sai trông y hệt kho rỗng.
    neLoi: false,
  });

  if (opts.json) { process.stdout.write(JSON.stringify(rows, null, 2) + '\n'); return; }
  if (!rows.length) {
    process.stdout.write('Không có hướng dẫn nào khớp. Kho rỗng lúc mới bật là bình thường — '
      + 'ghi cái đầu tiên bằng `playbook add`.\n');
    return;
  }
  for (const r of rows) {
    const neo = [r.sysid && `sysid ${r.sysid}`, r.menu_id && `menu ${r.menu_id}`, r.bang && `bảng ${r.bang}`]
      .filter(Boolean).join(' · ');
    process.stdout.write(`\n■ ${r.tieuDe}\n`);
    process.stdout.write(`  ${neo || '(không có neo hiện vật)'} · từ ${r.ma_da}`
      + `${r.nguonLt ? ` · kinh nghiệm của ${r.nguonLt}` : ''}\n`);
    if (r.boiCanh) process.stdout.write(`  Khi nào: ${r.boiCanh}\n`);
    process.stdout.write(`  Cách làm: ${r.cachLam}\n`);
    if (r.canhBao) process.stdout.write(`  Cẩn thận: ${r.canhBao}\n`);
  }
  process.stdout.write(`\n${rows.length} hướng dẫn.\n`);
}

async function cmdPlaybook(sub, opts, rest = []) {
  if (sub === 'add') return cmdPlaybookAdd(opts);
  if (sub === 'edit') return cmdPlaybookEdit(opts);
  if (sub === 'search' || sub === 'list') return cmdPlaybookSearch(rest, opts);
  fail(`playbook: lệnh con không rõ: ${sub} (add | edit | search)`);
}

// ---------------------------------------------------------------- graph

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

/**
 * Đối số đường dẫn của `serve` → path tương đối trong ledger, luôn KHÔNG có dấu `/` mở đầu.
 *
 * Hai chuyện phải gỡ ở đây, cả hai đều đã cắn thật:
 *   - `serve /review` ghép thẳng vào gốc URL cho ra `http://host//review` — hai dấu gạch.
 *   - Git Bash trên Windows dịch `/review` thành `C:/Program Files/Git/review` TRƯỚC khi node
 *     nhìn thấy đối số. Tài liệu agent đang bảo chạy đúng câu đó, nên phải cắt về đoạn
 *     `review/...` chứ không được coi là người dùng gõ sai.
 */
function relServe(arg) {
  const s = String(arg ?? '').replace(/\\/g, '/');
  const m = s.match(/(^|\/)(review(?:\/.*)?)$/);
  return m ? m[2] : s.replace(/^\/+/, '');
}

async function cmdServe(rest, opts) {
  const { startServer, openBrowser, resolveReviewAlias } = await import('./lib/serve.mjs');
  const root = ledgerRoot(HUB);
  if (!fs.existsSync(root)) fail(`chưa có ledger nào để xem: ${root} — chạy \`report\` trước`);

  // Phân giải alias NGAY tại đây thay vì để server trả 302: URL in ra terminal và URL đưa cho
  // trình duyệt phải là địa chỉ THẬT của trang. `/review` chỉ là lối tắt gõ cho nhanh — thứ
  // người dùng copy được phải mở lại đúng trang đó, kể cả ở một phiên serve khác.
  const yeuCau = rest[0] ? relServe(rest[0]) : findLatestReport(root);
  const alias = yeuCau ? resolveReviewAlias(root, `/${yeuCau}`) : null;
  const openRel = alias ? alias.replace(/^\/+/, '') : (yeuCau ?? '');

  const port = opts.port ? Number(opts.port) : 0;
  const server = await startServer({ root, port });
  const url = `http://127.0.0.1:${server.address().port}/${openRel}`;

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
    // playbook add/search
    ur: { type: 'string' },
    title: { type: 'string' },
    when: { type: 'string' },
    how: { type: 'string' },
    warn: { type: 'string' },
    sysid: { type: 'string' },
    menu: { type: 'string' },
    table: { type: 'string' },
    tags: { type: 'string' },
    from: { type: 'string' },
    confidence: { type: 'string' },
    // license issue/keygen
    device: { type: 'string' },
    to: { type: 'string' },
    days: { type: 'string' },
    expires: { type: 'string' },
    forever: { type: 'boolean', default: false },
    key: { type: 'string' },
    kid: { type: 'string' },
    note: { type: 'string' },
    out: { type: 'string' },
    'license-id': { type: 'string' },
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
  case 'license':
    await cmdLicense(rest[0], rest.slice(1), values); break;
  case 'graph':
    await chanGiayPhep('graph');
    await cmdGraph(rest[0] ?? 'build', { ...values, dryRun: values['dry-run'] }); break;
  case 'report':
    await chanGiayPhep('report');
    await cmdReport(rest[0], { ...values, dryRun: values['dry-run'], project: values.project, dept: values.dept }); break;
  case 'sync':
    await cmdSync({ ...values, dryRun: values['dry-run'] }); break;
  case 'serve':
    await chanGiayPhep('serve');
    await cmdServe(rest, values); break;
  case 'playbook':
    await chanGiayPhep('playbook');
    await cmdPlaybook(rest[0] ?? 'search', { ...values, dryRun: values['dry-run'] }, rest.slice(1)); break;
  default:
    fail(`lệnh không rõ: ${cmd}\n${USAGE}`);
}
