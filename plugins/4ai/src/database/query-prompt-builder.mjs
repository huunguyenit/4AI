// query-prompt-builder.mjs — Dựng prompt hoàn chỉnh cho agent gọi tool tự viết SQL.
//
// Người đọc prompt này là chính agent đã gọi plan_report (Claude Code / claude.ai / Cursor),
// không phải một LLM thứ hai bên trong tool. Vì vậy nó kết thúc bằng chỉ dẫn gọi execute_report
// chứ không phải một output contract JSON.
//
// Schema render dạng bảng phẳng thay vì JSON: cùng lượng thông tin, tốn ít token hơn nhiều
// và người đọc lướt được — metadata QLDA có gần 180 cột.

function renderTables(tables = []) {
  if (!tables.length) return '(không có bảng nào)';
  return tables.map((t) => {
    const pk = t.primaryKey?.length ? ` PK(${t.primaryKey.join(', ')})` : '';
    const unknown = t.fieldsKnown === false ? ' [CHƯA KHAI CỘT — không đoán tên cột]' : '';
    const title = t.title ? ` — ${t.title}` : '';
    return `- ${t.name}${title}${pk}${unknown}${t.purpose ? `\n    ${t.purpose}` : ''}`;
  }).join('\n');
}

function renderFields(fields = []) {
  if (!fields.length) return '(không có cột nào)';

  const byTable = new Map();
  for (const f of fields) {
    if (!byTable.has(f.table)) byTable.set(f.table, []);
    byTable.get(f.table).push(f);
  }

  const blocks = [];
  for (const [table, cols] of byTable) {
    const lines = cols.map((f) => {
      const flags = [
        f.pk ? 'PK' : null,
        f.notNull ? 'NOT NULL' : null,
        f.lookup ? `→${f.lookup}` : null,
        f.spare ? `spare${typeof f.spare === 'string' ? `:${f.spare}` : ''}` : null,
      ].filter(Boolean);
      const title = f.title && f.title !== f.name ? `  "${f.title}"` : '';
      return `    ${f.name}  ${f.type}${title}${flags.length ? `  [${flags.join(' ')}]` : ''}`;
    });
    blocks.push(`  ${table}:\n${lines.join('\n')}`);
  }
  return blocks.join('\n');
}

function renderRelationships(relationships = []) {
  if (!relationships.length) return '(không khai quan hệ)';
  return relationships.map((r) => {
    if (r.kind === 'attachment') return `- ${r.from} [${r.role}]: ${r.condition}`;
    const arrow = r.kind === 'childGrid' ? '⇉ (grid con)' : '→';
    const cols = r.fromColumn && r.toColumn ? ` (${r.fromColumn} = ${r.toColumn})` : '';
    const enforced = r.kind === 'foreignKey' && r.enforced === false ? ' [không có FK constraint ở DB]' : '';
    return `- ${r.from} ${arrow} ${r.to}${cols}${enforced}${r.note ? `\n    ${r.note}` : ''}`;
  }).join('\n');
}

function renderEnums(enums = {}) {
  const entries = Object.entries(enums).filter(([, v]) => Array.isArray(v?.values));
  if (!entries.length) return null;
  return entries.map(([name, e]) => {
    const values = e.values.map((v) => `    ${v.ma} = ${v.ten}`).join('\n');
    return `  ${name} (${e.column || '?'}, tra bảng ${e.table || '?'}):\n${values}`;
  }).join('\n');
}

function renderAliases(aliases = {}, constraints = []) {
  const entries = Object.entries(aliases);
  if (!entries.length) return null;
  const lines = entries.map(([concept, column]) => `    ${concept} → ${column}`).join('\n');
  const notes = constraints.length ? `\n  Ràng buộc:\n${constraints.map((c) => `    - ${c}`).join('\n')}` : '';
  return `${lines}${notes}`;
}

/**
 * Xây dựng prompt hoàn chỉnh để agent tự viết SQL.
 * @param {Object} params
 * @param {Object} params.queryPlan
 * @param {Object} params.metadata
 * @param {Array<string>} [params.businessRules] - Rule bổ sung ngoài metadata
 * @returns {string}
 */
export function buildQueryPrompt({ queryPlan, metadata, businessRules = [] }) {
  const rules = [...(metadata?.businessRules || []), ...businessRules];
  const enumsBlock = renderEnums(metadata?.enums);
  const aliasBlock = renderAliases(metadata?.fieldAliases, metadata?.fieldAliasConstraints);
  const conn = metadata?.connection;

  const sections = [
    `=== SYSTEM ===
Viết MỘT câu SELECT trả lời đúng yêu cầu, chỉ dùng bảng và cột liệt kê bên dưới.
Schema này đã được phân giải sẵn — không phải phỏng đoán, không cần tra thêm.`,

    `=== CONTEXT ===
Domain    : ${metadata?.domain || 'không rõ'}${metadata?.domainReason ? ` (${metadata.domainReason})` : ''}
Nguồn     : ${metadata?.source || 'không rõ'}
Bảng chính: ${queryPlan?.source?.table || metadata?.primaryTable || '?'}${
      conn?.program ? `\nChạy trên : ${conn.program}${conn.database ? ` · database ${conn.database}` : ''}` : ''
    }`,

    `=== SCHEMA ===
Bảng:
${renderTables(metadata?.tables)}

Cột:
${renderFields(metadata?.fields)}`,

    `=== RELATIONSHIPS ===
${renderRelationships(metadata?.relationships)}`,
  ];

  if (enumsBlock) {
    sections.push(`=== ENUMS ===
Mã viết tắt PHẢI tra bảng danh mục, không được đoán nghĩa:
${enumsBlock}`);
  }

  if (aliasBlock) {
    sections.push(`=== ÁNH XẠ KHÁI NIỆM → CỘT ===
${aliasBlock}`);
  }

  sections.push(
    `=== BUSINESS RULES ===
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,

    `=== QUERY PLAN ===
${JSON.stringify(queryPlan, null, 2)}`,

    `=== SQL RULES ===
- Chỉ SELECT. Cấm INSERT / UPDATE / DELETE / DROP / ALTER / TRUNCATE / EXEC.
- Không dùng bảng hay cột không có trong SCHEMA — validator sẽ chặn.
- Cột kiểu char cố định dài phải RTRIM khi so sánh hoặc join.
- JOIN bắt buộc có ON.
- Có hàm tổng hợp kèm cột phi tổng hợp thì phải GROUP BY.
- Giới hạn ${queryPlan?.limit || 10000} dòng.`,

    `=== BƯỚC TIẾP THEO ===
Gọi execute_report với planId của plan này và câu SELECT vừa viết.
SQL sẽ được đối chiếu lại với đúng metadata trên trước khi chạy; sai bảng/cột hoặc chạm
cột bị cấm thì bị trả về VALIDATION_FAILED kèm lý do, không có gì được thực thi.`
  );

  return sections.join('\n\n');
}
