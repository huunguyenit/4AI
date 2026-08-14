// qlda-metadata.mjs — Dựng metadata domain QLDA (dự án · yêu cầu · hạn hoàn thành) từ data/qlda.json.
//
// data/qlda.json là NGUỒN DUY NHẤT của tên bảng, tên cột, enum và caveat truy vấn của QLDA.
// KHÔNG hardcode tên cột ở file này: thêm/đổi cột thì sửa qlda.json, module tự nhận.
// Cột và bảng được đánh dấu nhạy cảm bị loại khỏi metadata trước khi trả về — thứ không
// nằm trong metadata thì SQL Validator sẽ chặn ở bước sau.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripAccents } from '../../mcp/fbo/lib/encoding.mjs';
import { dataRoot } from '../../mcp/fbo/lib/index.mjs';

const MODULE_HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_REL = path.join('data', 'qlda.json');
const LOCAL_REL = path.join('data', 'qlda.local.json');

/** configPath -> { mtimeMs, json } — nạp lại khi file đổi, không cache vĩnh viễn. */
const configCache = new Map();

/** Token sync-time `{PMName}`/`{PMDept}` — chưa gán từ local thì không dùng làm mã NV. */
export function isPmPlaceholder(value) {
  const s = String(value ?? '').trim();
  return !s || /^\{[A-Za-z0-9_]+\}$/.test(s);
}

/**
 * Đọc `pm` từ qlda.local.json ở DATA ROOT (per cài đặt) — KHÔNG phải `root` trực tiếp.
 * `dataRoot()` trả `FBO_DATA_ROOT`/`${CLAUDE_PLUGIN_DATA}` khi chạy dưới dạng plugin (thư
 * mục ghi được, sống sót qua update), hoặc chính `root` khi chạy dev (env chưa đặt — hành vi
 * cũ, không đổi). Chạy như plugin mà đọc thẳng `root` (gốc gói cài) sẽ trỏ vào chỗ read-only
 * bị ghi đè mỗi lần update.
 * @returns {{maNv?: string, boPhanLt?: string}|null}
 */
function loadLocalPm(root) {
  const file = path.join(dataRoot(root), LOCAL_REL);
  if (!fs.existsSync(file)) return null;
  try {
    const local = JSON.parse(fs.readFileSync(file, 'utf8'));
    return local?.pm && typeof local.pm === 'object' ? local.pm : null;
  } catch {
    return null;
  }
}

/** Đọc thẳng data/qlda.local.json ở data root — dùng cho overlay cấu trúc QLDA bên dưới. */
function loadLocalFile(root) {
  const file = path.join(dataRoot(root), LOCAL_REL);
  if (!fs.existsSync(file)) return {};
  try {
    const local = JSON.parse(fs.readFileSync(file, 'utf8'));
    return local && typeof local === 'object' ? local : {};
  } catch {
    return {};
  }
}

/**
 * Gán review.pm từ qlda.local.json khi qlda.json còn placeholder hoặc local có giá trị.
 * Không mutate object trong cache — trả bản shallow-clone phần `review.pm`.
 */
function overlayPmFromLocal(json, root) {
  if (!json) return null;
  const localPm = loadLocalPm(root);
  if (!localPm) return json;

  const base = json.review?.pm && typeof json.review.pm === 'object' ? json.review.pm : {};
  const maNv = !isPmPlaceholder(localPm.maNv) ? String(localPm.maNv).trim()
    : (!isPmPlaceholder(base.maNv) ? String(base.maNv).trim() : base.maNv);
  const boPhanLt = !isPmPlaceholder(localPm.boPhanLt) ? String(localPm.boPhanLt).trim()
    : (!isPmPlaceholder(base.boPhanLt) ? String(base.boPhanLt).trim() : base.boPhanLt);

  return {
    ...json,
    review: {
      ...json.review,
      pm: { ...base, maNv, boPhanLt },
    },
  };
}

/**
 * Gán giá trị cấu trúc QLDA (đường dẫn program, tên database) từ qlda.local.json khi
 * qlda.json còn giữ TOKEN `{...}` — cùng cơ chế với `overlayPmFromLocal`, áp cho các field
 * mà `mcp/fbo/lib/sql.mjs` đọc để định tuyến kết nối. `data/qlda.json` đi kèm gói phân phối
 * công khai nên KHÔNG BAO GIỜ chứa giá trị thật; giá trị thật chỉ nằm ở qlda.local.json
 * (gitignore) hoặc do `4ai setup` ghi vào.
 */
function overlayQldaStructureFromLocal(json, root) {
  if (!json?.databases?.qlda) return json;
  const local = loadLocalFile(root);

  const pick = (tokenValue, localValue) =>
    (!isPmPlaceholder(localValue) ? String(localValue).trim() : tokenValue);

  const qlda = json.databases.qlda;
  const graph4ai = json.databases?.graph4ai;
  const attachments = json.attachments;

  return {
    ...json,
    databases: {
      ...json.databases,
      qlda: {
        ...qlda,
        path: pick(qlda.path, local.qldaProgramPath),
        databaseName: pick(qlda.databaseName, local.qldaDatabaseName),
        sysDatabaseName: pick(qlda.sysDatabaseName, local.qldaSysDatabaseName),
      },
      ...(graph4ai ? {
        graph4ai: { ...graph4ai, databaseName: pick(graph4ai.databaseName, local.graph4aiDatabaseName) },
      } : {}),
    },
    ...(attachments ? {
      attachments: {
        ...attachments,
        fileStore: attachments.fileStore ? {
          ...attachments.fileStore,
          root: pick(attachments.fileStore.root, local.attachmentsFileStoreRoot),
        } : attachments.fileStore,
      },
    } : {}),
  };
}

/**
 * Đọc data/qlda.json. Tìm lần lượt theo hub được truyền vào, gốc module, rồi cwd.
 * Sau khi nạp, gán `review.pm` từ data/qlda.local.json nếu có (token `{PMName}`/`{PMDept}`).
 * @param {string} [hub] - Thư mục gốc hub 4AI
 * @returns {Object|null} Nội dung qlda.json, hoặc null nếu không tìm thấy file
 */
export function loadQldaConfig(hub) {
  for (const root of [hub, MODULE_HUB_ROOT, process.cwd()]) {
    if (!root) continue;
    const file = path.join(root, CONFIG_REL);
    if (!fs.existsSync(file)) continue;

    const { mtimeMs } = fs.statSync(file);
    const hit = configCache.get(file);
    const base = hit && hit.mtimeMs === mtimeMs
      ? hit.json
      : (() => {
          const json = JSON.parse(fs.readFileSync(file, 'utf8'));
          configCache.set(file, { mtimeMs, json });
          return json;
        })();

    // Overlay local mỗi lần gọi (local có thể đổi mà qlda.json không) — không cache bản đã gán.
    return overlayQldaStructureFromLocal(overlayPmFromLocal(base, root), root);
  }
  return null;
}

// ------------------------------------------------------------- domain detect

/**
 * Tín hiệu nhận domain QLDA. weight 2 = một mình đã đủ kết luận; weight 1 = từ chung,
 * cần ít nhất hai tín hiệu. `word: true` khớp theo ranh giới từ để mã ngắn khỏi ăn nhầm.
 * Điểm nằm giữa 0 và ngưỡng (đúng 1 tín hiệu weight-1) là VÙNG MÙ MỜ — keyword tiếng Việt
 * không phủ hết mọi cách diễn đạt nên không được tự chốt domain, phải trả về cho caller
 * (agent LLM gọi tool) quyết định tường minh. Xem `resolveDomain` ở metadata-resolver.mjs.
 */
const DOMAIN_SIGNALS = [
  { term: 'han hoan thanh', weight: 2 },
  { term: 'giai doan du an', weight: 2 },
  { term: 'tai lieu khao sat', weight: 2 },
  { term: 'dau muc cong viec', weight: 2 },
  { term: 'bo phan lap trinh', weight: 2 },
  { term: 'lap trinh quan ly', weight: 2 },
  { term: 'tlks', weight: 2, word: true },
  { term: 'qlda', weight: 2, word: true },
  { term: 'ur', weight: 2, word: true },
  { term: 'yeu cau', weight: 1 },
  { term: 'du an', weight: 1 },
  { term: 'giai doan', weight: 1 },
  { term: 'trang thai', weight: 1 },
  { term: 'hoan thanh', weight: 1 },
  { term: 'bo phan', weight: 1 },
  { term: 'phong', weight: 1 },
  { term: 'lap trinh', weight: 1 },
  { term: 'nghiep vu', weight: 1 },
  { term: 'nghiem thu', weight: 1 },
  { term: 'gio cong', weight: 1 },
  { term: 'qua han', weight: 1 },
  { term: 'tester', weight: 1 },
  { term: 'deadline', weight: 1 },
];

export const DOMAIN_THRESHOLD = 2;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Tín hiệu suy ra từ chính qlda.json: tên bảng, tên lookup, mã bộ phận, mã dự án. */
function derivedSignals(cfg) {
  const out = [];
  const push = (raw, weight) => {
    const term = stripAccents(String(raw || '')).trim();
    if (term) out.push({ term, weight, word: true });
  };

  for (const t of Object.values(cfg?.tables || {})) push(t.physical, 2);
  for (const name of Object.keys(cfg?.lookups || {})) push(name, 2);
  push(cfg?.attachments?.table, 2);
  push(cfg?.databases?.qlda?.databaseName, 2);

  const codes = new Set([cfg?.review?.pm?.boPhanLt, cfg?.review?.pm?.maNv]);
  for (const p of cfg?.projects?.items || []) {
    codes.add(p.bpTk);
    codes.add(p.bpLt);
    codes.add(p.maDa);
  }
  for (const code of codes) push(code, 1);

  return out;
}

/**
 * Chấm điểm xem một câu yêu cầu có thuộc domain QLDA không.
 * @param {string} text - Yêu cầu nguyên bản của người dùng
 * @param {Object} [cfg] - Nội dung qlda.json, dùng để suy thêm tín hiệu
 * @returns {{isQlda: boolean, isAmbiguous: boolean, score: number, matched: string[]}}
 */
export function detectQldaDomain(text, cfg) {
  const hay = stripAccents(String(text || ''));
  if (!hay.trim()) return { isQlda: false, isAmbiguous: false, score: 0, matched: [] };

  const seen = new Set();
  const matched = [];
  let score = 0;

  for (const sig of [...DOMAIN_SIGNALS, ...derivedSignals(cfg)]) {
    if (seen.has(sig.term)) continue;
    const hit = sig.word
      ? new RegExp(`(^|[^a-z0-9_])${escapeRe(sig.term)}([^a-z0-9_]|$)`).test(hay)
      : hay.includes(sig.term);
    if (!hit) continue;

    seen.add(sig.term);
    matched.push(sig.term);
    score += sig.weight;
  }

  const isQlda = score >= DOMAIN_THRESHOLD;
  // Có tín hiệu nhưng chưa đủ ngưỡng: đừng đoán, đó là việc của caller (xem comment DOMAIN_SIGNALS).
  const isAmbiguous = !isQlda && score > 0;
  return { isQlda, isAmbiguous, score, matched };
}

/**
 * Program path của một chương trình có phải chính QLDA không (so với databases.qlda.path).
 * @param {string} programPath
 * @param {Object} [cfg]
 * @returns {boolean}
 */
export function isQldaProgram(programPath, cfg) {
  const target = cfg?.databases?.qlda?.path;
  if (!programPath || !target) return false;
  const norm = (p) => String(p).replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
  return norm(programPath) === norm(target);
}

// ------------------------------------------------------------ metadata build

/** Từ khoá chọn bảng chính. Bảng đầu tiên trong metadata là bảng QueryPlan lấy làm source. */
const PRIMARY_TABLE_HINTS = [
  { logical: 'capNhatYeuCau', terms: ['yeu cau', 'ur', 'cong viec', 'gio cong'] },
  { logical: 'capNhatHanHoanThanh', terms: ['han hoan thanh', 'deadline', 'qua han', 'chot da hen'] },
  { logical: 'danhMucDuAn', terms: ['du an', 'project', 'khach hang', 'hop dong'] },
];

function pickPrimaryTable(cfg, text) {
  const hay = stripAccents(String(text || ''));
  let best = null;

  for (const hint of PRIMARY_TABLE_HINTS) {
    const physical = cfg?.tables?.[hint.logical]?.physical;
    if (!physical) continue;
    const score = hint.terms.filter((t) => hay.includes(t)).length;
    if (score > 0 && (!best || score > best.score)) best = { name: physical.toLowerCase(), score };
  }

  if (best) return { name: best.name, reason: 'khớp từ khoá trong yêu cầu' };

  const fallback = cfg?.tables?.capNhatYeuCau?.physical;
  return fallback
    ? { name: fallback.toLowerCase(), reason: 'mặc định — bảng yêu cầu là chủ thể báo cáo phổ biến nhất của QLDA' }
    : { name: null, reason: 'không xác định được bảng chính' };
}

function isSensitiveLookup(description) {
  return stripAccents(String(description || '')).includes('nhay cam');
}

function normalizeSpare(value) {
  if (value === true) return true;
  if (typeof value === 'string' && value.trim()) return value;
  return undefined;
}

function pushColumns(target, tableName, columns, sensitiveNames, dropped) {
  for (const col of columns || []) {
    const name = String(col.name || '').toLowerCase();
    if (!name) continue;

    if (col.sensitive === true || sensitiveNames.has(name)) {
      dropped.push(`${tableName}.${name}`);
      continue;
    }

    target.push({
      table: tableName,
      name,
      type: col.type || 'varchar',
      title: col.label || col.name,
      notNull: col.notNull === true || undefined,
      pk: col.pk === true || undefined,
      lookup: col.lookup || undefined,
      spare: normalizeSpare(col.spare),
      note: col.note || undefined,
    });
  }
}

function buildBusinessRules(cfg, { droppedColumns, deniedTables, baseRules }) {
  const rules = [...baseRules];

  for (const caveat of cfg?.schemaSource?.queryCaveats || []) rules.push(caveat);

  const tt = cfg?.enums?.trangThaiYeuCau;
  if (tt?.values?.length) {
    const list = tt.values.map((v) => `${v.ma}=${v.ten}`).join('; ');
    rules.push(`${tt.column} kiểu ${tt.type} — chỉ dùng mã có trong bảng ${tt.table}: ${list}.`);
    if (tt.flowNote) rules.push(tt.flowNote);
  }

  const spareNote = cfg?.schemaSource?.conventions?.spareSlots;
  if (spareNote) rules.push(spareNote);

  // Cố tình KHÔNG liệt kê tên cột nhạy cảm ở đây: business rule đi thẳng vào prompt, nhắc tên
  // là tự tay đưa chúng trở lại. Bảo đảm thật nằm ở chỗ khác — cột đã bị loại khỏi metadata,
  // cộng với quy tắc cấm dùng cột ngoài metadata. Tên cột chỉ còn ở metadata.deniedColumns cho
  // tầng validator kiểm bằng máy.
  if (droppedColumns.length) {
    rules.push(`${droppedColumns.length} cột lưu credential truy cập chương trình khách đã bị loại khỏi metadata — mọi cột không có trong metadata đều bị cấm dùng.`);
  }
  if (deniedTables.length) {
    rules.push(`Bảng chứa dữ liệu nhạy cảm, không truy vấn: ${deniedTables.join(', ')}.`);
  }

  rules.push('Bảng có fieldsKnown=false chưa khai cột trong metadata — không tự đoán tên cột, chỉ JOIN khi đã xác nhận cấu trúc.');

  return rules;
}

/**
 * Dựng metadata QLDA từ qlda.json.
 * @param {Object} cfg - Nội dung data/qlda.json
 * @param {Object} [options]
 * @param {string} [options.text] - Yêu cầu nguyên bản, dùng để chọn bảng chính
 * @param {number} [options.maxRows]
 * @param {string[]} [options.baseRules] - Business rule dùng chung mọi domain
 * @returns {Object} metadata
 */
export function buildQldaMetadata(cfg, options = {}) {
  const { text = '', maxRows = 10000, baseRules = [] } = options;

  const tables = [];
  const fields = [];
  const relationships = [];
  const droppedColumns = [];
  const deniedTables = [];
  const known = new Set();

  for (const [logical, t] of Object.entries(cfg?.tables || {})) {
    const name = String(t.physical || logical).toLowerCase();
    if (known.has(name)) continue;
    known.add(name);

    tables.push({
      name,
      alias: logical,
      title: t.title || logical,
      purpose: t.purpose || undefined,
      primaryKey: t.primaryKey?.columns || [],
      fieldsKnown: true,
    });

    const sensitiveNames = new Set((t.sensitiveColumns?.columns || []).map((c) => String(c).toLowerCase()));
    pushColumns(fields, name, t.columns, sensitiveNames, droppedColumns);

    for (const fk of t.foreignKeys || []) {
      const [toTable, toColumn] = String(fk.references || '').split('.');
      relationships.push({
        kind: 'foreignKey',
        from: name,
        fromColumn: String(fk.column || '').toLowerCase(),
        to: (toTable || '').toLowerCase(),
        toColumn: (toColumn || '').toLowerCase(),
        enforced: fk.enforced === true,
        note: fk.note || undefined,
      });
    }

    for (const cg of t.childGrids || []) {
      relationships.push({
        kind: 'childGrid',
        from: name,
        to: String(cg.controller || '').toLowerCase(),
        note: cg.note || undefined,
      });
    }
  }

  // Bảng đính kèm dùng chung — khoá cha đổi nghĩa theo cột controller.
  const att = cfg?.attachments;
  const attName = String(att?.table || '').toLowerCase();
  if (attName && !known.has(attName)) {
    known.add(attName);
    tables.push({
      name: attName,
      alias: 'attachments',
      title: 'Tệp đính kèm',
      purpose: att.note || undefined,
      primaryKey: att.primaryKey || [],
      fieldsKnown: true,
    });
    pushColumns(fields, attName, att.columns, new Set(), droppedColumns);

    for (const [role, condition] of Object.entries(att.lookupBy || {})) {
      relationships.push({ kind: 'attachment', from: attName, role, condition });
    }
  }

  // Danh mục lookup: biết tên bảng nhưng chưa khai cột. Bảng nhạy cảm bị chặn hẳn.
  for (const [lookupName, description] of Object.entries(cfg?.lookups || {})) {
    if (lookupName === 'note') continue;
    const name = String(lookupName).toLowerCase();
    if (known.has(name)) continue;
    known.add(name);

    if (isSensitiveLookup(description)) {
      deniedTables.push(name);
      continue;
    }

    tables.push({
      name,
      alias: name,
      title: String(description || name),
      kind: 'lookup',
      fieldsKnown: false,
    });
  }

  // Bảng chính lên đầu — createQueryPlan lấy tables[0] làm source.
  const primary = pickPrimaryTable(cfg, text);
  if (primary.name) {
    const idx = tables.findIndex((t) => t.name === primary.name);
    if (idx > 0) tables.unshift(tables.splice(idx, 1)[0]);
  }

  const qlda = cfg?.databases?.qlda || {};

  return {
    domain: 'qlda',
    source: 'data/qlda.json',
    primaryTable: primary.name,
    primaryTableReason: primary.reason,
    tables,
    fields,
    relationships,
    businessRules: buildBusinessRules(cfg, { droppedColumns, deniedTables, baseRules }),
    enums: cfg?.enums || {},
    fieldAliases: cfg?.urFieldMap?.map || {},
    fieldAliasConstraints: cfg?.urFieldMap?.constraints || [],
    deniedTables,
    deniedColumns: droppedColumns,
    connection: {
      program: qlda.path || null,
      database: qlda.databaseName || null,
      sysDatabase: qlda.sysDatabaseName || null,
      provider: qlda.provider || null,
      note: 'Web.config của QLDA dùng placeholder %Database — mọi truy vấn phải truyền database rõ ràng. Metadata không bao giờ chứa chuỗi kết nối.',
    },
    capabilities: {
      maxRows,
      supportsJoins: true,
      supportsAggregations: true,
    },
  };
}
