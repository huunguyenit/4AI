// query-executor.mjs — Thực thi SQL đã qua xác thực (Validated Query) lên Database.

import { runSql as defaultRunSql, redact } from '../../mcp/fbo/lib/sql.mjs';

/** Chốt chặn cuối: executeReport đã chặn qua validateSql, đây là lớp phòng thủ thứ hai. */
const WRITE_SQL = /\b(insert|update|delete|merge|truncate|drop|alter|create|exec|execute|grant|revoke)\b/i;

/**
 * Thực thi câu lệnh SQL đã được validate.
 * @param {Object} validatedQuery
 * @param {string} validatedQuery.sql
 * @param {Object} [validatedQuery.metadata]
 * @param {Object} [context]
 * @param {Function} [context.runSql] - Seam để test call shape mà không cần database
 * @returns {Promise<{success: boolean, rows: Array, count: number, executionTimeMs: number, error?: string}>}
 */
export async function executeQuery(validatedQuery, context = {}) {
  if (!validatedQuery || !validatedQuery.sql) {
    throw new Error('Query Executor chỉ nhận câu lệnh SQL đã qua xác thực (validatedQuery).');
  }

  const sql = validatedQuery.sql;
  if (WRITE_SQL.test(sql)) {
    throw new Error('Query Executor chỉ chạy truy vấn ĐỌC. Câu lệnh này chứa thao tác ghi.');
  }

  // Metadata thắng context khi nó tự khai nơi chạy: SQL sinh từ metadata QLDA chỉ chạy được
  // trên DB nghiệp vụ QLDA nội bộ, chạy nhầm vào chương trình khách là tra sai bảng — hoặc tệ hơn,
  // trúng một bảng trùng tên bên DB khách.
  const connection = validatedQuery.metadata?.connection || {};
  const program = connection.program || context.programPath || context.program;
  const database = context.database || connection.database;
  const dbType = context.db || 'app';
  const maxRows = context.maxRows || validatedQuery.metadata?.capabilities?.maxRows || 1000;
  const timeoutMs = context.timeoutMs || 30000;

  const startTime = Date.now();
  const audit = {
    timestamp: new Date().toISOString(),
    sql: redact(sql),
    program: program || 'N/A',
    database: database || 'N/A',
    resolvedFrom: connection.program ? 'metadata.connection' : 'context',
  };

  // KHÔNG trả dữ liệu giả khi thiếu program. Số liệu bịa trông y hệt số liệu thật là đúng
  // cái class lỗi mà toàn bộ pipeline này sinh ra để chặn.
  if (!program) {
    throw new Error(
      'Không xác định được chương trình để chạy SQL. Truyền `program`, hoặc dùng plan có ' +
      '`metadata.connection.program` (domain qlda tự khai sẵn).'
    );
  }

  // runSql nhận MỘT object options — không phải tham số vị trí — và trả về
  // { database, columns, rowCount, rows, truncated, stderr }, không phải mảng rows trần.
  const run = context.runSql || defaultRunSql;

  try {
    const res = run({
      programPath: program,
      sql,
      dbType,
      database,
      entity: context.entity,
      maxRows,
      timeoutMs,
    });

    return {
      success: true,
      database: res.database,
      columns: res.columns,
      rows: res.rows || [],
      count: res.rowCount ?? (res.rows?.length || 0),
      truncated: res.truncated,
      warning: res.stderr || undefined,
      executionTimeMs: Date.now() - startTime,
      audit,
    };
  } catch (err) {
    return {
      success: false,
      rows: [],
      count: 0,
      executionTimeMs: Date.now() - startTime,
      error: redact(err.message),
      audit,
    };
  }
}
