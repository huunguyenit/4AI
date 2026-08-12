// fm.mjs — đọc/ghi YAML frontmatter, chỉ một subset hạn chế.
//
// Subset được hỗ trợ (và CHỈ thế):
//   key: scalar            scalar = bare | "double" | 'single' | true | false | số nguyên
//   key: [a, b, c]         flow sequence của scalar
//   key:                   block sequence, các dòng sau dạng `- item`
//     - item
//   # comment              comment đứng riêng một dòng
//
// Mọi thứ khác — nested map, anchor/alias, block scalar (| >), multi-document —
// là LỖI PARSE kèm số dòng. Đây là hợp đồng khiến một parser không dependency
// là đúng đắn, không phải hạn chế cần xin lỗi.

export class FmError extends Error {
  constructor(message, { file, line }) {
    super(`${file}:${line}: ${message}`);
    this.name = 'FmError';
    this.file = file;
    this.line = line;
    this.reason = message;
  }
}

const BARE_FORBIDDEN_START = new Set(['|', '>', '&', '*', '!', '{', '%', '`', '@']);

function stripCr(s) {
  return s.endsWith('\r') ? s.slice(0, -1) : s;
}

function unquote(raw, ctx) {
  const q = raw[0];
  if (raw.length < 2 || raw[raw.length - 1] !== q) {
    throw new FmError('chuỗi trong nháy không được đóng', ctx);
  }
  const inner = raw.slice(1, -1);
  if (q === "'") {
    // YAML single-quoted: chỉ '' là escape.
    return inner.replace(/''/g, "'");
  }
  return inner.replace(/\\(["\\nt])/g, (_, c) =>
    c === 'n' ? '\n' : c === 't' ? '\t' : c);
}

function parseScalar(raw, ctx) {
  const v = raw.trim();
  if (v === '') throw new FmError('giá trị rỗng — bỏ hẳn field thay vì để trống', ctx);
  if (v[0] === '"' || v[0] === "'") return unquote(v, ctx);
  if (BARE_FORBIDDEN_START.has(v[0])) {
    throw new FmError(
      `cú pháp YAML "${v[0]}" nằm ngoài subset được hỗ trợ (không dùng block scalar, anchor, tag)`,
      ctx);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') {
    throw new FmError('null không được hỗ trợ — bỏ hẳn field thay vì gán null', ctx);
  }
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) {
    throw new FmError('số thực không được hỗ trợ — schema chỉ dùng số nguyên', ctx);
  }
  if (v.includes(': ')) {
    throw new FmError('nested map không được hỗ trợ (bọc trong nháy nếu đây thật sự là chuỗi)', ctx);
  }
  return v;
}

function splitFlow(inner, ctx) {
  const out = [];
  let cur = '';
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    if (ch === '[' || ch === ']' || ch === '{' || ch === '}') {
      throw new FmError('sequence lồng nhau không được hỗ trợ', ctx);
    }
    cur += ch;
  }
  if (quote) throw new FmError('chuỗi trong nháy không được đóng', ctx);
  out.push(cur);
  const items = out.map((s) => s.trim()).filter((s) => s !== '');
  if (items.length !== out.length && out.some((s) => s.trim() === '' && out.length > 1)) {
    // `[a, , b]` hoặc dấu phẩy thừa cuối `[a, b, ]` — cái sau là vô hại, cái trước thì không.
    if (!/,\s*\]?$/.test(inner.trimEnd()) || /,\s*,/.test(inner)) {
      throw new FmError('phần tử rỗng trong sequence', ctx);
    }
  }
  return items.map((s) => parseScalar(s, ctx));
}

/**
 * Tách frontmatter khỏi body.
 * @returns {{data: object, body: string, bodyStartLine: number, keyLines: Map<string, number>}}
 */
export function parseFrontmatter(text, file = '<memory>') {
  const lines = text.split('\n').map(stripCr);
  if (lines.length === 0 || lines[0].trim() !== '---') {
    throw new FmError('file phải bắt đầu bằng `---` ở dòng 1 (frontmatter là byte đầu tiên)',
      { file, line: 1 });
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) {
    throw new FmError('không tìm thấy `---` đóng frontmatter', { file, line: lines.length });
  }

  const data = Object.create(null);
  const keyLines = new Map();
  let pendingKey = null; // key đang chờ block sequence

  for (let i = 1; i < end; i++) {
    const lineNo = i + 1;
    const ctx = { file, line: lineNo };
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === '') { continue; }
    if (trimmed.startsWith('#')) { continue; }

    // Phần tử của block sequence.
    if (/^\s*-\s/.test(raw) || /^\s*-$/.test(trimmed)) {
      if (!pendingKey) {
        throw new FmError('gặp `- item` mà không có key block sequence đứng trước', ctx);
      }
      const item = trimmed.slice(1).trim();
      if (item === '') throw new FmError('phần tử rỗng trong sequence', ctx);
      data[pendingKey].push(parseScalar(item, ctx));
      continue;
    }

    // Từ đây trở đi phải là `key:` ở cột 0.
    if (/^\s/.test(raw)) {
      throw new FmError('thụt lề nằm ngoài subset được hỗ trợ (không dùng nested map)', ctx);
    }

    const m = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:(.*)$/.exec(raw);
    if (!m) {
      throw new FmError(`không parse được dòng frontmatter: \`${trimmed}\``, ctx);
    }
    const key = m[1];
    const rest = m[2].trim();

    if (key in data) {
      throw new FmError(`field \`${key}\` bị khai báo hai lần (lần đầu ở dòng ${keyLines.get(key)})`, ctx);
    }
    keyLines.set(key, lineNo);

    if (rest === '') {
      data[key] = [];
      pendingKey = key;
      continue;
    }
    pendingKey = null;

    if (rest.startsWith('[')) {
      if (!rest.endsWith(']')) {
        throw new FmError('flow sequence phải nằm trọn trên một dòng và đóng bằng `]`', ctx);
      }
      data[key] = splitFlow(rest.slice(1, -1), ctx);
      continue;
    }

    data[key] = parseScalar(rest, ctx);
  }

  // `key:` để trống rồi không có `- item` nào ⇒ mảng rỗng. Coi là lỗi: mơ hồ.
  for (const [key, line] of keyLines) {
    if (Array.isArray(data[key]) && data[key].length === 0) {
      throw new FmError(`field \`${key}\` khai báo sequence nhưng không có phần tử nào`,
        { file, line });
    }
  }

  const body = lines.slice(end + 1).join('\n');
  return { data, body, bodyStartLine: end + 2, keyLines };
}

// Thứ tự key khi ghi ra. Key không có trong danh sách xếp sau, theo alphabet.
const WRITE_ORDER = [
  'id', 'name', 'title', 'kind', 'domain', 'description', 'applyTo', 'globs',
  'alwaysApply', 'always', 'severity', 'mode', 'model', 'tools', 'argument-hint',
  'allowed-tools', 'requires', 'targets', 'see-also', 'version',
];

function needsQuote(s) {
  return s === '' ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
    /:\s/.test(s) ||
    /\s$/.test(s) ||
    /^\s/.test(s) ||
    s.includes('\n') ||
    s === 'true' || s === 'false' || s === 'null' || s === '~' ||
    /^-?\d+(\.\d+)?$/.test(s);
}

function writeScalar(v) {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (!needsQuote(s)) return s;
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/**
 * Ghi frontmatter theo đúng subset trên — round-trip được qua parseFrontmatter.
 * Sequence luôn ghi dạng flow `[a, b]` cho gọn, trừ khi quá 72 ký tự thì xuống block.
 */
export function stringifyFrontmatter(data) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  keys.sort((a, b) => {
    const ia = WRITE_ORDER.indexOf(a);
    const ib = WRITE_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const out = ['---'];
  for (const k of keys) {
    const v = data[k];
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      const flow = `${k}: [${v.map(writeScalar).join(', ')}]`;
      if (flow.length <= 100) { out.push(flow); continue; }
      out.push(`${k}:`);
      for (const item of v) out.push(`  - ${writeScalar(item)}`);
      continue;
    }
    out.push(`${k}: ${writeScalar(v)}`);
  }
  out.push('---');
  return out.join('\n');
}
