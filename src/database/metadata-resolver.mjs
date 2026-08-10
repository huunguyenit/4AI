// metadata-resolver.mjs — Phân giải thông tin bảng, cột, mối quan hệ và quy tắc nghiệp vụ.
//
// Hai domain, hai nguồn metadata khác nhau:
//   - `qlda` — dự án / yêu cầu (UR) / hạn hoàn thành. Nguồn là data/qlda.json, dữ liệu nằm ở
//     DB nội bộ QLDA_APP, KHÔNG nằm trong chương trình của khách nào.
//   - `fbo`  — nghiệp vụ trong một chương trình khách. Nguồn là chỉ mục SQLite của program.
// Chọn nhầm domain là ra sai bảng ngay từ bước đầu, nên bước phân giải này đứng trước tất cả.

import { openIndex } from '../../mcp/fbo/lib/index.mjs';
import { loadQldaConfig, detectQldaDomain, isQldaProgram, buildQldaMetadata } from './qlda-metadata.mjs';

/** Quy tắc đúng với mọi domain. */
export const BASE_BUSINESS_RULES = [
  'Chỉ được đọc dữ liệu (READ ONLY).',
  'Không được tự ý thêm cột hoặc bảng ngoài metadata.',
  'Khi tạo truy vấn báo cáo theo phòng ban/nhân viên (như phòng FSD), áp dụng thứ tự ưu tiên: ma_lt > ma_nv > ma_bp lt > ma_bp nv.',
];

/**
 * Xác định domain của một yêu cầu báo cáo.
 * @param {Object} reportSpec
 * @param {Object} context
 * @returns {{name: string, config: Object|null, reason: string, detection?: Object}}
 */
export function resolveDomain(reportSpec = {}, context = {}) {
  const cfg = loadQldaConfig(context.hub);
  const programPath = context.programPath || context.program;

  // 1. Người gọi chỉ định thẳng thì tôn trọng, không đoán lại.
  if (context.domain) {
    return {
      name: context.domain,
      config: cfg,
      reason: 'domain do người gọi chỉ định',
    };
  }

  if (!cfg) {
    return { name: 'fbo', config: null, reason: 'không đọc được data/qlda.json' };
  }

  // 2. Program trỏ thẳng vào chính chương trình QLDA.
  if (isQldaProgram(programPath, cfg)) {
    return { name: 'qlda', config: cfg, reason: 'program path trùng databases.qlda.path' };
  }

  // 3. Chấm điểm từ khoá trên yêu cầu nguyên bản.
  const text = [
    context.userRequest,
    context.intent?.originalRequest,
    reportSpec?.title,
  ].filter(Boolean).join(' ');

  const detection = detectQldaDomain(text, cfg);
  if (detection.isQlda) {
    return {
      name: 'qlda',
      config: cfg,
      reason: `từ khoá QLDA (điểm ${detection.score}): ${detection.matched.join(', ')}`,
      detection,
    };
  }

  return { name: 'fbo', config: cfg, reason: 'không có tín hiệu QLDA', detection };
}

/**
 * Phân giải metadata cho Report Specification làm source of truth.
 * @param {Object} reportSpec
 * @param {Object} [context]
 * @returns {Promise<{tables: Array, fields: Array, relationships: Array, businessRules: Array, capabilities: Object}>}
 */
export async function resolveMetadata(reportSpec, context = {}) {
  const hub = context.hub || process.cwd();
  const programPath = context.programPath || context.program;
  const maxRows = context.maxRows || 10000;

  const domain = resolveDomain(reportSpec, context);

  // --- Domain QLDA: schema lấy nguyên từ data/qlda.json, bỏ qua chỉ mục program.
  if (domain.name === 'qlda' && domain.config) {
    const text = [
      context.userRequest,
      context.intent?.originalRequest,
      reportSpec?.title,
    ].filter(Boolean).join(' ');

    return {
      ...buildQldaMetadata(domain.config, { text, maxRows, baseRules: BASE_BUSINESS_RULES }),
      domainReason: domain.reason,
    };
  }

  // --- Domain FBO: schema lấy từ chỉ mục SQLite của chương trình khách.
  const metadata = {
    domain: 'fbo',
    source: programPath ? 'index chương trình' : 'fallback mặc định',
    domainReason: domain.reason,
    tables: [],
    fields: [],
    relationships: [],
    businessRules: [...BASE_BUSINESS_RULES],
    capabilities: {
      maxRows,
      supportsJoins: true,
      supportsAggregations: true,
    },
  };

  if (!programPath) {
    // Basic default fallback metadata khi chưa truyền program
    metadata.tables = [{ name: 'hda', alias: 'hda', title: 'Hóa đơn bán hàng' }];
    metadata.fields = [
      { table: 'hda', name: 'stt_rec', type: 'char', title: 'Stt rec' },
      { table: 'hda', name: 'ngay_ct', type: 'datetime', title: 'Ngày chứng từ' },
      { table: 'hda', name: 'so_ct', type: 'varchar', title: 'Số chứng từ' },
      { table: 'hda', name: 'tien', type: 'numeric', title: 'Tiền' },
      { table: 'hda', name: 'ma_kh', type: 'varchar', title: 'Mã khách hàng' },
    ];
    return metadata;
  }

  try {
    const db = openIndex(hub, programPath);
    if (db) {
      // Soi metadata từ SQLite index của program
      const files = db.prepare('SELECT stem, table_name, title_vi FROM file WHERE table_name IS NOT NULL AND table_name != \'\' LIMIT 50').all();
      for (const f of files) {
        metadata.tables.push({
          name: f.table_name.toLowerCase(),
          alias: f.stem.toLowerCase(),
          title: f.title_vi || f.stem,
        });

        // Lấy danh sách fields từ index nếu có
        const fields = db.prepare('SELECT name, data_type, title_vi FROM field WHERE lower(rel_path) LIKE lower(?) LIMIT 50').all(`%${f.stem}%`);
        for (const fld of fields) {
          metadata.fields.push({
            table: f.table_name.toLowerCase(),
            name: fld.name.toLowerCase(),
            type: fld.data_type || 'varchar',
            title: fld.title_vi || fld.name,
          });
        }
      }
    }
  } catch {
    // Swallowed safely - return gathered metadata
  }

  // Ensure default table if empty
  if (metadata.tables.length === 0) {
    metadata.tables.push({ name: 'hda', alias: 'hda', title: 'Hóa đơn bán hàng' });
    metadata.fields.push(
      { table: 'hda', name: 'ngay_ct', type: 'datetime', title: 'Ngày chứng từ' },
      { table: 'hda', name: 'tien', type: 'numeric', title: 'Tiền' }
    );
  }

  return metadata;
}
