// xmlscan.mjs — bóc thông tin từ XML controller FBO mà không cần XML parser đầy đủ.
//
// Vì sao không parse XML thật: file chứa `&EntityName;` chưa phân giải và tham số entity
// `%X;` — một parser tuân thủ chuẩn sẽ hoặc lỗi, hoặc đòi phân giải toàn bộ include.
// Ở đây ta quét có chủ đích: DOCTYPE, root element, fields, lookup, script, command.
// Đây là bóc-thông-tin, KHÔNG phải validate — không bao giờ dùng nó để khẳng định
// "file này well-formed".

const RE_DOCTYPE = /<!DOCTYPE\s+[\w.-]+\s*\[([\s\S]*?)\]\s*>/;
const RE_ENTITY_SYSTEM = /<!ENTITY\s+(%\s*)?([\w.:-]+)\s+SYSTEM\s+(["'])([^"']+)\3\s*>/g;
const RE_ENTITY_LITERAL = /<!ENTITY\s+([\w.:-]+)\s+(["'])([\s\S]*?)\2\s*>/g;
const RE_ENTITY_REF = /&([A-Za-z_][\w.:-]*);/g;
const RE_ROOT = /<(dir|grid|report|lookup|filter|list|view|query|flow|post|structure|options)\b([^>]*)>/i;
const RE_ATTR = /([\w:%-]+)\s*=\s*(["'])([\s\S]*?)\2/g;
const RE_TITLE = /<title\b([^>]*)>/i;
const RE_FIELD = /<field\b([^>]*)>([\s\S]*?)(?=<field\b|<\/fields>)/gi;
const RE_HEADER = /<header\b([^>]*)/i;
const RE_ITEMS = /<items\b([^>]*)/i;
const RE_CLIENT_SCRIPT = /<clientScript\b[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/clientScript>/gi;
const RE_COMMAND = /<command\b([^>]*)>([\s\S]*?)<\/command>/gi;

function attrs(s) {
  const out = {};
  if (!s) return out;
  RE_ATTR.lastIndex = 0;
  let m;
  while ((m = RE_ATTR.exec(s)) !== null) out[m[1]] = m[3];
  return out;
}

/** Chuẩn hoá đường dẫn SYSTEM của entity ("..\Include\XML\A.xml") về rel-path kiểu 'Include\XML\A.xml'. */
export function normalizeSystemPath(systemPath, fromFolder) {
  const parts = systemPath.replace(/\//g, '\\').split('\\').filter((p) => p !== '' && p !== '.');
  const stack = fromFolder ? [fromFolder] : [];
  for (const p of parts) {
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  return stack.join('\\');
}

/**
 * @param {string} text  nội dung đã decode
 * @param {string} folder  thư mục chứa file ('Dir', 'Grid'…) để phân giải '..'
 */
export function scanController(text, folder) {
  const result = {
    rootTag: null,
    rootAttrs: {},
    controllerType: null,
    table: null,
    titleVi: null,
    titleEn: null,
    entities: [],
    entityRefs: [],
    fields: [],
    lookups: [],
    commands: [],
    scriptChars: 0,
    sqlChars: 0,
    jsText: '',
    sqlText: '',
  };

  // --- DOCTYPE: entity khai báo ---
  const doctype = RE_DOCTYPE.exec(text);
  if (doctype) {
    const block = doctype[1];
    RE_ENTITY_SYSTEM.lastIndex = 0;
    let m;
    while ((m = RE_ENTITY_SYSTEM.exec(block)) !== null) {
      result.entities.push({
        name: m[2],
        parameter: !!m[1],
        systemPath: m[4],
        resolved: normalizeSystemPath(m[4], folder),
      });
    }
    // Entity literal (giá trị nội tuyến, không phải include).
    const systemNames = new Set(result.entities.map((e) => e.name));
    RE_ENTITY_LITERAL.lastIndex = 0;
    while ((m = RE_ENTITY_LITERAL.exec(block)) !== null) {
      if (systemNames.has(m[1])) continue;
      result.entities.push({ name: m[1], parameter: false, literal: m[3], resolved: null });
    }
  }

  const bodyStart = doctype ? doctype.index + doctype[0].length : 0;
  const body = text.slice(bodyStart);

  // --- root element ---
  const root = RE_ROOT.exec(body);
  if (root) {
    result.rootTag = root[1].toLowerCase();
    result.rootAttrs = attrs(root[2]);
    result.table = result.rootAttrs.table ?? null;
    result.controllerType = result.rootAttrs.type ?? null;
  }

  // --- title (tên nghiệp vụ — thứ người dùng thực sự tìm) ---
  const title = RE_TITLE.exec(body);
  if (title) {
    const a = attrs(title[1]);
    result.titleVi = a.v ?? null;
    result.titleEn = a.e ?? null;
  }

  // --- fields ---
  RE_FIELD.lastIndex = 0;
  let f;
  while ((f = RE_FIELD.exec(body)) !== null) {
    const a = attrs(f[1]);
    if (!a.name) continue;
    const inner = f[2] ?? '';
    const h = RE_HEADER.exec(inner);
    const ha = h ? attrs(h[1]) : {};
    const it = RE_ITEMS.exec(inner);
    const ia = it ? attrs(it[1]) : {};
    const field = {
      name: a.name,
      labelVi: ha.v || null,
      labelEn: ha.e || null,
      type: a.type ?? null,
      readOnly: a.readOnly === 'true',
      hidden: a.hidden === 'true',
      external: a.external === 'true',
      primaryKey: a.isPrimaryKey === 'true',
      allowNulls: a.allowNulls === undefined ? null : a.allowNulls === 'true',
      style: ia.style ?? null,
      lookupController: ia.controller ?? null,
    };
    result.fields.push(field);
    if (ia.controller) {
      result.lookups.push({
        field: a.name,
        controller: ia.controller,
        reference: ia.reference ?? null,
        style: ia.style ?? null,
      });
    }
  }

  // --- clientScript (JS) ---
  RE_CLIENT_SCRIPT.lastIndex = 0;
  let s;
  const js = [];
  while ((s = RE_CLIENT_SCRIPT.exec(body)) !== null) js.push(s[1].trim());
  result.jsText = js.join('\n');
  result.scriptChars = result.jsText.length;

  // --- command (SQL) ---
  RE_COMMAND.lastIndex = 0;
  let c;
  const sql = [];
  while ((c = RE_COMMAND.exec(body)) !== null) {
    const a = attrs(c[1]);
    const text2 = c[2].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    result.commands.push({ event: a.event ?? null, chars: text2.length });
    if (text2) sql.push(text2);
  }
  result.sqlText = sql.join('\n');
  result.sqlChars = result.sqlText.length;

  // --- entity được tham chiếu thật trong body ---
  RE_ENTITY_REF.lastIndex = 0;
  const refs = new Set();
  let r;
  while ((r = RE_ENTITY_REF.exec(body)) !== null) {
    if (!['amp', 'lt', 'gt', 'quot', 'apos'].includes(r[1])) refs.add(r[1]);
  }
  result.entityRefs = [...refs].sort();

  return result;
}
