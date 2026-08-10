// report-workflow.mjs — Điều phối luồng báo cáo: phân giải metadata → dựng prompt → validate → chạy.
//
// KHÔNG có LLM bên trong workflow này, và đó là chủ ý. Thứ gọi `plan_report` luôn luôn đã là
// một agent LLM (Claude Code, claude.ai qua MCP, Cursor) — nhét thêm một lần gọi LLM nữa bên
// trong tool là chồng hai lớp cho cùng một việc "hiểu câu tiếng Việt rồi viết SQL", tốn thêm
// API key, chi phí và độ trễ mà không thêm độ chính xác.
//
// Phần khó — biết đúng bảng/cột/enum của domain — đã là code thuần ở metadata-resolver.mjs.
// Workflow chỉ giao lại kết quả đó cho agent gọi tool dưới dạng prompt hoàn chỉnh:
//
//   plan_report    → metadata + QueryPlan + prompt   (thuần đọc, không chạm DB)
//   <agent tự viết SQL từ prompt>
//   execute_report → validate SQL theo ĐÚNG metadata của plan → chạy read-only
//
// Ranh giới bảo mật giữ nguyên: SQL không bao giờ đi thẳng từ ngôn ngữ tự nhiên xuống DB,
// luôn phải qua validateSql đối chiếu với metadata đã chốt ở bước plan.

import { resolveMetadata } from '../database/metadata-resolver.mjs';
import { createQueryPlan } from '../database/query-plan.mjs';
import { buildQueryPrompt } from '../database/query-prompt-builder.mjs';
import { validateSql } from '../database/query-validator.mjs';
import { executeQuery } from '../database/query-executor.mjs';

/** planId -> plan. Execute phase tra lại metadata đã chốt, không nhận metadata do caller đưa. */
const PLAN_CACHE = new Map();

/** Giới hạn số plan giữ lại — MCP server sống lâu, không để cache phình vô hạn. */
const PLAN_CACHE_LIMIT = 50;

function rememberPlan(plan) {
  PLAN_CACHE.set(plan.planId, plan);
  while (PLAN_CACHE.size > PLAN_CACHE_LIMIT) {
    PLAN_CACHE.delete(PLAN_CACHE.keys().next().value);
  }
}

/**
 * Giai đoạn Lập Kế Hoạch — thuần dữ liệu, không gọi LLM, không chạm database.
 * @param {string} userRequest - Yêu cầu báo cáo bằng ngôn ngữ tự nhiên
 * @param {Object} [context] - { hub, programPath, domain, maxRows }
 * @returns {Promise<Object>} Plan gồm metadata, queryPlan và prompt cho agent tự viết SQL
 */
export async function planReport(userRequest, context = {}) {
  const request = String(userRequest || '').trim();
  if (!request) {
    return {
      status: 'NEED_CLARIFICATION',
      questions: ['Yêu cầu rỗng. Vui lòng mô tả báo cáo bạn muốn tạo.'],
    };
  }

  const metadata = await resolveMetadata({}, { ...context, userRequest: request });
  const queryPlan = createQueryPlan({}, metadata);
  const prompt = buildQueryPrompt({ queryPlan, metadata });

  const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const plan = {
    status: 'READY',
    planId,
    request,
    domain: metadata.domain,
    domainReason: metadata.domainReason,
    primaryTable: metadata.primaryTable || queryPlan.source.table,
    metadata,
    queryPlan,
    prompt,
    nextStep: `Tự viết câu SELECT theo SCHEMA và BUSINESS RULES trong \`prompt\`, rồi gọi execute_report với planId '${planId}' kèm câu SQL đó. SQL sẽ được đối chiếu lại với đúng metadata này trước khi chạy.`,
  };

  rememberPlan(plan);
  return plan;
}

/**
 * Giai đoạn Thực Thi — nhận SQL do agent viết, validate theo metadata đã chốt ở plan rồi chạy.
 * @param {string} planId - planId trả về từ planReport
 * @param {string} sql - Câu SELECT do agent gọi tool tự viết
 * @param {Object} [context] - { hub, programPath, database, maxRows, timeoutMs }
 * @returns {Promise<Object>}
 */
export async function executeReport(planId, sql, context = {}) {
  const plan = PLAN_CACHE.get(planId);
  if (!plan) {
    throw new Error(`Không tìm thấy Report Plan với planId '${planId}'. Chạy lại plan_report trước.`);
  }

  const sqlStr = String(sql || '').trim();
  if (!sqlStr) {
    throw new Error('execute_report cần câu SQL do bạn viết từ `prompt` của plan — không có bước tự sinh SQL.');
  }

  // Validate đối chiếu metadata CỦA PLAN, không phải metadata do caller đưa vào.
  const validation = validateSql(sqlStr, plan.metadata);
  if (!validation.valid) {
    return {
      status: 'VALIDATION_FAILED',
      planId,
      sql: sqlStr,
      validation,
      errors: validation.errors,
    };
  }

  const result = await executeQuery({ sql: sqlStr, metadata: plan.metadata }, context);

  return {
    status: 'COMPLETED',
    planId,
    request: plan.request,
    domain: plan.domain,
    sql: sqlStr,
    validation,
    result,
  };
}
