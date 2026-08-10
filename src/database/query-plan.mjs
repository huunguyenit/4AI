// query-plan.mjs — Xây dựng và validate QueryPlan cấu trúc từ ReportSpecification & Metadata.

/**
 * Tạo QueryPlan từ ReportSpecification và Metadata đã phân giải.
 * @param {Object} reportSpec
 * @param {Object} metadata
 * @returns {Object} QueryPlan
 */
export function createQueryPlan(reportSpec, metadata = {}) {
  const mainTable = metadata.primaryTable || metadata.tables?.[0]?.name || 'hda';
  const limit = metadata.capabilities?.maxRows || 10000;

  const plan = {
    source: {
      table: mainTable,
    },
    joins: Array.isArray(reportSpec?.joins) ? reportSpec.joins : [],
    dimensions: Array.isArray(reportSpec?.dimensions) ? reportSpec.dimensions : [],
    measures: Array.isArray(reportSpec?.measures) ? reportSpec.measures : [],
    filters: Array.isArray(reportSpec?.filters) ? reportSpec.filters : [],
    groupBy: Array.isArray(reportSpec?.groupBy) ? reportSpec.groupBy : [],
    orderBy: Array.isArray(reportSpec?.sort) ? reportSpec.sort : [],
    limit,
  };

  validateQueryPlan(plan, metadata);
  return plan;
}

/**
 * Validate tính toàn vẹn của QueryPlan.
 * @param {Object} plan
 * @param {Object} metadata
 * @throws {Error} Nếu QueryPlan không hợp lệ
 */
export function validateQueryPlan(plan, metadata = {}) {
  if (!plan || typeof plan !== 'object') {
    throw new Error('QueryPlan không được để trống.');
  }

  if (!plan.source || !plan.source.table) {
    throw new Error('QueryPlan phải chỉ định bảng nguồn (source.table).');
  }

  if (typeof plan.limit !== 'number' || plan.limit <= 0) {
    throw new Error('QueryPlan limit phải là số nguyên dương.');
  }

  return true;
}
