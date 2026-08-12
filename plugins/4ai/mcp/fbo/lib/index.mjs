// index.mjs — index cây App_Data/Controllers vào node:sqlite (built-in, zero dependency).
//
// Một DB mỗi program, đặt trong data root: .4ai/index/<slug>.sqlite — KHÔNG BAO GIỜ ghi vào
// thư mục program (chương trình khách là read-only tuyệt đối).
// Data root mặc định là hub; env FBO_DATA_ROOT tách nó ra khi chạy như plugin.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readSource, stripAccents } from './encoding.mjs';
import { scanController } from './xmlscan.mjs';

export const CONTROLLER_FOLDERS = [
  'Dir', 'Grid', 'Filter', 'Report', 'Lookup', 'Include', 'Templates',
  'Query', 'View', 'Post', 'Flow', 'List', 'Structure', 'Options', 'Notify',
  'EInvoice', 'BankHub', 'Dashboard', 'Allocation', 'Chat', 'Media', 'Config',
];
const SCAN_EXT = new Set(['.xml', '.f', '.txt', '.ent']);
const PARSE_EXT = new Set(['.xml', '.ent']);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS file (
  id INTEGER PRIMARY KEY,
  rel_path TEXT UNIQUE NOT NULL,
  folder TEXT NOT NULL,
  subdir TEXT,
  stem TEXT NOT NULL,
  ext TEXT NOT NULL,
  bytes INTEGER, mtime INTEGER,
  encoding TEXT, bom INTEGER, newline TEXT,
  root_tag TEXT, controller_type TEXT, table_name TEXT,
  title_vi TEXT, title_en TEXT,
  field_count INTEGER, js_chars INTEGER, sql_chars INTEGER,
  has_pair_xml INTEGER, has_pair_f INTEGER,
  fields_json TEXT, entities_json TEXT, commands_json TEXT,
  js_text TEXT, sql_text TEXT,
  search_blob TEXT
);
CREATE INDEX IF NOT EXISTS ix_file_folder ON file(folder);
CREATE INDEX IF NOT EXISTS ix_file_stem ON file(stem);
CREATE TABLE IF NOT EXISTS rel (
  src_id INTEGER NOT NULL, dst_id INTEGER NOT NULL, kind TEXT NOT NULL, detail TEXT,
  PRIMARY KEY (src_id, dst_id, kind, detail)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS ix_rel_src ON rel(src_id, kind);
CREATE INDEX IF NOT EXISTS ix_rel_dst ON rel(dst_id, kind);
CREATE TABLE IF NOT EXISTS entity_ref (
  file_id INTEGER NOT NULL, name TEXT NOT NULL, system_path TEXT,
  resolved TEXT, is_parameter INTEGER, used INTEGER
);
CREATE INDEX IF NOT EXISTS ix_ent_file ON entity_ref(file_id);
CREATE INDEX IF NOT EXISTS ix_ent_resolved ON entity_ref(resolved);
`;

export function slugFor(programPath) {
  const norm = path.resolve(programPath).replace(/\\/g, '/').toLowerCase();
  const base = path.basename(norm).replace(/[^a-z0-9]+/g, '-') || 'program';
  return `${base}-${crypto.createHash('sha256').update(norm).digest('hex').slice(0, 10)}`;
}

// Chỗ ghi index tách khỏi chỗ chứa code: khi chạy như plugin, gốc plugin bị ghi đè mỗi
// lần update nên index phải nằm ngoài (FBO_DATA_ROOT = ${CLAUDE_PLUGIN_DATA}).
export function dataRoot(hub) {
  return process.env.FBO_DATA_ROOT || hub;
}

export function indexPathFor(hub, programPath) {
  return path.join(dataRoot(hub), '.4ai', 'index', `${slugFor(programPath)}.sqlite`);
}

/** Tìm thư mục Controllers của một program. */
export function controllersRoot(programPath) {
  const candidates = [
    path.join(programPath, 'App_Data', 'Controllers'),
    path.join(programPath, 'Controllers'),
    programPath,
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
      if (CONTROLLER_FOLDERS.some((f) => fs.existsSync(path.join(c, f)))) return c;
    }
  }
  return null;
}

export function openIndex(hub, programPath, { create = false } = {}) {
  const dbPath = indexPathFor(hub, programPath);
  if (!create && !fs.existsSync(dbPath)) return null;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

function walk(root, folder, out) {
  const dir = path.join(root, folder);
  if (!fs.existsSync(dir)) return;
  const stack = [{ abs: dir, sub: '' }];
  while (stack.length > 0) {
    const { abs, sub } = stack.pop();
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.isDirectory()) {
        stack.push({ abs: path.join(abs, e.name), sub: sub ? `${sub}\\${e.name}` : e.name });
        continue;
      }
      const ext = path.extname(e.name).toLowerCase();
      if (!SCAN_EXT.has(ext)) continue;
      out.push({
        folder,
        subdir: sub || null,
        stem: path.basename(e.name, path.extname(e.name)),
        ext,
        relPath: [folder, sub, e.name].filter(Boolean).join('\\'),
        abs: path.join(abs, e.name),
      });
    }
  }
}

/**
 * Build/refresh index. Trả về thống kê.
 * @param {(msg: string) => void} [log]
 */
export function buildIndex(hub, programPath, { log } = {}) {
  const root = controllersRoot(programPath);
  if (!root) {
    throw new Error(`Không tìm thấy thư mục Controllers trong: ${programPath}. ` +
      'Đường dẫn program phải là thư mục chứa App_Data\\Controllers.');
  }

  const files = [];
  for (const folder of CONTROLLER_FOLDERS) walk(root, folder, files);

  const db = openIndex(hub, programPath, { create: true });
  db.exec('DELETE FROM rel; DELETE FROM entity_ref; DELETE FROM file;');

  const insFile = db.prepare(`INSERT INTO file
    (rel_path, folder, subdir, stem, ext, bytes, mtime, encoding, bom, newline,
     root_tag, controller_type, table_name, title_vi, title_en,
     field_count, js_chars, sql_chars, has_pair_xml, has_pair_f,
     fields_json, entities_json, commands_json, js_text, sql_text, search_blob)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insEnt = db.prepare(
    'INSERT INTO entity_ref (file_id, name, system_path, resolved, is_parameter, used) VALUES (?,?,?,?,?,?)');

  const present = new Set(files.map((f) => `${f.relPath.toLowerCase()}`));
  const pairKey = (f) => [f.folder, f.subdir, f.stem].filter(Boolean).join('\\').toLowerCase();

  let parsed = 0;
  let failed = 0;
  db.exec('BEGIN');
  for (const f of files) {
    const st = fs.statSync(f.abs);
    let src = { encoding: null, bom: false, newline: null, text: '' };
    let scan = null;
    if (PARSE_EXT.has(f.ext) && st.size < 8 * 1024 * 1024) {
      try {
        src = readSource(f.abs);
        scan = scanController(src.text, f.folder);
        parsed++;
      } catch (e) {
        failed++;
        if (log) log(`scan lỗi ${f.relPath}: ${e.message}`);
      }
    }

    const hasXml = present.has(`${pairKey(f)}.xml`);
    const hasF = present.has(`${pairKey(f)}.f`);

    const searchBlob = stripAccents([
      f.stem, f.relPath,
      scan?.titleVi ?? '', scan?.titleEn ?? '', scan?.table ?? '', scan?.controllerType ?? '',
      ...(scan?.fields ?? []).flatMap((x) => [x.name, x.labelVi ?? '', x.labelEn ?? '']),
    ].join('  '));

    const info = insFile.run(
      f.relPath, f.folder, f.subdir, f.stem, f.ext, st.size, Math.floor(st.mtimeMs),
      src.encoding, src.bom ? 1 : 0, src.newline,
      scan?.rootTag ?? null, scan?.controllerType ?? null, scan?.table ?? null,
      scan?.titleVi ?? null, scan?.titleEn ?? null,
      scan?.fields.length ?? 0, scan?.scriptChars ?? 0, scan?.sqlChars ?? 0,
      hasXml ? 1 : 0, hasF ? 1 : 0,
      scan ? JSON.stringify(scan.fields) : null,
      scan ? JSON.stringify(scan.entities) : null,
      scan ? JSON.stringify(scan.commands) : null,
      scan?.jsText ?? null, scan?.sqlText ?? null,
      searchBlob);

    const fileId = Number(info.lastInsertRowid);
    if (scan) {
      const used = new Set(scan.entityRefs);
      for (const e of scan.entities) {
        insEnt.run(fileId, e.name, e.systemPath ?? null, e.resolved ?? null,
          e.parameter ? 1 : 0, used.has(e.name) ? 1 : 0);
      }
    }
    f._id = fileId;
    f._scan = scan;
  }
  db.exec('COMMIT');

  // --- quan hệ ---
  const idByRel = new Map(files.map((f) => [f.relPath.toLowerCase(), f._id]));
  const idsByFolderStem = new Map();
  for (const f of files) {
    const k = `${f.folder}|${f.stem}`.toLowerCase();
    if (!idsByFolderStem.has(k)) idsByFolderStem.set(k, []);
    idsByFolderStem.get(k).push(f);
  }
  const insRel = db.prepare('INSERT OR IGNORE INTO rel (src_id, dst_id, kind, detail) VALUES (?,?,?,?)');

  db.exec('BEGIN');
  for (const f of files) {
    // companion: cùng stem ở thư mục khác (Dir↔Grid↔Filter↔Report)
    if (['Dir', 'Grid', 'Filter', 'Report'].includes(f.folder) && f.ext !== '.txt') {
      for (const other of ['Dir', 'Grid', 'Filter', 'Report']) {
        if (other === f.folder) continue;
        for (const t of idsByFolderStem.get(`${other}|${f.stem}`.toLowerCase()) ?? []) {
          if (t.ext === '.txt') continue;
          insRel.run(f._id, t._id, 'companion', '');
        }
      }
    }
    if (!f._scan) continue;
    // lookup: <items controller="X"> → Lookup\X
    for (const l of f._scan.lookups) {
      for (const t of idsByFolderStem.get(`Lookup|${l.controller}`.toLowerCase()) ?? []) {
        insRel.run(f._id, t._id, 'lookup', l.field);
      }
    }
    // include: entity SYSTEM → file thật
    for (const e of f._scan.entities) {
      if (!e.resolved) continue;
      const dst = idByRel.get(e.resolved.toLowerCase());
      if (dst !== undefined) insRel.run(f._id, dst, 'include', e.name);
    }
  }
  db.exec('COMMIT');

  const stats = {
    programPath: path.resolve(programPath),
    controllersRoot: root,
    files: files.length,
    parsed,
    scanFailed: failed,
    relations: db.prepare('SELECT count(*) AS n FROM rel').get().n,
    entities: db.prepare('SELECT count(*) AS n FROM entity_ref').get().n,
    byFolder: db.prepare('SELECT folder, count(*) AS n FROM file GROUP BY folder ORDER BY n DESC')
      .all().map((r) => `${r.folder}:${r.n}`).join(' '),
    customizedDir: db.prepare(
      "SELECT count(*) AS n FROM file WHERE folder='Dir' AND ext='.xml' AND has_pair_f=1").get().n,
  };
  const setMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)');
  setMeta.run('programPath', stats.programPath);
  setMeta.run('controllersRoot', root);
  setMeta.run('indexedAt', new Date().toISOString());
  setMeta.run('stats', JSON.stringify(stats));
  db.close();
  return stats;
}
