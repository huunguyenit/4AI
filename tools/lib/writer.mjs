// writer.mjs — nơi DUY NHẤT chạm filesystem output.
//
// Emitter TRẢ VỀ mô tả file ({relPath, content} hoặc {relPath, jsonPatch, ownedKeys}),
// không tự ghi. Writer gom tất cả, so với manifest, quyết định
// create/update/unchanged/prune/refuse, rồi (nếu không dry-run) ghi.
//
// Bất biến: UTF-8 không BOM · LF · trailing newline · JSON stable ·
// ghi temp-rồi-rename cùng thư mục · dry-run short-circuit tại đây.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { stableStringify, canonical, deepMerge, getPath, setPath, deletePath } from './json.mjs';

export function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function normalize(content) {
  let s = content.replace(/\r\n/g, '\n');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  if (!s.endsWith('\n')) s += '\n';
  return s;
}

function readTextIfExists(abs) {
  if (!fs.existsSync(abs)) return null;
  const buf = fs.readFileSync(abs);
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

function writeAtomic(abs, content) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = path.join(path.dirname(abs), `.4ai-tmp-${process.pid}-${path.basename(abs)}`);
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, abs);
}

/** Unified diff tối giản, đủ để người đọc thấy mình đã sửa gì. */
function miniDiff(oldText, newText, label) {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const out = [`--- ${label} (trên đĩa)`, `+++ ${label} (bản 4AI sẽ ghi)`];
  const max = Math.max(a.length, b.length);
  let shown = 0;
  for (let i = 0; i < max && shown < 40; i++) {
    if (a[i] !== b[i]) {
      if (a[i] !== undefined) { out.push(`-${i + 1}: ${a[i]}`); shown++; }
      if (b[i] !== undefined) { out.push(`+${i + 1}: ${b[i]}`); shown++; }
    }
  }
  if (shown >= 40) out.push('… (diff cắt bớt)');
  return out.join('\n');
}

/**
 * Đảm bảo file CLAUDE.md (project hoặc user scope) có dòng @import.
 * File này là tài sản VIẾT TAY — 4AI không sở hữu, không track trong manifest:
 * chưa có thì tạo tối thiểu (một lần), có rồi thì chỉ kiểm tra và báo.
 * @returns {'created'|'present'|'missing-line'}
 */
export function ensureImportLine({ destRoot, fileName, line, header, dryRun }) {
  const abs = path.join(destRoot, fileName);
  const existing = readTextIfExists(abs);
  if (existing === null) {
    if (!dryRun) writeAtomic(abs, normalize(`${header}\n\n${line}\n`));
    return 'created';
  }
  return existing.includes(line) ? 'present' : 'missing-line';
}

/**
 * Đồng bộ một target.
 *
 * @param {object} p
 * @param {string} p.destRoot        thư mục đích tuyệt đối
 * @param {Array<{relPath: string, content: string, sourceId?: string, sourceVersion?: number}>} p.textFiles
 * @param {Array<{relPath: string, patch: object, ownedKeys: string[]}>} p.jsonFiles
 *        patch: object sẽ deep-merge vào file hiện có; ownedKeys: các đường dẫn "a.b"
 *        mà 4AI sở hữu (hash + prune theo key).
 * @param {object|null} p.manifest   manifest cũ (null nếu chưa từng sync)
 * @param {{dryRun: boolean, force: boolean, verbose: boolean, targetName: string}} p.opts
 * @returns {{plan: object[], refusals: object[], manifest: object, counts: object}}
 */
export function syncTarget({ destRoot, textFiles, jsonFiles, manifest, opts }) {
  const plan = [];        // {action, relPath, detail?}
  const refusals = [];    // {relPath, reason, diff?}
  const newManifestFiles = [];
  const newJsonOwnership = [];

  const oldFiles = new Map((manifest?.files ?? []).map((f) => [f.path, f]));
  const oldJson = new Map((manifest?.jsonOwnership ?? []).map((j) => [j.path, j]));

  // ---- file text (markdown-family) ----
  const emittedPaths = new Set();
  for (const f of textFiles) {
    const relPath = f.relPath.replace(/\\/g, '/');
    emittedPaths.add(relPath);
    const abs = path.join(destRoot, relPath);
    const content = normalize(f.content);
    const newHash = sha256(content);
    const onDisk = readTextIfExists(abs);
    const prev = oldFiles.get(relPath);

    newManifestFiles.push({ path: relPath, sha256: newHash,
      ...(f.sourceId ? { sourceId: f.sourceId, sourceVersion: f.sourceVersion } : {}) });

    if (onDisk === null) {
      plan.push({ action: 'create', relPath });
      if (!opts.dryRun) writeAtomic(abs, content);
      continue;
    }
    const diskHash = sha256(normalize(onDisk));
    if (!prev) {
      if (diskHash === newHash) {
        // Nội dung trùng khớp hoàn toàn — nhận nuôi an toàn (thường là sau khi mất manifest).
        plan.push({ action: 'adopt', relPath });
        continue;
      }
      refusals.push({ relPath,
        reason: 'file đã tồn tại mà 4AI chưa từng tạo — nhận nuôi âm thầm có thể phá file viết tay',
        diff: miniDiff(onDisk, content, relPath) });
      newManifestFiles.pop();
      continue;
    }
    if (diskHash !== prev.sha256 && !opts.force) {
      refusals.push({ relPath,
        reason: 'file bị sửa tay sau lần sync trước — đưa sửa đổi về asset trong hub, hoặc chạy lại với --force',
        diff: miniDiff(onDisk, content, relPath) });
      newManifestFiles[newManifestFiles.length - 1] = prev; // giữ hash cũ trong manifest
      continue;
    }
    if (diskHash === newHash) {
      plan.push({ action: 'unchanged', relPath });
      continue;
    }
    plan.push({ action: diskHash !== prev.sha256 ? 'force-update' : 'update', relPath });
    if (!opts.dryRun) writeAtomic(abs, content);
  }

  // ---- prune file text ----
  for (const [relPath, prev] of oldFiles) {
    if (emittedPaths.has(relPath)) continue;
    const abs = path.join(destRoot, relPath);
    const onDisk = readTextIfExists(abs);
    if (onDisk === null) { plan.push({ action: 'already-gone', relPath }); continue; }
    const diskHash = sha256(normalize(onDisk));
    if (diskHash !== prev.sha256 && !opts.force) {
      refusals.push({ relPath,
        reason: 'file mồ côi (asset đã xoá khỏi hub) nhưng bị sửa tay — xoá thủ công nếu chắc chắn' });
      newManifestFiles.push(prev);
      continue;
    }
    plan.push({ action: 'prune', relPath });
    if (!opts.dryRun) {
      fs.rmSync(abs);
      // dọn thư mục cha rỗng do 4AI tạo (vd .claude/skills/<id>/)
      let dir = path.dirname(abs);
      while (dir !== destRoot && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
      }
    }
  }

  // ---- file JSON (merge theo owned key) ----
  const emittedJson = new Set();
  for (const jf of jsonFiles) {
    const relPath = jf.relPath.replace(/\\/g, '/');
    emittedJson.add(relPath);
    const abs = path.join(destRoot, relPath);
    const raw = readTextIfExists(abs);
    let existing = {};
    let createdByUs = true;
    if (raw !== null) {
      createdByUs = oldJson.get(relPath)?.createdByUs ?? false;
      try {
        existing = JSON.parse(raw);
      } catch (e) {
        refusals.push({ relPath,
          reason: `JSON hiện có không parse được (${e.message}) — không bao giờ ghi đè file mình không đọc nổi; sửa tay file đó trước` });
        continue;
      }
    }

    // Kiểm tra sửa tay trên subtree mình sở hữu.
    const prev = oldJson.get(relPath);
    if (prev && raw !== null && !opts.force) {
      const currentOwned = canonical(prev.ownedKeys.map((k) => getPath(existing, k)));
      if (currentOwned !== prev.ownedCanonical) {
        refusals.push({ relPath,
          reason: `phần ${prev.ownedKeys.join(', ')} trong JSON bị sửa tay sau lần sync trước — đưa sửa đổi về mcp/servers.json, hoặc --force` });
        newJsonOwnership.push(prev);
        continue;
      }
    }

    const merged = deepMerge(existing, jf.patch);
    const newContent = normalize(stableStringify(merged));
    const ownedCanonical = canonical(jf.ownedKeys.map((k) => getPath(merged, k)));
    newJsonOwnership.push({ path: relPath, ownedKeys: jf.ownedKeys, ownedCanonical, createdByUs });

    if (raw === null) {
      plan.push({ action: 'create', relPath });
      if (!opts.dryRun) writeAtomic(abs, newContent);
    } else if (normalize(raw) === newContent) {
      plan.push({ action: 'unchanged', relPath });
    } else {
      plan.push({ action: 'merge', relPath, detail: jf.ownedKeys.join(', ') });
      if (!opts.dryRun) writeAtomic(abs, newContent);
    }
  }

  // ---- prune owned key trong JSON không còn được emit ----
  for (const [relPath, prev] of oldJson) {
    if (emittedJson.has(relPath)) continue;
    const abs = path.join(destRoot, relPath);
    const raw = readTextIfExists(abs);
    if (raw === null) { plan.push({ action: 'already-gone', relPath }); continue; }
    let existing;
    try { existing = JSON.parse(raw); } catch {
      refusals.push({ relPath, reason: 'JSON mồ côi không parse được — xử lý thủ công' });
      continue;
    }
    let removed = false;
    for (const k of prev.ownedKeys) removed = deletePath(existing, k) || removed;
    const isEmpty = (o) => typeof o === 'object' && o !== null &&
      Object.values(o).every((v) => typeof v === 'object' && v !== null && Object.keys(v).length === 0 || v === undefined);
    if (prev.createdByUs && (Object.keys(existing).length === 0 || isEmpty(existing))) {
      plan.push({ action: 'prune', relPath });
      if (!opts.dryRun) fs.rmSync(abs);
    } else if (removed) {
      plan.push({ action: 'prune-keys', relPath, detail: prev.ownedKeys.join(', ') });
      if (!opts.dryRun) writeAtomic(abs, normalize(stableStringify(existing)));
    }
  }

  const newManifest = {
    schemaVersion: 1,
    hub: 'D:\\Fast Source\\4AI',
    target: opts.targetName,
    syncedAt: new Date().toISOString(),
    files: newManifestFiles.sort((a, b) => (a.path < b.path ? -1 : 1)),
    jsonOwnership: newJsonOwnership.sort((a, b) => (a.path < b.path ? -1 : 1)),
  };

  const counts = { create: 0, update: 0, 'force-update': 0, merge: 0, unchanged: 0, adopt: 0, prune: 0, 'prune-keys': 0, 'already-gone': 0 };
  for (const p of plan) counts[p.action] = (counts[p.action] ?? 0) + 1;

  // Ghi manifest (chỉ khi không dry-run và không có refusal chặn toàn cục).
  if (!opts.dryRun) {
    const mfAbs = path.join(destRoot, '.4ai', 'manifest.json');
    writeAtomic(mfAbs, normalize(stableStringify(newManifest)));
  }

  return { plan, refusals, manifest: newManifest, counts };
}
