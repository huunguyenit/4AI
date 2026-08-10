// graph.mjs — đọc đồ thị từ JSONL trong repo, validate, SINH RA mô tả file .sql.
//
// Không ghi filesystem: hàm build trả về {relPath, content}, writer.mjs mới ghi.
// Tên node kind, tên cạnh, tên cột và kiểu SQL đều đọc từ data/graph-schema.json —
// file này không được hardcode field nào.

import fs from 'node:fs';
import path from 'node:path';
import { HUB } from './assets.mjs';

const SCHEMA_REL = path.join('data', 'graph-schema.json');

export function loadSchema(hub = HUB) {
  const abs = path.join(hub, SCHEMA_REL);
  if (!fs.existsSync(abs)) throw new Error(`không tìm thấy ${SCHEMA_REL}`);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

/** Mọi file JSONL là nguồn của đồ thị, theo sourceOfTruth.layout (hỗ trợ `<ma_da>`). */
function graphFiles(hub, schema) {
  const out = [];
  for (const entry of schema.sourceOfTruth.layout) {
    const rel = entry.path;
    if (rel.includes('<ma_da>')) {
      const [prefix] = rel.split('<ma_da>');
      const root = path.join(hub, prefix);
      if (!fs.existsSync(root)) continue;
      for (const d of fs.readdirSync(root, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const p = path.join(root, d.name, path.basename(rel));
        if (fs.existsSync(p)) out.push(p);
      }
    } else {
      const p = path.join(hub, rel);
      if (fs.existsSync(p)) out.push(p);
    }
  }
  return out.sort();
}

const nodeId = (kind, key) => `${kind}:${key}`;

/** Cả hai bộ cạnh (kỹ thuật + rà soát) đều hợp lệ — tra theo tên, không quan tâm nằm bộ nào. */
function allEdgeTypeDefs(schema) {
  return [...schema.edgeTypes.items, ...(schema.reviewEdgeTypes?.items ?? [])];
}
function findEdgeType(schema, type) {
  return allEdgeTypeDefs(schema).find((t) => t.type === type);
}
function edgePropsFor(schema, def) {
  return schema.edgeTypes.items.includes(def) ? schema.edgeTypes.edgeProps : schema.reviewEdgeTypes.edgeProps;
}

/**
 * Đọc mọi JSONL thành {nodes, edges, errors}.
 * Dòng rỗng và dòng bắt đầu bằng `//` được bỏ qua — để chú thích được trong file dữ liệu.
 */
export function loadGraph(hub = HUB, schema = loadSchema(hub)) {
  const nodes = new Map();
  const edges = [];
  const errors = [];

  for (const abs of graphFiles(hub, schema)) {
    const rel = path.relative(hub, abs).replace(/\\/g, '/');
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw || raw.startsWith('//')) continue;
      let obj;
      try {
        obj = JSON.parse(raw);
      } catch (e) {
        errors.push({ file: rel, line: i + 1, message: `JSON không parse được: ${e.message}` });
        continue;
      }
      const at = { file: rel, line: i + 1 };
      if (obj._ === 'node') {
        const kindDef = schema.nodeKinds[obj.kind];
        if (!kindDef) {
          errors.push({ ...at, message: `node kind không có trong schema: ${obj.kind}` });
          continue;
        }
        const key = obj[kindDef.key];
        if (key === undefined || key === null || key === '') {
          errors.push({ ...at, message: `node ${obj.kind} thiếu khoá \`${kindDef.key}\`` });
          continue;
        }
        const id = nodeId(obj.kind, String(key).trim());
        const dup = nodes.get(id);
        if (dup) {
          errors.push({ ...at, message: `node trùng khoá ${id} — đã khai ở ${dup._at.file}:${dup._at.line}` });
          continue;
        }
        for (const p of Object.keys(obj)) {
          if (p === '_' || p === 'kind') continue;
          if (!kindDef.props.includes(p)) {
            errors.push({ ...at, message: `node ${obj.kind} có prop lạ \`${p}\` — thêm vào schema hoặc bỏ đi` });
          }
        }
        nodes.set(id, { ...obj, _id: id, _key: String(key).trim(), _at: at });
      } else if (obj._ === 'edge') {
        const def = findEdgeType(schema, obj.type);
        if (!def) {
          errors.push({ ...at, message: `loại cạnh không hợp lệ: ${obj.type} — chỉ dùng loại đã khai trong edgeTypes hoặc reviewEdgeTypes` });
          continue;
        }
        if (!obj.from || !obj.to) {
          errors.push({ ...at, message: 'cạnh thiếu `from` hoặc `to` (dạng "Kind:key")' });
          continue;
        }
        edges.push({ ...obj, _at: at });
      } else {
        errors.push({ ...at, message: `dòng phải có "_" là "node" hoặc "edge", nhận được: ${JSON.stringify(obj._)}` });
      }
    }
  }
  return { nodes, edges, errors };
}

/** Cạnh trỏ tới node có thật, và cặp (kind từ, kind tới) nằm trong allowedPairs. */
export function validateGraph(schema, { nodes, edges }) {
  const errors = [];
  for (const e of edges) {
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    if (!from) errors.push({ ...e._at, message: `cạnh ${e.type}: không có node \`${e.from}\`` });
    if (!to) errors.push({ ...e._at, message: `cạnh ${e.type}: không có node \`${e.to}\`` });
    if (!from || !to) continue;
    const def = findEdgeType(schema, e.type);
    if (def.allowedPairs !== '*') {
      const ok = def.allowedPairs.some(([a, b]) => a === from.kind && b === to.kind);
      if (!ok) {
        errors.push({ ...e._at,
          message: `cạnh ${e.type} không cho phép (${from.kind} → ${to.kind}); cặp hợp lệ: ${def.allowedPairs.map((p) => p.join('→')).join(', ')}` });
      }
    }
    const props = edgePropsFor(schema, def);
    for (const p of Object.keys(e)) {
      if (['_', 'type', 'from', 'to', '_at'].includes(p)) continue;
      if (!props.includes(p)) {
        errors.push({ ...e._at, message: `cạnh ${e.type} có prop lạ \`${p}\`` });
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------- sinh SQL

const q = (s) => `[${String(s).replace(/]/g, ']]')}]`;

function lit(value, sqlType) {
  if (value === undefined || value === null || value === '') return 'NULL';
  if (Array.isArray(value) || (typeof value === 'object')) {
    return `N'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  if (sqlType === 'BIT') {
    if (value === true || value === 1 || value === '1' || value === 'true') return '1';
    if (value === false || value === 0 || value === '0' || value === 'false') return '0';
    return 'NULL';
  }
  if (sqlType.startsWith('DECIMAL')) {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : 'NULL';
  }
  return `N'${String(value).replace(/'/g, "''")}'`;
}

const colType = (sql, prop) => sql.columnTypes[prop] ?? sql.defaultColumnType;
const nodeTable = (sql, kind) => `${sql.schemaName}.${q(sql.nodeTablePrefix + kind)}`;
const edgeTable = (sql, type) => `${sql.schemaName}.${q(type)}`;

/** Cột của một node kind: khoá luôn đứng đầu, rồi các prop còn lại theo thứ tự schema. */
function nodeColumns(schema, kind) {
  const def = schema.nodeKinds[kind];
  const rest = def.props.filter((p) => p !== def.key);
  return [def.key, ...rest];
}

export function emitSql(schema, { nodes, edges }) {
  const sql = schema.sql;
  const L = [];
  const kinds = Object.keys(schema.nodeKinds);
  const edgeDefs = allEdgeTypeDefs(schema);
  const types = edgeDefs.map((t) => t.type);

  L.push('-- Sinh bởi `node tools/4ai.mjs graph build` — KHÔNG sửa tay.');
  L.push('-- Nguồn sự thật là các file JSONL trong repo; file này chỉ là chỉ mục dựng lại được.');
  L.push(`-- Chiến lược nạp: ${sql.reloadStrategy.kind} (xoá sạch rồi nạp lại, cạnh trước node sau).`);
  L.push('-- Chạy trên DB nội bộ 4AI. Không chạy trên DB nghiệp vụ hay DB của khách.');
  L.push('SET NOCOUNT ON;');
  L.push('SET XACT_ABORT ON;');
  L.push('GO');
  L.push('');

  L.push('-- ---------------------------------------------------------- lược đồ');
  for (const kind of kinds) {
    const cols = nodeColumns(schema, kind);
    const defs = cols.map((c, i) =>
      `  ${q(c)} ${colType(sql, c)} ${i === 0 ? 'NOT NULL PRIMARY KEY' : 'NULL'}`);
    L.push(`IF OBJECT_ID('${sql.schemaName}.${sql.nodeTablePrefix}${kind}') IS NULL`);
    L.push(`CREATE TABLE ${nodeTable(sql, kind)} (`);
    L.push(defs.join(',\n'));
    L.push(') AS NODE;');
    L.push('GO');
  }
  L.push('');
  for (const def of edgeDefs) {
    const props = edgePropsFor(schema, def);
    const defs = props.map((p) => `  ${q(p)} ${colType(sql, p)} NULL`);
    L.push(`IF OBJECT_ID('${sql.schemaName}.${def.type}') IS NULL`);
    L.push(`CREATE TABLE ${edgeTable(sql, def.type)} (`);
    L.push(defs.join(',\n'));
    L.push(') AS EDGE;');
    L.push('GO');
  }
  L.push('');

  L.push('-- ---------------------------------------------------------- nạp lại');
  L.push('BEGIN TRANSACTION;');
  for (const type of types) L.push(`DELETE FROM ${edgeTable(sql, type)};`);
  for (const kind of kinds) L.push(`DELETE FROM ${nodeTable(sql, kind)};`);
  L.push('');

  // node: nhóm theo kind, sắp theo khoá để chạy lại ra file giống hệt từng byte.
  const byKind = new Map(kinds.map((k) => [k, []]));
  for (const n of nodes.values()) byKind.get(n.kind).push(n);
  for (const kind of kinds) {
    const rows = byKind.get(kind).sort((a, b) => (a._key < b._key ? -1 : 1));
    if (!rows.length) continue;
    const cols = nodeColumns(schema, kind);
    L.push(`INSERT INTO ${nodeTable(sql, kind)} (${cols.map(q).join(', ')}) VALUES`);
    L.push(rows.map((r) => `  (${cols.map((c) => lit(r[c], colType(sql, c))).join(', ')})`).join(',\n') + ';');
    L.push('');
  }

  // cạnh: gom theo (type, kind từ, kind tới) để một INSERT…SELECT lo cả nhóm.
  const groups = new Map();
  for (const e of edges) {
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    const gk = `${e.type}|${from.kind}|${to.kind}`;
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push({ e, from, to });
  }
  for (const gk of [...groups.keys()].sort()) {
    const [type, fromKind, toKind] = gk.split('|');
    const rows = groups.get(gk).sort((a, b) =>
      (a.from._key + a.to._key < b.from._key + b.to._key ? -1 : 1));
    const props = edgePropsFor(schema, findEdgeType(schema, type));
    L.push(`-- ${type}: ${fromKind} → ${toKind} (${rows.length})`);
    L.push(`INSERT INTO ${edgeTable(sql, type)} ($from_id, $to_id${props.length ? ', ' + props.map(q).join(', ') : ''})`);
    L.push(`SELECT f.$node_id, t.$node_id${props.length ? ', ' + props.map((p) => `v.${q(p)}`).join(', ') : ''}`);
    L.push('FROM (VALUES');
    L.push(rows.map(({ e, from, to }) =>
      `  (${lit(from._key, 'NVARCHAR')}, ${lit(to._key, 'NVARCHAR')}` +
      (props.length ? ', ' + props.map((p) => lit(e[p], colType(sql, p))).join(', ') : '') + ')').join(',\n'));
    L.push(`) AS v(${['fk', 'tk', ...props].map(q).join(', ')})`);
    L.push(`JOIN ${nodeTable(sql, fromKind)} f ON f.${q(schema.nodeKinds[fromKind].key)} = v.${q('fk')}`);
    L.push(`JOIN ${nodeTable(sql, toKind)} t ON t.${q(schema.nodeKinds[toKind].key)} = v.${q('tk')};`);
    L.push('');
  }

  L.push('COMMIT TRANSACTION;');
  L.push('GO');

  return L.join('\n');
}

/**
 * Đọc → validate → sinh mô tả file. KHÔNG ghi đĩa.
 * @returns {{artifact: {relPath: string, content: string}|null, errors: object[], stats: object}}
 */
export function buildGraphArtifact(hub = HUB) {
  const schema = loadSchema(hub);
  const graph = loadGraph(hub, schema);
  const errors = [...graph.errors, ...validateGraph(schema, graph)];
  const stats = {
    nodes: graph.nodes.size,
    edges: graph.edges.length,
    byKind: Object.fromEntries(Object.keys(schema.nodeKinds)
      .map((k) => [k, [...graph.nodes.values()].filter((n) => n.kind === k).length])
      .filter(([, c]) => c > 0)),
    byEdgeType: Object.fromEntries(allEdgeTypeDefs(schema)
      .map((t) => [t.type, graph.edges.filter((e) => e.type === t.type).length])
      .filter(([, c]) => c > 0)),
  };
  if (errors.length) return { artifact: null, errors, stats };
  return {
    artifact: { relPath: schema.buildPipeline.outputPath, content: emitSql(schema, graph) },
    errors: [],
    stats,
  };
}
