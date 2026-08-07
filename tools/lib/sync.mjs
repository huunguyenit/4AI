// sync.mjs — điều phối: chọn target → chọn asset theo domain/tool → gọi emitter →
// đưa toàn bộ qua writer. Emitter không ghi; writer là cửa duy nhất.

import fs from 'node:fs';
import path from 'node:path';
import { HUB, loadAssets, readJson } from './assets.mjs';
import { syncTarget, ensureImportLine } from './writer.mjs';
import { emitClaude } from './emit/claude.mjs';
import { emitCursor } from './emit/cursor.mjs';
import { emitVscode } from './emit/vscode.mjs';
import { emitDevworkflow } from './emit/devworkflow.mjs';

const EMITTERS = { claude: emitClaude, cursor: emitCursor, vscode: emitVscode, devworkflow: emitDevworkflow };

function isUnc(p) {
  return /^[\\/]{2}/.test(p);
}

export async function runSync(opts) {
  const targetsCfg = readJson(path.join(HUB, 'targets.json'));
  const mcpCfg = readJson(path.join(HUB, 'mcp', 'servers.json'), { servers: {} });
  const { assets, errors } = loadAssets({
    domains: targetsCfg.domains ?? null,
    mcpServerIds: Object.keys(mcpCfg.servers),
  });

  if (errors.length > 0) {
    process.stderr.write(`4ai: hub có ${errors.length} lỗi — sync bị chặn. Chạy \`check\` để xem chi tiết.\n`);
    return 1;
  }

  // Chọn target.
  let targets = targetsCfg.targets.filter((t) => t.enabled && !t.role);
  if (opts.target?.length) {
    const wanted = new Set(opts.target);
    const byName = new Map(targetsCfg.targets.map((t) => [t.name, t]));
    targets = [];
    for (const name of wanted) {
      const t = byName.get(name);
      if (!t) { process.stderr.write(`4ai: không có target \`${name}\` trong targets.json\n`); return 1; }
      if (t.role === 'customer-program') {
        process.stderr.write(`4ai: target \`${name}\` là customer-program — sync không bao giờ ghi vào đó.\n`);
        return 1;
      }
      if (t.role) {
        process.stderr.write(`4ai: target \`${name}\` có role \`${t.role}\` — chỉ đăng ký để tra cứu, không sync.\n`);
        return 1;
      }
      targets.push(t);
    }
  }
  if (opts.dest) {
    if (isUnc(opts.dest)) {
      process.stderr.write('4ai: --dest trỏ vào đường dẫn UNC bị từ chối — không bao giờ ghi lên share.\n');
      return 1;
    }
    targets = [{ name: `dest:${opts.dest}`, path: opts.dest,
      tools: Object.keys(EMITTERS), domains: targetsCfg.domains ?? [], adhoc: true }];
    if (!opts.yes) opts.dryRun = true;
  }
  if (targets.length === 0) {
    process.stderr.write('4ai: không có target nào đang bật. Xem `targets`.\n');
    return 1;
  }

  let hadRefusals = false;
  let wrote = false;

  for (const target of targets) {
    if (isUnc(target.path)) {
      process.stderr.write(`4ai: target \`${target.name}\` là đường dẫn UNC — bỏ qua, không bao giờ ghi lên share.\n`);
      hadRefusals = true;
      continue;
    }
    if (!fs.existsSync(target.path)) {
      process.stderr.write(`4ai: target \`${target.name}\`: path không tồn tại: ${target.path}\n`);
      hadRefusals = true;
      continue;
    }

    // Lần đầu (chưa có manifest) thì mặc định dry-run, trừ khi --yes.
    const mfPath = path.join(target.path, '.4ai', 'manifest.json');
    const manifest = fs.existsSync(mfPath) ? readJson(mfPath) : null;
    let dryRun = opts.dryRun;
    let firstRunForced = false;
    if (!manifest && !opts.yes && !opts.dryRun) {
      dryRun = true;
      firstRunForced = true;
    }

    const tools = (opts.tool?.length ? target.tools.filter((t) => opts.tool.includes(t)) : target.tools)
      .filter((t) => t in EMITTERS);

    const domainAssets = assets.filter((a) => target.domains.includes(a.domain));

    // Gom output của mọi emitter cho target này.
    const textFiles = [];
    const jsonFiles = [];
    const notes = [];
    for (const tool of tools) {
      const subset = domainAssets.filter((a) => a.targets.includes(tool));
      const mcpServers = Object.fromEntries(
        Object.entries(mcpCfg.servers).filter(([, s]) => (s.targets ?? []).includes(tool)));
      const out = EMITTERS[tool]({ assets: subset, mcpServers, target });
      textFiles.push(...out.textFiles);
      jsonFiles.push(...out.jsonFiles);
      notes.push(...out.notes);
    }

    // Hai emitter có thể cùng đụng một file JSON? Hiện không — path tách nhau. Guard:
    const seen = new Set();
    for (const f of [...textFiles, ...jsonFiles]) {
      const key = f.relPath.replace(/\\/g, '/');
      if (seen.has(key)) {
        process.stderr.write(`4ai: BUG — hai emitter cùng emit \`${key}\` cho target \`${target.name}\`.\n`);
        return 1;
      }
      seen.add(key);
    }

    const { plan, refusals, counts } = syncTarget({
      destRoot: target.path,
      textFiles,
      jsonFiles,
      manifest,
      opts: { dryRun, force: opts.force, verbose: opts.verbose, targetName: target.name },
    });

    // In kết quả.
    const header = `— target ${target.name} (${target.path})${dryRun ? '  [DRY RUN]' : ''}`;
    process.stdout.write(header + '\n');
    for (const p of plan) {
      if (p.action === 'unchanged' && !opts.verbose) continue;
      if (p.action === 'already-gone' && !opts.verbose) continue;
      process.stdout.write(`  ${p.action.padEnd(13)} ${p.relPath}${p.detail ? `  (${p.detail})` : ''}\n`);
    }
    process.stdout.write(
      `  ${counts.create} created · ${counts.update + counts['force-update']} updated · ${counts.merge} merged · ` +
      `${counts.unchanged} unchanged · ${counts.prune + counts['prune-keys']} pruned · ${refusals.length} refused\n`);

    for (const r of refusals) {
      hadRefusals = true;
      process.stdout.write(`  REFUSE ${r.relPath}\n    ${r.reason}\n`);
      if (r.diff && !opts.json) process.stdout.write(r.diff.split('\n').map((l) => '    ' + l).join('\n') + '\n');
    }
    for (const n of notes) process.stdout.write(`  NOTE ${n}\n`);

    // CLAUDE.md là file viết tay — 4AI không sở hữu. Chưa có thì tạo tối thiểu,
    // có rồi thì chỉ kiểm tra dòng @import và nhắc.
    if (target.claudeMdImport || target.scope === 'user') {
      const line = target.scope === 'user' ? '@4ai-global.md' : '@.claude/4ai-context.md';
      const header = target.scope === 'user'
        ? '# CLAUDE.md (user scope)\n\nFile này là của bạn — 4AI chỉ cần dòng import bên dưới.'
        : `# ${target.name}`;
      const state = ensureImportLine({ destRoot: target.path, fileName: 'CLAUDE.md', line, header, dryRun });
      if (state === 'created') {
        process.stdout.write(`  create        CLAUDE.md (tối thiểu, chứa \`${line}\` — file thuộc về bạn, 4AI không đụng lại)\n`);
      } else if (state === 'missing-line') {
        process.stdout.write(`  ACTION cần thêm dòng \`${line}\` vào ${target.name}/CLAUDE.md (4AI không tự sửa file viết tay).\n`);
      }
    }

    if (dryRun) {
      process.stdout.write(firstRunForced
        ? '  DRY RUN — lần sync đầu của target này luôn là dry-run; chạy lại với --yes để ghi thật.\n'
        : '  DRY RUN — no files written.\n');
    } else if (plan.some((p) => p.action !== 'unchanged' && p.action !== 'already-gone')) {
      wrote = true;
    }
  }

  return hadRefusals ? 1 : 0;
}
