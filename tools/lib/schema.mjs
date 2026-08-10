// schema.mjs — nơi DUY NHẤT tên field của asset tồn tại.
// Emitter không được hardcode tên field; nó đọc từ đây.

export const KINDS = ['doctrine', 'rule', 'skill', 'agent', 'command'];
export const TARGETS = ['claude', 'cursor', 'vscode', 'antigravity'];
export const SEVERITIES = ['hard', 'soft'];
export const MODES = ['agent', 'ask'];
export const MODELS = ['haiku', 'sonnet', 'opus', 'inherit'];

export const MAX_DESCRIPTION = 200;

/**
 * type:            'string' | 'int' | 'bool' | 'stringArray' | 'enum' | 'enumArray'
 * required:        bắt buộc với mọi kind
 * requiredForKinds: bắt buộc với riêng các kind này
 * kinds:           chỉ hợp lệ với các kind này (vắng ⇒ mọi kind)
 */
export const FIELDS = {
  id:               { type: 'string', required: true, pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
                      hint: 'kebab-case, chỉ a-z 0-9 và dấu gạch ngang' },
  title:            { type: 'string', required: true },
  kind:             { type: 'enum', values: KINDS, required: true },
  domain:           { type: 'string', required: true, pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/ },
  description:      { type: 'string', required: true, maxLength: MAX_DESCRIPTION },
  version:          { type: 'int', required: true, min: 1 },

  targets:          { type: 'enumArray', values: TARGETS },
  always:           { type: 'bool' },
  globs:            { type: 'stringArray' },
  requires:         { type: 'stringArray' },
  'see-also':       { type: 'stringArray' },

  severity:         { type: 'enum', values: SEVERITIES, kinds: ['rule'], requiredForKinds: ['rule'] },
  tools:            { type: 'stringArray', kinds: ['agent'] },
  model:            { type: 'enum', values: MODELS, kinds: ['agent'] },
  'argument-hint':  { type: 'string', kinds: ['command'] },
  mode:             { type: 'enum', values: MODES, kinds: ['command'] },
};

// Shape của connection string. `check` fail nếu thấy trong assets/** hoặc ledger/**.
// Dòng NÓI VỀ pattern (tài liệu cấm secret) đánh dấu waiver tường minh:
// chứa marker này thì được bỏ qua — waiver phải nhìn thấy được trong diff.
export const SECRET_WAIVER = '4ai:allow-secret-pattern';
export const SECRET_PATTERNS = [
  /\bData\s+Source\s*=/i,
  /\bInitial\s+Catalog\s*=/i,
  /\bPassword\s*=/i,
  /\bPwd\s*=/i,
  /\bUser\s+ID\s*=/i,
  /\bUid\s*=\s*\w/i,
];

function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function checkType(name, spec, value) {
  switch (spec.type) {
    case 'string':
      if (typeof value !== 'string') return `phải là chuỗi, đang là ${typeOf(value)}`;
      if (spec.pattern && !spec.pattern.test(value)) {
        return `sai định dạng (${spec.hint ?? spec.pattern})`;
      }
      if (spec.maxLength && value.length > spec.maxLength) {
        return `dài ${value.length} ký tự, tối đa ${spec.maxLength}`;
      }
      if (value.includes('\n')) return 'phải nằm trọn một dòng';
      return null;
    case 'int':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return `phải là số nguyên, đang là ${typeOf(value)}`;
      }
      if (spec.min !== undefined && value < spec.min) return `phải ≥ ${spec.min}`;
      return null;
    case 'bool':
      if (typeof value !== 'boolean') return `phải là true/false, đang là ${typeOf(value)}`;
      return null;
    case 'enum':
      if (!spec.values.includes(value)) {
        return `phải là một trong: ${spec.values.join(' | ')} — đang là \`${value}\``;
      }
      return null;
    case 'stringArray':
    case 'enumArray': {
      if (!Array.isArray(value)) return `phải là danh sách, đang là ${typeOf(value)}`;
      for (const item of value) {
        if (typeof item !== 'string') return `phần tử \`${item}\` phải là chuỗi`;
        if (spec.type === 'enumArray' && !spec.values.includes(item)) {
          return `phần tử \`${item}\` không hợp lệ — phải là một trong: ${spec.values.join(' | ')}`;
        }
      }
      return null;
    }
    default:
      return `kiểu schema không rõ: ${spec.type}`;
  }
}

/** Điền giá trị mặc định. Gọi SAU khi validate. */
export function applyDefaults(fm) {
  const out = { ...fm };
  if (out.targets === undefined) out.targets = [...TARGETS];
  if (out.always === undefined) out.always = out.kind === 'doctrine';
  if (out.kind === 'agent' && out.model === undefined) out.model = 'inherit';
  if (out.kind === 'command' && out.mode === undefined) out.mode = 'agent';
  return out;
}

/**
 * Validate frontmatter của một asset.
 * @param {object} fm      frontmatter đã parse
 * @param {Map<string,number>} keyLines  map field → số dòng, để báo lỗi đúng chỗ
 * @param {string} body
 * @param {{file: string, fmEndLine: number}} ctx
 * @returns {Array<{line: number, message: string}>}
 */
export function validateAsset(fm, keyLines, body, ctx) {
  const errs = [];
  const at = (field) => keyLines.get(field) ?? ctx.fmEndLine;
  const add = (field, message) => errs.push({ line: at(field), message });

  // Field lạ.
  for (const key of Object.keys(fm)) {
    if (!(key in FIELDS)) {
      const near = Object.keys(FIELDS).find((f) => f.replace(/-/g, '') === key.replace(/-/g, ''));
      add(key, `field \`${key}\` không có trong schema${near ? ` — ý bạn là \`${near}\`?` : ''}`);
    }
  }

  const kind = FIELDS.kind.values.includes(fm.kind) ? fm.kind : null;
  if (fm.kind !== undefined && !kind) {
    add('kind', `\`kind\` phải là một trong: ${KINDS.join(' | ')} — đang là \`${fm.kind}\``);
  }

  for (const [name, spec] of Object.entries(FIELDS)) {
    const present = fm[name] !== undefined;

    if (!present) {
      if (spec.required) add(name, `thiếu field bắt buộc \`${name}\``);
      else if (kind && spec.requiredForKinds?.includes(kind)) {
        add('kind', `\`kind: ${kind}\` bắt buộc phải có field \`${name}\``);
      }
      continue;
    }

    if (spec.kinds && kind && !spec.kinds.includes(kind)) {
      add(name, `\`${name}\` chỉ dùng được với kind: ${spec.kinds.join(' | ')} — asset này là \`${kind}\``);
      continue;
    }

    const problem = checkType(name, spec, fm[name]);
    if (problem) add(name, `\`${name}\` ${problem}`);
  }

  // Ràng buộc liên field.
  if (fm.always === true && fm.globs !== undefined) {
    add('globs', '`always: true` và `globs` loại trừ lẫn nhau — một rule hoặc luôn áp dụng, hoặc có phạm vi');
  }
  if (kind === 'doctrine' && fm.globs !== undefined) {
    add('globs', 'doctrine luôn áp dụng cho toàn bộ — không nhận `globs`');
  }
  if (kind === 'doctrine' && fm.always === false) {
    add('always', 'doctrine không thể có `always: false`');
  }

  // Body.
  if (!/^##\s+\S/m.test(body)) {
    errs.push({ line: ctx.fmEndLine + 1, message: 'body phải có ít nhất một heading `## `' });
  }
  if (body.trim() === '') {
    errs.push({ line: ctx.fmEndLine + 1, message: 'body rỗng' });
  }

  // Secret.
  const bodyLines = body.split('\n');
  for (let i = 0; i < bodyLines.length; i++) {
    if (bodyLines[i].includes(SECRET_WAIVER)) continue;
    for (const re of SECRET_PATTERNS) {
      if (re.test(bodyLines[i])) {
        errs.push({
          line: ctx.fmEndLine + 1 + i,
          message: `có shape connection string (${re.source}) — không bao giờ đưa credential vào asset`,
        });
        break;
      }
    }
  }

  return errs;
}

/** Skeleton cho lệnh `new`. */
export function skeleton(kind, id, domain) {
  const base = {
    id,
    title: '<Tiêu đề tiếng Anh>',
    kind,
    domain,
    description: '<Một dòng, ≤200 ký tự. Model đọc riêng dòng này phải quyết định được có nạp hay không.>',
    version: 1,
  };
  if (kind === 'rule') { base.severity = 'hard'; base.globs = ['<glob>']; }
  if (kind === 'agent') { base.tools = ['Read', 'Grep', 'Glob']; base.model = 'inherit'; }
  if (kind === 'command') { base['argument-hint'] = '<tham số>'; base.mode = 'agent'; }
  return base;
}
