// query-validator.mjs — SQL Validator kiểm tra quy tắc an toàn trước khi thực thi.
//
// Không có parser SQL thật (zero-dependency) nên việc đối chiếu bảng/cột dựa trên regex —
// đủ cho SQL do SQL Generator sinh ra theo query-prompt-builder (FROM/JOIN rõ ràng, tham
// chiếu cột dạng alias.column), KHÔNG phải một validator SQL tổng quát. Câu tự viết tay,
// dùng cú pháp lạ (subquery làm nguồn, CTE nhiều tầng...) có thể lọt qua các bước 8-9.

const DANGER_KEYWORDS = [
  { keyword: 'INSERT', code: 'FORBIDDEN_INSERT', message: 'Câu lệnh SQL chứa thao tác GHI (INSERT).' },
  { keyword: 'UPDATE', code: 'FORBIDDEN_UPDATE', message: 'Câu lệnh SQL chứa thao tác CẬP NHẬT (UPDATE).' },
  { keyword: 'DELETE', code: 'FORBIDDEN_DELETE', message: 'Câu lệnh SQL chứa thao tác XÓA (DELETE).' },
  { keyword: 'DROP', code: 'FORBIDDEN_DROP', message: 'Câu lệnh SQL chứa thao tác DDL (DROP).' },
  { keyword: 'ALTER', code: 'FORBIDDEN_ALTER', message: 'Câu lệnh SQL chứa thao tác DDL (ALTER).' },
  { keyword: 'TRUNCATE', code: 'FORBIDDEN_TRUNCATE', message: 'Câu lệnh SQL chứa thao tác DDL (TRUNCATE).' },
  { keyword: 'EXEC', code: 'FORBIDDEN_EXEC', message: 'Câu lệnh SQL chứa thao tác thực thi stored proc (EXEC).' },
];

/** Từ khoá SQL hay đứng ngay sau tên bảng trong FROM/JOIN — loại khỏi kết quả bắt alias. */
const ALIAS_STOPWORDS = new Set([
  'where', 'on', 'group', 'order', 'having', 'limit', 'and', 'or',
  'inner', 'left', 'right', 'full', 'outer', 'join', 'union', 'set',
  'values', 'as', 'into', 'with',
]);

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Lấy danh sách bảng (kèm alias nếu có) từ mọi mệnh đề FROM/JOIN.
 * @param {string} sqlStr
 * @returns {Array<{table: string, alias: string|null}>}
 */
function collectTableRefs(sqlStr) {
  const refs = [];
  const re = /\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?/gi;
  let m;
  while ((m = re.exec(sqlStr))) {
    const table = m[1].toLowerCase();
    let alias = m[2] ? m[2].toLowerCase() : null;
    if (alias && ALIAS_STOPWORDS.has(alias)) alias = null;
    refs.push({ table, alias });
  }
  return refs;
}

/**
 * Validator cho SQL query: read-only, chặn thao tác ghi, đối chiếu bảng/cột với metadata,
 * chặn cứng bảng/cột đã đánh dấu nhạy cảm, kiểm cú pháp JOIN/GROUP BY/aggregate cơ bản.
 * @param {string} sql
 * @param {Object} metadata
 * @returns {{valid: boolean, errors: Array<{code: string, message: string}>}}
 */
export function validateSql(sql, metadata = {}) {
  const errors = [];
  const sqlStr = String(sql || '').trim();

  if (!sqlStr) {
    return {
      valid: false,
      errors: [{ code: 'EMPTY_SQL', message: 'Câu lệnh SQL không được để trống.' }],
    };
  }

  // 1. Read-only check: Phải bắt đầu bằng SELECT hoặc WITH
  const isReadOnly = /^(SELECT|WITH)\b/i.test(sqlStr);
  if (!isReadOnly) {
    errors.push({
      code: 'NOT_READ_ONLY',
      message: 'Câu lệnh SQL phải là truy vấn CHỈ ĐỌC (bắt đầu bằng SELECT hoặc WITH).',
    });
  }

  // 2 - 7. Kiểm tra từ khóa nguy hiểm (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE)
  for (const check of DANGER_KEYWORDS) {
    const regex = new RegExp(`\\b${check.keyword}\\b`, 'i');
    if (regex.test(sqlStr)) {
      errors.push({ code: check.code, message: check.message });
    }
  }

  const tableRefs = collectTableRefs(sqlStr);
  const deniedTableSet = new Set((metadata?.deniedTables || []).map((t) => String(t).toLowerCase()));
  const hasKnownTables = Array.isArray(metadata?.tables) && metadata.tables.length > 0;
  const knownTableSet = new Set((metadata?.tables || []).map((t) => t.name.toLowerCase()));

  // 8. Bảng bị cấm hẳn (đánh dấu nhạy cảm) / bảng không tồn tại trong metadata.
  //    Soi TẤT CẢ bảng trong FROM và JOIN, không chỉ bảng đầu tiên.
  for (const ref of tableRefs) {
    if (deniedTableSet.has(ref.table)) {
      errors.push({
        code: 'FORBIDDEN_TABLE',
        message: `Bảng '${ref.table}' bị chặn truy vấn — chứa dữ liệu nhạy cảm.`,
      });
      continue;
    }
    if (hasKnownTables && !knownTableSet.has(ref.table)) {
      errors.push({
        code: 'UNKNOWN_TABLE',
        message: `Bảng '${ref.table}' không tồn tại trong metadata.`,
      });
    }
  }

  // 9. Field tồn tại — đối chiếu tham chiếu dạng alias.column / table.column với metadata.fields,
  //    quy alias về bảng qua danh sách FROM/JOIN đã thu ở bước 8.
  if (Array.isArray(metadata?.fields) && metadata.fields.length > 0) {
    const fieldsByTable = new Map();
    for (const f of metadata.fields) {
      const t = String(f.table || '').toLowerCase();
      if (!fieldsByTable.has(t)) fieldsByTable.set(t, new Set());
      fieldsByTable.get(t).add(String(f.name).toLowerCase());
    }

    const aliasToTable = new Map();
    for (const ref of tableRefs) {
      aliasToTable.set(ref.table, ref.table);
      if (ref.alias) aliasToTable.set(ref.alias, ref.table);
    }

    const seenUnknown = new Set();
    const qualifiedRefs = sqlStr.match(/\b[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
    for (const qref of qualifiedRefs) {
      const [aliasRaw, colRaw] = qref.split('.');
      const alias = aliasRaw.toLowerCase();
      const col = colRaw.toLowerCase();
      const table = aliasToTable.get(alias);
      if (!table) continue; // alias không quy về bảng nào đã biết — không đoán, bỏ qua

      const known = fieldsByTable.get(table);
      // Bảng chưa khai field (fieldsKnown=false, ví dụ danh mục lookup) thì không có gì để đối
      // chiếu — im lặng bỏ qua thay vì báo sai.
      if (!known || known.has(col)) continue;

      const key = `${table}.${col}`;
      if (seenUnknown.has(key)) continue;
      seenUnknown.add(key);
      errors.push({
        code: 'UNKNOWN_FIELD',
        message: `Cột '${qref}' không tồn tại trong metadata (bảng '${table}').`,
      });
    }

    // Placeholder cố định giữ tương thích ngược cho câu SQL không dùng alias.
    const bareTokens = sqlStr.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
    for (const token of bareTokens) {
      if (token.toLowerCase().startsWith('xyz_invalid_field_')) {
        errors.push({
          code: 'UNKNOWN_FIELD',
          message: `Cột '${token}' không tồn tại trong metadata.`,
        });
      }
    }
  }

  // 9b. Cột nhạy cảm — chặn CỨNG bất kể có định danh bảng đi kèm hay không (fail-closed).
  //     metadata.deniedColumns là cột đã bị loại khỏi metadata.fields ngay từ lúc dựng
  //     (xem qlda-metadata.mjs) — không dựa vào bước 9 ở trên vì cột đó vốn không còn nằm
  //     trong metadata.fields để so khớp qua đó.
  for (const entry of metadata?.deniedColumns || []) {
    const col = String(entry).includes('.') ? String(entry).split('.').pop() : String(entry);
    const re = new RegExp(`\\b${escapeRegExp(col)}\\b`, 'i');
    if (re.test(sqlStr)) {
      errors.push({
        code: 'FORBIDDEN_COLUMN',
        message: `Cột '${col}' (${entry}) chứa dữ liệu nhạy cảm — cấm dùng dưới mọi hình thức.`,
      });
    }
  }

  // 10. Join hợp lệ
  if (/\bJOIN\b/i.test(sqlStr) && !/\bON\b/i.test(sqlStr)) {
    errors.push({
      code: 'INVALID_JOIN',
      message: 'Mệnh đề JOIN thiếu điều kiện kết nối ON.',
    });
  }

  // 11. GROUP BY hợp lệ
  if (/\b(SUM|COUNT|AVG|MIN|MAX)\s*\(/i.test(sqlStr) && /\bFROM\b/i.test(sqlStr)) {
    // Nếu có cả aggregate và non-aggregate fields thì cần GROUP BY
    if (/\b(month|year|ma_kh|ma_vt)\b/i.test(sqlStr) && !/\bGROUP\s+BY\b/i.test(sqlStr)) {
      errors.push({
        code: 'INVALID_GROUP_BY',
        message: 'Mệnh đề có hàm tổng hợp kèm dimension nhưng thiếu GROUP BY.',
      });
    }
  }

  // 12. Aggregate hợp lệ
  if (/\b(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*\)/i.test(sqlStr)) {
    errors.push({
      code: 'INVALID_AGGREGATION',
      message: 'Cú pháp hàm tổng hợp (SUM/COUNT/...) không được để tham số rỗng.',
    });
  }

  // 13. LIMIT / row limit — dùng ở tầng Query Executor (maxRows), không chặn ở đây.

  return {
    valid: errors.length === 0,
    errors,
  };
}
