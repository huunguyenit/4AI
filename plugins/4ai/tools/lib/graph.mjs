// graph.mjs — đọc đồ thị hạt giống từ JSONL, validate, SINH RA mô tả file .sql.
//
// Từ lược đồ v3, DATABASE là nguồn thật (`sourceOfTruth.kind = "database"`) và JSONL chỉ còn
// là HẠT GIỐNG cho lần nạp đầu. Hai hệ quả nằm hết trong file này:
//
//   1. Mọi node mang `scope` (`system` cho thiết kế FBO chuẩn, `<ma_da>` cho phần riêng một
//      dự án). Node kind có `scoped: true` thì khoá thật là `<scope>|<khoá tự nhiên>` — nhờ
//      vậy bản chuẩn `system|CDTran` và bản customize `ACME|CDTran` không còn đè lên nhau.
//   2. SQL sinh ra là MERGE theo scope, KHÔNG còn DELETE sạch rồi INSERT lại. Nhiều người
//      cùng ghi một DB thì full reload là mất dữ liệu: user B chạy lúc 9h xoá sạch phần user
//      A ghi lúc 8h.
//
// Không ghi filesystem: hàm build trả về {relPath, content}, writer.mjs mới ghi. Việc THỰC THI
// script này lên DB là bước riêng (`4ai graph push`), không xảy ra ở đây.
// Tên node kind, tên cạnh, tên cột và kiểu SQL đều đọc từ data/graph-schema.json —
// file này không được hardcode field nào.

import fs from 'node:fs';
import path from 'node:path';
import { HUB, pmIdentity } from './assets.mjs';

const SCHEMA_REL = path.join('data', 'graph-schema.json');

export function loadSchema(hub = HUB) {
  const abs = path.join(hub, SCHEMA_REL);
  if (!fs.existsSync(abs)) throw new Error(`không tìm thấy ${SCHEMA_REL}`);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

/** File JSONL hạt giống, theo sourceOfTruth.seed.layout (hỗ trợ `<ma_da>`). */
function graphFiles(hub, schema) {
  const out = [];
  for (const entry of schema.sourceOfTruth.seed?.layout ?? []) {
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

/** Scope mặc định khi dữ liệu không khai — xem schema.scope.seedDefault. */
const SCOPE_MAC_DINH = 'system';

const nodeId = (kind, key) => `${kind}:${key}`;

/**
 * Khoá thật của một node. Kind có `scoped: true` thì khoá gồm cả scope, để bản chuẩn và bản
 * customize của từng khách cùng tồn tại thay vì đè lên nhau.
 */
function khoaDayDu(schema, kind, khoaTuNhien, scope) {
  const def = schema.nodeKinds[kind];
  if (!def?.scoped) return khoaTuNhien;
  return `${scope || SCOPE_MAC_DINH}|${khoaTuNhien}`;
}

/**
 * Phân giải tham chiếu cạnh (`"Controller:CDTran"` hoặc `"Controller:ACME|CDTran"`).
 *
 * Tham chiếu không ghi scope được hiểu là `system` — dữ liệu hạt giống viết trước khi có scope
 * nạp được mà không phải sửa tay từng dòng.
 */
function phanGiaiThamChieu(schema, ref) {
  const viTri = String(ref ?? '').indexOf(':');
  if (viTri < 0) return String(ref ?? '');
  const kind = ref.slice(0, viTri);
  const phanKhoa = ref.slice(viTri + 1);
  const def = schema.nodeKinds[kind];
  if (!def?.scoped || phanKhoa.includes('|')) return ref;
  return nodeId(kind, `${SCOPE_MAC_DINH}|${phanKhoa}`);
}

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
 * Nhận MỘT object node/edge đã parse vào bộ gom.
 *
 * Tách khỏi `loadGraph` vì từ lược đồ v3 có hai nguồn đi vào cùng một đồ thị: file JSONL hạt
 * giống, và object dựng thẳng trong bộ nhớ từ dataset rà soát (xem graph-sync.mjs). Cả hai
 * phải qua đúng một bộ luật — nhân đôi luật validate là cách chắc chắn nhất để hai đường rẽ
 * nhau lúc nào không biết.
 *
 * `at` chỉ để BÁO LỖI cho người đọc ({file, line} với JSONL, {file: 'dataset'} với bộ nhớ).
 */
export function nhanDoiTuong(schema, obj, at, { nodes, edges, errors }) {
  if (obj._ === 'node') {
    const kindDef = schema.nodeKinds[obj.kind];
    if (!kindDef) {
      errors.push({ ...at, message: `node kind không có trong schema: ${obj.kind}` });
      return;
    }
    const key = obj[kindDef.key];
    if (key === undefined || key === null || key === '') {
      errors.push({ ...at, message: `node ${obj.kind} thiếu khoá \`${kindDef.key}\`` });
      return;
    }
    const scope = String(obj.scope ?? '').trim() || SCOPE_MAC_DINH;
    const khoaTuNhien = String(key).trim();
    const khoa = khoaDayDu(schema, obj.kind, khoaTuNhien, scope);
    const id = nodeId(obj.kind, khoa);
    const dup = nodes.get(id);
    if (dup) {
      errors.push({ ...at, message: `node trùng khoá ${id} — đã khai ở ${dup._at.file}:${dup._at.line ?? '?'}` });
      return;
    }
    const chapNhan = new Set([...kindDef.props, ...(schema.sql.auditColumns?.items ?? [])]);
    for (const p of Object.keys(obj)) {
      if (p === '_' || p === 'kind') continue;
      // `undefined` là "không khai", không phải "khai sai" — dataset dựng node bằng spread nên
      // trường vắng mặt hiện ra như prop có giá trị undefined. Bắt lỗi ở đây sẽ báo ầm ĩ về
      // những trường mà người viết còn không cố ý đặt vào.
      if (!chapNhan.has(p) && obj[p] !== undefined) {
        errors.push({ ...at, message: `node ${obj.kind} có prop lạ \`${p}\` — thêm vào schema hoặc bỏ đi` });
      }
    }
    nodes.set(id, { ...obj, scope, _id: id, _key: khoa, _keyTuNhien: khoaTuNhien, _at: at });
    return;
  }

  if (obj._ === 'edge') {
    const def = findEdgeType(schema, obj.type);
    if (!def) {
      errors.push({ ...at, message: `loại cạnh không hợp lệ: ${obj.type} — chỉ dùng loại đã khai trong edgeTypes hoặc reviewEdgeTypes` });
      return;
    }
    if (!obj.from || !obj.to) {
      errors.push({ ...at, message: 'cạnh thiếu `from` hoặc `to` (dạng "Kind:key")' });
      return;
    }
    edges.push({
      ...obj,
      from: phanGiaiThamChieu(schema, obj.from),
      to: phanGiaiThamChieu(schema, obj.to),
      _at: at,
    });
    return;
  }

  errors.push({ ...at, message: `dòng phải có "_" là "node" hoặc "edge", nhận được: ${JSON.stringify(obj._)}` });
}

/**
 * Đọc mọi JSONL hạt giống thành {nodes, edges, errors}.
 * Dòng rỗng và dòng bắt đầu bằng `//` được bỏ qua — để chú thích được trong file dữ liệu.
 */
export function loadGraph(hub = HUB, schema = loadSchema(hub)) {
  const gom = { nodes: new Map(), edges: [], errors: [] };

  for (const abs of graphFiles(hub, schema)) {
    const rel = path.relative(hub, abs).replace(/\\/g, '/');
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw || raw.startsWith('//')) continue;
      const at = { file: rel, line: i + 1 };
      try {
        nhanDoiTuong(schema, JSON.parse(raw), at, gom);
      } catch (e) {
        gom.errors.push({ ...at, message: `JSON không parse được: ${e.message}` });
      }
    }
  }
  return gom;
}

/**
 * Dựng đồ thị từ object trong bộ nhớ (dataset rà soát), qua ĐÚNG bộ luật của loadGraph.
 * @returns {{nodes: Map, edges: Array, errors: Array}}
 */
export function graphTuObject(schema, { nodes = [], edges = [] } = {}, nhan = 'dataset') {
  const gom = { nodes: new Map(), edges: [], errors: [] };
  for (const o of [...nodes, ...edges]) nhanDoiTuong(schema, o, { file: nhan }, gom);
  return gom;
}

/**
 * Tách `"Status:DD"` → `{kind: 'Status', key: 'DD'}`.
 *
 * Cần vì một cạnh có thể trỏ tới node KHÔNG nằm trong lô đang ghi: đồng bộ tầng dự án sinh
 * `HAS_STATUS → Status:DD`, mà node Status là lookup tĩnh đã nạp sẵn trong DB từ hạt giống.
 * Bắt buộc phải có node trong lô mới sinh được SQL là sai — nó ép mỗi lần đồng bộ một dự án
 * phải kéo theo toàn bộ lookup dùng chung.
 */
function tachRef(ref) {
  const i = String(ref ?? '').indexOf(':');
  // Trả `_key` cùng tên với node thật để chỗ dùng không phải phân biệt hai hình dạng. Phần
  // khoá ở đây đã là khoá ĐẦY ĐỦ — `phanGiaiThamChieu` gắn scope trước khi tới đây.
  const key = i < 0 ? String(ref ?? '') : ref.slice(i + 1);
  return { kind: i < 0 ? '' : ref.slice(0, i), _key: key, _ngoai: true };
}

/**
 * Cạnh trỏ tới node có thật, và cặp (kind từ, kind tới) nằm trong allowedPairs.
 *
 * @param {{kindNgoai?: string[]}} [opts] - kind được phép tham chiếu mà KHÔNG có trong lô này
 *   (node đã nằm sẵn trong DB). Mặc định rỗng = nghiêm ngặt như cũ, để `graph check` vẫn bắt
 *   được lỗi gõ nhầm khoá. Đường đồng bộ dự án khai `['Status']`.
 */
export function validateGraph(schema, { nodes, edges }, opts = {}) {
  const errors = [];
  const kindNgoai = new Set(opts.kindNgoai ?? []);
  const giaiQuyet = (ref) => {
    const co = nodes.get(ref);
    if (co) return co;
    const { kind } = tachRef(ref);
    // Cho phép trỏ ra ngoài lô, nhưng CHỈ với kind đã khai — không thì một khoá gõ nhầm sẽ
    // lặng lẽ trôi qua thành "tham chiếu ngoài".
    return kindNgoai.has(kind) && schema.nodeKinds[kind] ? { kind, _ngoai: true } : null;
  };

  for (const e of edges) {
    const from = giaiQuyet(e.from);
    const to = giaiQuyet(e.to);
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

/** View gộp `(node_id, scope)` của mọi bảng node — để xoá cạnh theo phạm vi bằng một phép join. */
const VIEW_NODE = 'vw_GraphNode';

/** Table value constructor của SQL Server chặn ở 1000 dòng mỗi INSERT … VALUES. */
const MAX_VALUES_ROWS = 1000;

function chiaLo(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const colType = (sql, prop) => sql.columnTypes[prop] ?? sql.defaultColumnType;
const nodeTable = (sql, kind) => `${sql.schemaName}.${q(sql.nodeTablePrefix + kind)}`;
const edgeTable = (sql, type) => `${sql.schemaName}.${q(type)}`;

/**
 * Cột của một node kind: khoá luôn đứng đầu, rồi prop theo thứ tự schema, rồi cột audit.
 *
 * Với kind `scoped`, cột khoá chứa khoá ĐẦY ĐỦ (`<scope>|<khoá tự nhiên>`) — cột `scope` đứng
 * riêng để lọc/`MERGE` theo phạm vi mà không phải cắt chuỗi.
 */
function nodeColumns(schema, kind) {
  const def = schema.nodeKinds[kind];
  const rest = def.props.filter((p) => p !== def.key);
  return [def.key, ...rest, ...(schema.sql.auditColumns?.items ?? [])];
}

/**
 * Literal của một ô node. Cột khoá lấy khoá ĐẦY ĐỦ (`<scope>|<khoá>`), không phải khoá tự nhiên.
 *
 * `capNhatLuc` cố tình dùng `SYSUTCDATETIME()` của SQL Server chứ không phải giờ máy client:
 * giữ được dấu thời gian đúng mà file sinh ra vẫn TẤT ĐỊNH — đóng dấu giờ ở client thì chạy
 * hai lần ra hai file khác nhau, và mọi phép so sánh "script có đổi không" thành vô nghĩa.
 */
function nodeLiteral(schema, sql, kind, row, col, boi) {
  if (col === 'capNhatLuc') return 'SYSUTCDATETIME()';
  if (col === 'capNhatBoi') return lit(row.capNhatBoi ?? boi ?? '', colType(sql, col));
  const giaTri = col === schema.nodeKinds[kind].key ? row._key : row[col];
  return lit(giaTri, colType(sql, col));
}

/**
 * Sinh script nạp.
 *
 * @param {object} schema
 * @param {{nodes: Map, edges: Array}} graph
 * @param {{scopes?: string[], boi?: string, boSung?: boolean}} [opts] - `scopes` giới hạn phạm
 *   vi lần ghi này; bỏ trống = suy từ chính dữ liệu đang có. `boi` là mã người chạy, ghi vào
 *   cột audit. `boSung` xem chú thích ngay dưới.
 *
 * HAI CHẾ ĐỘ GHI, và chọn nhầm là mất dữ liệu:
 *
 *   mặc định (`boSung` falsy) — "lô này LÀ toàn bộ sự thật của các scope này". Sau khi MERGE,
 *     mọi dòng cùng scope mà không có trong lô đều bị XOÁ. Đúng cho `graph build`,
 *     `graph experience`, đường báo cáo: chúng quét lại từ đầu nên lô luôn đầy đủ.
 *   `boSung: true` — "thêm/sửa đúng những dòng trong lô, không đụng gì khác". Bắt buộc cho
 *     mọi đường ghi TỪNG BẢN GHI MỘT (`playbook add`): ở đó lô chỉ có một dòng, và luật xoá
 *     theo scope sẽ hiểu thành "dự án này chỉ còn đúng một hướng dẫn" rồi xoá sạch phần đã
 *     ghi những lần trước. Cạnh cũng chuyển sang chèn-nếu-chưa-có thay vì xoá-rồi-dựng-lại.
 */
export function emitSql(schema, { nodes, edges }, opts = {}) {
  const sql = schema.sql;
  const boSung = !!opts.boSung;
  const L = [];
  const kinds = Object.keys(schema.nodeKinds);
  const edgeDefs = allEdgeTypeDefs(schema);
  const types = edgeDefs.map((t) => t.type);

  // Phạm vi lần ghi này. MERGE và DELETE đều bị nhốt trong đây — đó là thứ giữ cho user B
  // không xoá dữ liệu của user A. Suy từ dữ liệu nếu caller không chỉ định.
  const scopes = opts.scopes?.length
    ? [...new Set(opts.scopes)].sort()
    : [...new Set([...nodes.values()].map((n) => n.scope || SCOPE_MAC_DINH))].sort();
  const scopeList = scopes.map((s) => lit(s, 'NVARCHAR')).join(', ');

  L.push('-- Sinh bởi `node tools/4ai.mjs graph build` — KHÔNG sửa tay.');
  L.push('-- DATABASE là nguồn thật (lược đồ v3). JSONL chỉ là hạt giống cho lần nạp đầu.');
  L.push(boSung
    ? '-- Chiến lược nạp: BỔ SUNG — chỉ MERGE các dòng trong lô, KHÔNG xoá dòng nào.'
    : `-- Chiến lược nạp: ${sql.reloadStrategy.kind} — MERGE theo khoá, GIỚI HẠN trong scope bên dưới.`);
  L.push(`-- Phạm vi lần ghi này: ${scopes.join(', ')}`);
  L.push(boSung
    ? '-- Không có DELETE nào: lô này là một phần bổ sung, không phải bản đầy đủ của scope.'
    : '-- Không có DELETE toàn bảng: dữ liệu ngoài các scope này KHÔNG bị đụng tới.');
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

  // ---- di trú: bảng đã tồn tại từ lược đồ cũ thì `IF OBJECT_ID IS NULL CREATE` bỏ qua, nên
  // cột mới không bao giờ được thêm. Bổ sung từng cột một, idempotent.
  L.push('-- Bổ sung cột còn thiếu cho bảng đã tồn tại từ lược đồ cũ.');
  for (const kind of kinds) {
    for (const c of nodeColumns(schema, kind)) {
      L.push(`IF COL_LENGTH('${sql.schemaName}.${sql.nodeTablePrefix}${kind}', '${c}') IS NULL `
        + `ALTER TABLE ${nodeTable(sql, kind)} ADD ${q(c)} ${colType(sql, c)} NULL;`);
    }
  }
  for (const def of edgeDefs) {
    for (const p of edgePropsFor(schema, def)) {
      L.push(`IF COL_LENGTH('${sql.schemaName}.${def.type}', '${p}') IS NULL `
        + `ALTER TABLE ${edgeTable(sql, def.type)} ADD ${q(p)} ${colType(sql, p)} NULL;`);
    }
  }
  L.push('GO');
  L.push('');

  // ---- di trú một lần: dữ liệu lược đồ cũ có khoá TRẦN (`CDTran`) và chưa có scope.
  // Đổi khoá TẠI CHỖ bằng UPDATE chứ không xoá-rồi-chèn: `$node_id` của SQL Server graph giữ
  // nguyên, nhờ vậy mọi cạnh đang trỏ tới node đó vẫn còn hiệu lực. Xoá rồi chèn lại sẽ sinh
  // `$node_id` mới và bỏ lại một đống cạnh trỏ vào hư không.
  // `WHERE scope IS NULL` làm cả khối này idempotent — chạy lần hai không đụng gì nữa.
  L.push('-- Di trú một lần từ lược đồ cũ: gắn scope, và thêm tiền tố scope vào khoá.');
  for (const kind of kinds) {
    const def = schema.nodeKinds[kind];
    const dat = `${q('scope')} = ${lit(SCOPE_MAC_DINH, 'NVARCHAR')}`;
    L.push(def.scoped
      ? `UPDATE ${nodeTable(sql, kind)} SET ${q(def.key)} = ${lit(SCOPE_MAC_DINH + '|', 'NVARCHAR')} + ${q(def.key)}, ${dat} WHERE ${q('scope')} IS NULL;`
      : `UPDATE ${nodeTable(sql, kind)} SET ${dat} WHERE ${q('scope')} IS NULL;`);
  }
  L.push('GO');
  L.push('');

  // Gộp `(node_id, scope)` của mọi bảng node để xoá cạnh theo phạm vi mà không phải viết một
  // nhánh riêng cho từng cặp kind. CREATE OR ALTER nên chạy lại luôn khớp lược đồ mới nhất.
  L.push(`CREATE OR ALTER VIEW ${sql.schemaName}.${q(VIEW_NODE)} AS`);
  L.push(kinds.map((kind) =>
    `SELECT $node_id AS ${q('node_id')}, ${q('scope')} FROM ${nodeTable(sql, kind)}`).join('\nUNION ALL\n') + ';');
  L.push('GO');
  L.push('');

  L.push('-- ---------------------------------------------------------- nạp');
  L.push('BEGIN TRANSACTION;');
  L.push('');

  // Cạnh trong phạm vi bị xoá trước rồi dựng lại: cạnh không có khoá tự nhiên để MERGE, và
  // số lượng nhỏ nên dựng lại rẻ hơn nhiều so với nghĩ ra khoá nhân tạo cho chúng.
  // CHỈ xoá những loại cạnh mà lần chạy này thật sự có dữ liệu để dựng lại. Xoá mọi loại là
  // sai: một lần nạp hạt giống (chỉ có DEPENDS_ON/USES/HAS_VERDICT) sẽ xoá sạch BELONGS_TO,
  // IN_PHASE, HAS_PM_REVIEW… của tầng dự án rồi không dựng lại được — mất dữ liệu không có
  // trong nguồn nào.
  const loaiCanhCoTrongLanNay = [...new Set(edges.map((e) => e.type))].sort();
  if (loaiCanhCoTrongLanNay.length && !boSung) {
    L.push('-- Cạnh trong phạm vi: xoá rồi dựng lại (cạnh không có khoá tự nhiên để MERGE).');
    L.push(`-- Chỉ đụng ${loaiCanhCoTrongLanNay.length} loại có mặt trong lần chạy này; loại khác giữ nguyên.`);
    for (const type of loaiCanhCoTrongLanNay) {
      L.push(`DELETE e FROM ${edgeTable(sql, type)} e`);
      L.push(`  WHERE EXISTS (SELECT 1 FROM ${sql.schemaName}.${q(VIEW_NODE)} n`);
      L.push(`    WHERE n.${q('node_id')} = e.$from_id AND n.${q('scope')} IN (${scopeList}));`);
    }
    L.push('');
  }

  // node: nhóm theo kind, sắp theo khoá để chạy lại ra file giống hệt từng byte.
  const byKind = new Map(kinds.map((k) => [k, []]));
  for (const n of nodes.values()) byKind.get(n.kind).push(n);
  for (const kind of kinds) {
    const rows = byKind.get(kind).sort((a, b) => (a._key < b._key ? -1 : 1));
    if (!rows.length) continue;
    const cols = nodeColumns(schema, kind);
    const keyCol = schema.nodeKinds[kind].key;
    const capNhat = cols.filter((c) => c !== keyCol);
    const tmp = `#src_${kind}`;

    // Qua bảng tạm chứ không MERGE thẳng từ VALUES: table value constructor của SQL Server
    // chặn ở 1000 dòng, mà ExperienceFact thì đếm bằng chục nghìn. Bảng tạm cũng cho phép
    // tách phép DELETE ra khỏi MERGE — với dữ liệu chia lô thì `NOT MATCHED BY SOURCE` sẽ
    // xoá nhầm mọi dòng không nằm trong lô đang xử lý.
    L.push(`-- ${kind}: ${rows.length} node`);
    L.push(`CREATE TABLE ${tmp} (${cols.map((c) => `${q(c)} ${colType(sql, c)}`).join(', ')});`);
    for (const lo of chiaLo(rows, MAX_VALUES_ROWS)) {
      L.push(`INSERT INTO ${tmp} (${cols.map(q).join(', ')}) VALUES`);
      L.push(lo.map((r) =>
        `  (${cols.map((c) => nodeLiteral(schema, sql, kind, r, c, opts.boi)).join(', ')})`).join(',\n') + ';');
    }
    L.push(`MERGE ${nodeTable(sql, kind)} AS t USING ${tmp} AS s`);
    L.push(`ON t.${q(keyCol)} = s.${q(keyCol)}`);
    L.push(`WHEN MATCHED THEN UPDATE SET ${capNhat.map((c) => `t.${q(c)} = s.${q(c)}`).join(', ')}`);
    L.push(`WHEN NOT MATCHED BY TARGET THEN INSERT (${cols.map(q).join(', ')}) VALUES (${cols.map((c) => `s.${q(c)}`).join(', ')});`);
    // Xoá chỉ trong phạm vi lần ghi này — node của scope khác nằm ngoài tầm với. Chế độ bổ
    // sung bỏ hẳn bước này: lô một dòng không phải là tuyên bố "scope này chỉ còn một dòng".
    if (!boSung) {
      L.push(`DELETE t FROM ${nodeTable(sql, kind)} t`);
      L.push(`  WHERE t.${q('scope')} IN (${scopeList})`);
      L.push(`    AND NOT EXISTS (SELECT 1 FROM ${tmp} s WHERE s.${q(keyCol)} = t.${q(keyCol)});`);
    }
    L.push(`DROP TABLE ${tmp};`);
    L.push('');
  }

  // cạnh: gom theo (type, kind từ, kind tới) để một INSERT…SELECT lo cả nhóm.
  // Lấy kind/khoá TỪ CHÍNH THAM CHIẾU, không đòi node phải có mặt trong lô: cạnh trỏ sang
  // node đã nạp sẵn trong DB (vd Status) vẫn phải sinh được. Phép JOIN trong SQL bên dưới mới
  // là chỗ quyết định cạnh có nối được hay không, và nó chạy trên DB thật.
  const groups = new Map();
  for (const e of edges) {
    const from = nodes.get(e.from) ?? tachRef(e.from);
    const to = nodes.get(e.to) ?? tachRef(e.to);
    if (!schema.nodeKinds[from.kind] || !schema.nodeKinds[to.kind]) continue;
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
    // Cũng chia lô như node: một cặp (type, kind, kind) có thể vượt 1000 cạnh.
    for (const lo of chiaLo(rows, MAX_VALUES_ROWS)) {
      L.push(`INSERT INTO ${edgeTable(sql, type)} ($from_id, $to_id${props.length ? ', ' + props.map(q).join(', ') : ''})`);
      L.push(`SELECT f.$node_id, t.$node_id${props.length ? ', ' + props.map((p) => `v.${q(p)}`).join(', ') : ''}`);
      L.push('FROM (VALUES');
      L.push(lo.map(({ e, from, to }) =>
        `  (${lit(from._key, 'NVARCHAR')}, ${lit(to._key, 'NVARCHAR')}` +
        (props.length ? ', ' + props.map((p) => lit(e[p], colType(sql, p))).join(', ') : '') + ')').join(',\n'));
      L.push(`) AS v(${['fk', 'tk', ...props].map(q).join(', ')})`);
      L.push(`JOIN ${nodeTable(sql, fromKind)} f ON f.${q(schema.nodeKinds[fromKind].key)} = v.${q('fk')}`);
      // Chế độ bổ sung không xoá cạnh cũ, nên phải tự chống trùng: gõ `playbook add` hai lần
      // cùng một hướng dẫn thì MERGE node ghi đè đúng một dòng, còn cạnh sẽ thành hai bản sao
      // nếu không chặn ở đây.
      L.push(`JOIN ${nodeTable(sql, toKind)} t ON t.${q(schema.nodeKinds[toKind].key)} = v.${q('tk')}`
        + (boSung ? '' : ';'));
      if (boSung) {
        L.push(`WHERE NOT EXISTS (SELECT 1 FROM ${edgeTable(sql, type)} e`);
        L.push('  WHERE e.$from_id = f.$node_id AND e.$to_id = t.$node_id);');
      }
    }
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
export function buildGraphArtifact(hub = HUB, opts = {}) {
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
    artifact: {
      relPath: schema.buildPipeline.outputPath,
      content: emitSql(schema, graph, { boi: opts.boi ?? pmIdentity(hub).maNv, scopes: opts.scopes }),
    },
    errors: [],
    stats,
  };
}
