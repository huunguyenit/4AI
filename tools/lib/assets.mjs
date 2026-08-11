// assets.mjs — discover + parse + validate toàn bộ `assets/**`, dựng asset graph.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, FmError } from './fm.mjs';
import { applyDefaults, validateAsset, SECRET_PATTERNS, SECRET_WAIVER } from './schema.mjs';

/** Gốc hub, suy ra từ vị trí file này (tools/lib/assets.mjs → ../../). */
export const HUB = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');

/**
 * Ledger ngoài hub (tasks, CHANGELOG, HTML report) — vị trí đọc từ `mcpDataRoot` khai trong
 * `%USERPROFILE%\.cursor\fbo-local.json` (per máy, không commit). Máy nào chưa có file đó
 * thì lùi về `<hub>/ledger` — không suy đoán path bằng cấu trúc thư mục tương đối.
 */
export function ledgerRoot(hub = HUB) {
  const localCfgPath = path.join(process.env.USERPROFILE ?? '', '.cursor', 'fbo-local.json');
  const local = readJson(localCfgPath, {});
  if (local.mcpDataRoot) return path.join(local.mcpDataRoot, '4ai', 'ledger');
  return path.join(hub, 'ledger');
}

/** @deprecated dùng ledgerRoot — giữ alias cho chỗ gọi cũ */
export function ledgerDataRoot(hub = HUB) {
  return ledgerRoot(hub);
}

/** Mặc định khi máy chưa có `data/qlda.local.json` — giữ hành vi hiện tại của hub. */
const DEFAULT_PM = { maNv: 'PM01', boPhanLt: 'FSD' };

/**
 * Danh tính PM hiện tại — đọc `pm.maNv`/`pm.boPhanLt` từ `data/qlda.local.json` (per máy,
 * gitignore, cùng file `tools/lib/report.mjs` dùng). Chưa cấu hình thì lùi về `DEFAULT_PM`
 * để asset chứa token `{PMName}`/`{PMDept}` vẫn render đúng như trước khi có token.
 */
export function pmIdentity(hub = HUB) {
  const local = readJson(path.join(hub, 'data', 'qlda.local.json'), {});
  return {
    maNv: local.pm?.maNv || DEFAULT_PM.maNv,
    boPhanLt: local.pm?.boPhanLt || DEFAULT_PM.boPhanLt,
  };
}

/** Thay token `{PMName}`/`{PMDept}` trong nội dung asset bằng danh tính PM máy hiện tại. */
export function applyPmTemplate(text, pm) {
  return text.replaceAll('{PMName}', pm.maNv).replaceAll('{PMDept}', pm.boPhanLt);
}

const KIND_FOLDER = {
  doctrine: 'doctrine',
  rule: 'rules',
  skill: 'skills',
  agent: 'agents',
  command: 'commands',
};
const FOLDER_KIND = Object.fromEntries(
  Object.entries(KIND_FOLDER).map(([k, v]) => [v, k]));

function toPosix(p) {
  return p.split(path.sep).join('/');
}

/** Đọc UTF-8 và bóc BOM nếu có — BOM làm parseFrontmatter fail ở dòng 1. */
export function readText(file) {
  const buf = fs.readFileSync(file);
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

/**
 * mcp/servers.json dùng token `{{HUB}}` trong command/args/cwd/env thay vì đường dẫn
 * tuyệt đối cố định — hub được checkout ở đường dẫn nào thì token giải ra đường dẫn đó,
 * nên cùng một mcp/servers.json chạy đúng trên nhiều máy/nhiều lần chuyển chỗ.
 */
export function resolveMcpServers(servers, hub = HUB) {
  const sub = (v) => (typeof v === 'string' ? v.replaceAll('{{HUB}}', hub) : v);
  const out = {};
  for (const [id, srv] of Object.entries(servers)) {
    out[id] = {
      ...srv,
      command: sub(srv.command),
      args: (srv.args ?? []).map(sub),
      ...(srv.cwd ? { cwd: sub(srv.cwd) } : {}),
      ...(srv.env && Object.keys(srv.env).length
        ? { env: Object.fromEntries(Object.entries(srv.env).map(([k, v]) => [k, sub(v)])) }
        : {}),
    };
  }
  return out;
}

export function readJson(file, fallback = undefined) {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`không tìm thấy file: ${file}`);
  }
  const text = readText(file);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${toPosix(path.relative(HUB, file))}: JSON không parse được — ${e.message}`);
  }
}

/**
 * @returns {{assets: object[], byId: Map, errors: object[], warnings: object[]}}
 */
export function loadAssets({ hub = HUB, domains = null, mcpServerIds = null } = {}) {
  const root = path.join(hub, 'assets');
  const errors = [];
  const warnings = [];
  const assets = [];
  const byId = new Map();

  if (!fs.existsSync(root)) {
    return { assets, byId, errors: [{ file: 'assets/', line: 0, message: 'thư mục `assets/` không tồn tại' }], warnings };
  }

  const files = fs.globSync('**/*.md', { cwd: root })
    .map(toPosix)
    .sort();
  const pm = pmIdentity(hub);

  for (const rel of files) {
    const abs = path.join(root, rel);
    const display = `assets/${rel}`;
    const parts = rel.split('/');
    const stem = path.basename(rel, '.md');

    let parsed;
    try {
      parsed = parseFrontmatter(readText(abs), display);
    } catch (e) {
      if (e instanceof FmError) errors.push({ file: display, line: e.line, message: e.reason });
      else errors.push({ file: display, line: 1, message: e.message });
      continue;
    }

    const { data: fm, body, bodyStartLine, keyLines } = parsed;
    const fieldErrs = validateAsset(fm, keyLines, body, { file: display, fmEndLine: bodyStartLine - 1 });
    for (const e of fieldErrs) errors.push({ file: display, line: e.line, message: e.message });

    // Vị trí file so với kind/domain.
    const folderKind = FOLDER_KIND[parts[0]];
    if (!folderKind) {
      errors.push({ file: display, line: 1,
        message: `thư mục \`assets/${parts[0]}/\` không hợp lệ — phải là một trong: ${Object.values(KIND_FOLDER).join(', ')}` });
    } else if (fm.kind && fm.kind !== folderKind) {
      errors.push({ file: display, line: keyLines.get('kind') ?? 1,
        message: `\`kind: ${fm.kind}\` nhưng file nằm trong \`assets/${parts[0]}/\` (kind của thư mục là \`${folderKind}\`)` });
    }

    if (folderKind === 'doctrine') {
      if (parts.length !== 2) {
        errors.push({ file: display, line: 1, message: 'doctrine đặt phẳng trong `assets/doctrine/`, không có thư mục domain' });
      }
    } else if (folderKind) {
      if (parts.length !== 3) {
        errors.push({ file: display, line: 1,
          message: `đường dẫn phải là \`assets/${parts[0]}/<domain>/<id>.md\`` });
      } else if (fm.domain && fm.domain !== parts[1]) {
        errors.push({ file: display, line: keyLines.get('domain') ?? 1,
          message: `\`domain: ${fm.domain}\` nhưng file nằm trong thư mục \`${parts[1]}/\` — domain trong frontmatter mới là chuẩn, hãy chuyển file` });
      }
    }

    if (fm.id && fm.id !== stem) {
      errors.push({ file: display, line: keyLines.get('id') ?? 1,
        message: `\`id: ${fm.id}\` phải bằng tên file \`${stem}\`` });
    }

    if (fm.domain && domains && !domains.includes(fm.domain)) {
      errors.push({ file: display, line: keyLines.get('domain') ?? 1,
        message: `domain \`${fm.domain}\` chưa khai báo trong targets.json:domains (${domains.join(', ')})` });
    }

    if (fm.id && byId.has(fm.id)) {
      errors.push({ file: display, line: keyLines.get('id') ?? 1,
        message: `\`id: ${fm.id}\` trùng với ${byId.get(fm.id).rel}` });
      continue;
    }

    // Token {PMName}/{PMDept} thay bằng danh tính PM máy hiện tại — sau validate (giữ
    // nguyên độ dài/định dạng của template được kiểm) chứ không phải trước.
    if (typeof fm.description === 'string') fm.description = applyPmTemplate(fm.description, pm);

    const asset = {
      ...applyDefaults(fm),
      body: applyPmTemplate(body.replace(/^\n+/, ''), pm),
      file: abs,
      rel: display,
      keyLines,
      bodyStartLine,
    };
    assets.push(asset);
    if (fm.id) byId.set(fm.id, asset);
  }

  // Liên kết chéo — chỉ chạy khi đã có index đầy đủ.
  for (const a of assets) {
    for (const ref of a['see-also'] ?? []) {
      if (!byId.has(ref)) {
        errors.push({ file: a.rel, line: a.keyLines.get('see-also') ?? 1,
          message: `\`see-also\` trỏ tới asset không tồn tại: \`${ref}\`` });
      }
    }
    if (mcpServerIds) {
      for (const ref of a.requires ?? []) {
        if (!mcpServerIds.includes(ref)) {
          errors.push({ file: a.rel, line: a.keyLines.get('requires') ?? 1,
            message: `\`requires\` trỏ tới MCP server không có trong mcp/servers.json: \`${ref}\`` });
        }
      }
    }
  }

  return { assets, byId, errors, warnings };
}

/** Quét secret ngoài phạm vi asset (mcp/data/4ai/ledger, data/). */
export function scanSecrets({ hub = HUB } = {}) {
  const roots = [
    { label: 'mcp/data/4ai/ledger', root: ledgerRoot(hub) },
    { label: 'data', root: path.join(hub, 'data') },
  ];
  const hits = [];
  for (const { label, root } of roots) {
    if (!fs.existsSync(root)) continue;
    for (const rel of fs.globSync('**/*.{md,json,jsonl,txt}', { cwd: root })) {
      const abs = path.join(root, rel);
      const lines = readText(abs).split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(SECRET_WAIVER)) continue;
        for (const re of SECRET_PATTERNS) {
          if (re.test(lines[i])) {
            hits.push({ file: `${label}/${toPosix(rel)}`, line: i + 1,
              message: `có shape connection string (${re.source}) — không bao giờ ghi credential vào đây` });
            break;
          }
        }
      }
    }
  }
  return hits;
}

export { toPosix };
