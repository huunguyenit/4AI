// tools.mjs — định nghĩa và thi hành 10 tool của 4ai-fbo.
//
// Nguyên tắc chung cho mọi tool:
//  - Không tồn tại thì nói KHÔNG TỒN TẠI. Không đoán, không sinh nội dung thay thế.
//  - Không bao giờ trả connection string / credential.
//  - Read-only tuyệt đối trên thư mục program. Chỉ ghi vào <hub>/.4ai/index/.

import fs from 'node:fs';
import path from 'node:path';
import { readSource, stripAccents } from './encoding.mjs';
import { buildIndex, openIndex, controllersRoot, indexPathFor } from './index.mjs';
import { runSql, objectSql, sqlLiteral, redact } from './sql.mjs';
import { planReport, executeReport } from '../../../src/workflows/report-workflow.mjs';
import { loadQldaConfig, isPmPlaceholder } from '../../../src/database/qlda-metadata.mjs';

const NOT_FOUND_NOTE =
  'File không tồn tại trong program này. KHÔNG được tự tạo mới hay suy đoán nội dung của nó.';

// ---------------------------------------------------------------- program resolution
//
// Nguồn sự thật là bảng nbdmda trong DB QLDA nội bộ (QLDA_APP) — KHÔNG còn data/customers.json.
// Mỗi dòng nbdmda là MỘT dự án (một khách có thể có nhiều dòng, mã ma_da không phải lúc nào
// cũng trùng tên thân thiện của khách — ví dụ khách "Acme Two" có ma_da='ACME2', khách
// "Acme Three" bản FBI có ma_da='ACME3_FBO' chứ không phải 'ACME3'). `program` truyền vào
// tool phải là ĐÚNG nbdmda.ma_da hoặc đường dẫn program trực tiếp — dùng list_programs để tra
// ma_da đúng trước khi đoán.

const NBDMDA_COLUMNS =
  'ma_da, ten_da, ten_ngan, status, ma_pbsp, sProjectFolder, dir_pro_app, dir_src_app, ' +
  'dir_pro_web, dir_src_web, bp_tk, bp_lt, ma_lt1, ma_lt2, ma_lt3';

/** Kết nối tới DB QLDA (QLDA_APP) — phân giải qua Web.config của chính chương trình QLDA. */
function qldaConnection(hub) {
  const cfg = loadQldaConfig(hub);
  const qlda = cfg?.databases?.qlda;
  if (!qlda?.path || !qlda?.databaseName) {
    throw new Error(
      'Không đọc được cấu hình kết nối QLDA (data/qlda.json → databases.qlda.path/databaseName) — ' +
      'cần cấu hình này để tra nbdmda.');
  }
  return { programPath: qlda.path, database: qlda.databaseName };
}

/** Đường dẫn program của một dòng nbdmda: ưu tiên dir_pro_web (đa số FBO/FBI), rớt về dir_pro_app (dòng FF cũ). */
function programPathFromRow(row) {
  const web = String(row.dir_pro_web || '').trim();
  const app = String(row.dir_pro_app || '').trim();
  const chosen = web || app;
  return chosen ? chosen.replace(/[\\/]+$/, '') : null;
}

function trimmed(v) {
  return String(v ?? '').trim();
}

/** Tra một dòng nbdmda theo đúng ma_da (RTRIM — cột char(32) đệm khoảng trắng). */
function lookupProject(hub, maDa) {
  const { programPath, database } = qldaConnection(hub);
  const lit = sqlLiteral(maDa.trim());
  const res = runSql({
    programPath,
    database,
    dbType: 'app',
    sql: `SELECT ${NBDMDA_COLUMNS} FROM nbdmda WHERE RTRIM(ma_da) = '${lit}'`,
    maxRows: 2,
  });
  return res.rows[0] ?? null;
}

/** Nhận program path trực tiếp hoặc mã dự án (nbdmda.ma_da). */
function resolveProgram(hub, program) {
  if (!program || typeof program !== 'string') {
    throw new Error('Thiếu tham số `program` — truyền đường dẫn program hoặc mã dự án nbdmda.ma_da (xem list_programs).');
  }
  if (program.includes('\\') || program.includes('/') || /^[A-Za-z]:/.test(program)) {
    return path.resolve(program);
  }
  const row = lookupProject(hub, program);
  if (!row) {
    throw new Error(`Không có mã dự án \`${program}\` trong nbdmda (QLDA). ` +
      'Dùng list_programs để tra đúng ma_da, hoặc truyền thẳng đường dẫn program.');
  }
  const programPath = programPathFromRow(row);
  if (!programPath) {
    throw new Error(`Dự án \`${program}\` (${trimmed(row.ten_da)}) không có đường dẫn ở ` +
      'nbdmda.dir_pro_web/dir_pro_app — truyền thẳng đường dẫn program.');
  }
  return programPath;
}

function requireIndex(hub, programPath) {
  const db = openIndex(hub, programPath);
  if (!db) {
    throw new Error(`Program chưa được index: ${programPath}\n` +
      'Chạy tool `index_program` một lần trước, rồi thử lại.');
  }
  return db;
}

function parseJson(s, fallback) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

function fileRow(db, relPath) {
  return db.prepare('SELECT * FROM file WHERE lower(rel_path) = lower(?)').get(relPath);
}

/** Họ file cùng một mã controller, Dir đứng trước. */
function familyRows(db, stem) {
  return db.prepare(
    `SELECT rel_path, folder, ext, title_vi, title_en, field_count, has_pair_f
     FROM file WHERE lower(stem) = lower(?)
       AND folder IN ('Dir','Grid','Filter','Report','Lookup')
     ORDER BY CASE folder WHEN 'Dir' THEN 0 WHEN 'Grid' THEN 1 WHEN 'Filter' THEN 2
                          WHEN 'Report' THEN 3 ELSE 4 END, ext`).all(stem);
}

// ---------------------------------------------------------------- tool定義

export const TOOLS = [
  {
    name: 'list_programs',
    description:
      'Tra dự án FBO/FBI/HRM/FF… trong nbdmda (DB QLDA nội bộ QLDA_APP) theo mã dự án (ma_da), tên, hoặc đường dẫn program — trả về ma_da, tên, phiên bản (ma_pbsp), program path, bộ phận lập trình, trạng thái index cục bộ. Bỏ trống `query` → liệt kê dự án đang hoạt động đứng tên bạn (nbdmda.ma_lt1/2/3, theo data/qlda.local.json → pm.maNv, ghi đè token {PMName} trong data/qlda.json → review.pm). Dùng đầu tiên khi chưa biết program path/ma_da, hoặc để suy ma_da từ thư mục workspace đang đứng (truyền thư mục đó làm `query`).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Từ khoá khớp ma_da, tên dự án (ten_da/ten_ngan), hoặc một đoạn đường dẫn program; bỏ trống = liệt kê dự án đứng tên bạn' },
        limit: { type: 'integer', default: 50, maximum: 200 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'index_program',
    description:
      'Quét và index cây App_Data/Controllers của một program vào SQLite cục bộ trong hub 4AI. Chạy một lần cho mỗi program trước khi dùng các tool tra cứu; chạy lại khi program đổi. Chỉ ĐỌC thư mục program, không bao giờ ghi vào đó.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string', description: 'Program path hoặc mã dự án nbdmda.ma_da (xem list_programs)' },
      },
      required: ['program'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_controller',
    description:
      'Tìm controller theo tên nghiệp vụ, tên field hoặc mã. Tìm trên chỉ mục KHÔNG DẤU — "giay bao no", "phieu chi", "dien giai" đều ra kết quả; có dấu cũng được, tool tự bỏ dấu. Trả về rel_path, folder, title, trạng thái customize.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string' },
        query: { type: 'string', description: 'Từ khoá; nhiều từ = phải khớp tất cả' },
        folder: { type: 'string', description: 'Giới hạn thư mục: Dir, Grid, Filter, Report, Lookup…' },
        limit: { type: 'integer', default: 25, maximum: 200 },
      },
      required: ['program', 'query'],
      additionalProperties: false,
    },
  },
  {
    name: 'describe_controller',
    description:
      'Chi tiết một controller: root tag, type, bảng SQL, title, danh sách field kèm nhãn Việt/Anh, lookup, command, entity include, và trạng thái cặp .f/.xml (có .xml cạnh .f nghĩa là đã customize).',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string' },
        path: { type: 'string', description: "rel_path, ví dụ 'Dir\\\\APTran.xml'" },
        stem: { type: 'string', description: 'Hoặc mã controller, ví dụ APTran' },
        folder: { type: 'string', description: 'Kèm stem để thu hẹp, ví dụ Dir' },
        includeFields: { type: 'boolean', default: true },
      },
      required: ['program'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_related',
    description:
      'Quan hệ của một controller: companion (cùng mã ở Dir/Grid/Filter/Report), lookup (field trỏ tới controller tra cứu), include (entity kéo file dùng chung), used_by (ai đang include file này — dùng để đo phạm vi ảnh hưởng TRƯỚC KHI sửa file trong Include).',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string' },
        path: { type: 'string' },
        kind: { type: 'string', enum: ['companion', 'lookup', 'include', 'used_by', 'all'], default: 'all' },
        limit: { type: 'integer', default: 50, maximum: 500 },
      },
      required: ['program', 'path'],
      additionalProperties: false,
    },
  },
  {
    name: 'resolve_entities',
    description:
      'Liệt kê DTD entity của một controller: tên, đường dẫn SYSTEM, file thật đã phân giải, có được dùng thật trong body không, và số controller khác cùng dùng file đó. Chạy tool này TRƯỚC KHI sửa bất kỳ controller nào có DOCTYPE.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string' },
        path: { type: 'string' },
        name: { type: 'string', description: 'Chỉ một entity; bỏ trống để lấy tất cả' },
        includeContent: { type: 'boolean', default: false, description: 'Kèm nội dung file include' },
      },
      required: ['program', 'path'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_content',
    description:
      'Tìm chuỗi trong nội dung đã index: JS (clientScript), SQL (command), hoặc toàn văn XML. Dùng để trả lời "controller nào gọi hàm WhenVoucherInit" hay "chỗ nào đụng bảng X".',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string' },
        query: { type: 'string' },
        in: { type: 'string', enum: ['js', 'sql', 'xml', 'all'], default: 'all' },
        folder: { type: 'string' },
        limit: { type: 'integer', default: 25, maximum: 200 },
      },
      required: ['program', 'query'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_source',
    description:
      'Đọc nội dung file nguồn, tự phát hiện Windows-1258 vs UTF-8 và BÁO LẠI encoding/BOM/newline gốc để lần ghi sau giữ nguyên. File không tồn tại thì báo không tồn tại — không suy đoán.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string' },
        path: { type: 'string', description: "rel_path trong Controllers, hoặc đường dẫn tương đối từ gốc program" },
        offset: { type: 'integer', default: 1, description: 'Dòng bắt đầu, 1-based' },
        limit: { type: 'integer', default: 200, maximum: 2000 },
      },
      required: ['program', 'path'],
      additionalProperties: false,
    },
  },
  {
    name: 'query_sql',
    description:
      'Chạy SQL trên database của program (kết nối tự phân giải từ Web.config — KHÔNG BAO GIỜ trả về chuỗi kết nối, user hay password). Tên database cũng tự phân giải: db=sys lấy sysConnectionString (placeholder thì rớt về appSetting sysDatabaseName), db=app lấy appConnectionString và nếu gặp %Database thì dò tiếp bảng `entity` của db sys, cột cdata. Chỉ phải truyền `database` khi muốn ép, hoặc `entity` khi program có nhiều entity. Truyền `object` để soi nhanh cấu trúc table/view hoặc định nghĩa proc; hoặc `sql` cho câu tự viết. Mặc định chỉ đọc; câu lệnh ghi bị chặn trừ khi allowWrite=true.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string' },
        object: { type: 'string', description: 'Tên table/view/proc cần soi' },
        sql: { type: 'string', description: 'Câu SQL tự viết' },
        db: { type: 'string', enum: ['app', 'sys'], default: 'app' },
        database: { type: 'string', description: 'Ép tên database, bỏ qua mọi bước phân giải tự động' },
        entity: { type: 'string', description: 'Mã entity (cột code bảng entity) khi program có nhiều entity — chỉ dùng cho db=app' },
        maxRows: { type: 'integer', default: 50, maximum: 1000 },
        allowWrite: { type: 'boolean', default: false, description: 'Bật mới cho phép INSERT/UPDATE/DELETE/DDL' },
      },
      required: ['program'],
      additionalProperties: false,
    },
  },
  {
    name: 'resolve_vouchercode',
    description:
      'Phân giải mã chứng từ (syscode, ví dụ "HDA") ↔ sysid controller (ví dụ "SVTran") theo cả hai chiều. Tra wcommand (db sys: syscode/sysid) và dmct9 (db app: ma_ct/url), rồi tra tiếp controller tương ứng trong chỉ mục program giống find_controller. Ba nguồn độc lập: thiếu sqlcmd hoặc chưa index thì phần chạy được vẫn trả về, phần hỏng báo rõ lý do. Chỉ SELECT có giới hạn trên bảng từ điển hệ thống, không có đường ghi.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string' },
        code: { type: 'string', description: 'Mã chứng từ (ví dụ HDA) hoặc sysid (ví dụ SVTran)' },
        database: { type: 'string', description: 'Ép tên database app — chỉ ảnh hưởng leg dmct9; leg wcommand luôn tự phân giải db sys' },
        entity: { type: 'string', description: 'Mã entity khi program có nhiều entity — chỉ ảnh hưởng leg db app (dmct9)' },
      },
      required: ['program', 'code'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_report',
    description:
      'Phân giải một yêu cầu báo cáo thành metadata + QueryPlan + prompt hoàn chỉnh để BẠN tự viết SQL. Thuần đọc cấu hình, KHÔNG gọi LLM và KHÔNG chạm database. Tự nhận domain: câu hỏi về dự án/yêu cầu (UR)/hạn hoàn thành lấy schema QLDA từ data/qlda.json (DB nội bộ QLDA_APP) kể cả khi truyền program của khách; câu hỏi nghiệp vụ lấy schema từ chỉ mục program. Viết SQL xong thì gọi execute_report.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string', description: 'Program path hoặc mã dự án nbdmda.ma_da (xem list_programs)' },
        request: { type: 'string', description: 'Yêu cầu báo cáo bằng tiếng Việt/Anh nguyên bản' },
        domain: { type: 'string', enum: ['qlda', 'fbo'], description: 'Ép domain, bỏ qua bước tự nhận' },
        maxRows: { type: 'integer', default: 10000, description: 'Giới hạn số dòng đưa vào QueryPlan' },
      },
      required: ['request'],
      additionalProperties: false,
    },
  },
  {
    name: 'execute_report',
    description:
      'Chạy câu SELECT do bạn viết từ prompt của plan_report. SQL được đối chiếu lại với ĐÚNG metadata đã chốt ở bước plan (bảng, cột, bảng/cột bị cấm) trước khi thực thi read-only. Sai schema thì trả VALIDATION_FAILED, không có gì chạm database.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Mã planId được trả về từ tool plan_report' },
        sql: { type: 'string', description: 'Câu SELECT bạn tự viết theo SCHEMA trong prompt của plan' },
        program: { type: 'string', description: 'Ép nơi chạy — mặc định lấy từ metadata của plan' },
        database: { type: 'string', description: 'Ép tên database — mặc định lấy từ metadata của plan' },
        maxRows: { type: 'integer', maximum: 10000 },
      },
      required: ['planId', 'sql'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_review_dataset',
    description:
      'Trả về MỘT dataset thô đã JOIN sẵn nbphyc + nbdmda + nbcnhanhtda + nbctdaumuc (QLDA · QLDA_APP) — thay cho việc query rời từng bảng rồi tự ghép bằng tay/script. Mỗi UR là một object, kèm hạn hiệu lực (ngay_ht/xac_nhan_da_hen_yn/giai_doan_noi_dung của đúng dòng MAX ngay_ht theo giai_doan_da) và mảng con daumuc[] (nbctdaumuc, rỗng nếu UR không có đầu mục). Lọc theo project (ma_da), pmName (nbdmda.ma_lt1/2/3), pmDept (nbphyc.bp_lt), statusUR (nbphyc.trang_thai) — mỗi filter tuỳ chọn, kết hợp AND; bỏ trống CẢ BA thì lấy pm.maNv từ data/qlda.local.json (pmDept một mình vẫn có nghĩa là toàn phòng, không tự thêm PM).',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Mã dự án nbdmda.ma_da — có thì chỉ lấy đúng dự án này' },
        pmName: { type: 'string', description: 'Lọc dự án theo nbdmda.ma_lt1/ma_lt2/ma_lt3. Bỏ trống (và không truyền project) thì lấy pm.maNv từ qlda.local.json' },
        pmDept: { type: 'string', description: 'Lọc yêu cầu theo nbphyc.bp_lt (bộ phận lập trình)' },
        statusUR: { type: 'array', items: { type: 'string' }, description: "Lọc nbphyc.trang_thai. Bỏ trống mặc định ['DD','XN','TH'] (phạm vi PM review)" },
        maxRows: { type: 'integer', default: 5000, maximum: 10000, description: 'Giới hạn dòng THÔ (trước khi gộp đầu mục) — UR có nhiều đầu mục tính nhiều dòng' },
      },
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------- handlers

const WRITE_SQL = /\b(insert|update|delete|merge|truncate|drop|alter|create|exec|execute|grant|revoke)\b/i;

export const HANDLERS = {
  list_programs(hub, args = {}) {
    const { programPath, database } = qldaConnection(hub);
    const limit = Math.min(args.limit ?? 50, 200);
    const query = trimmed(args.query);

    const cfg = loadQldaConfig(hub);
    // review.pm trong qlda.json có thể còn token sync `{PMName}` — loadQldaConfig đã gán từ
    // qlda.local.json; nếu vẫn placeholder thì coi như chưa cấu hình PM trên máy này.
    const pmCode = trimmed(cfg?.review?.pm?.maNv);
    const pmResolved = !isPmPlaceholder(pmCode) ? pmCode : '';

    let scope, sql;
    if (query) {
      const lit = sqlLiteral(query);
      scope = `tìm kiếm \`${query}\``;
      // Khớp cả theo đường dẫn (dir_pro_web/dir_pro_app) — cho phép truyền thẳng thư mục
      // workspace đang đứng để tra ra ma_da, không cần biết mã trước (rule pm-program-from-workspace).
      sql = `SELECT ${NBDMDA_COLUMNS} FROM nbdmda WHERE status = '1' AND ` +
        `(RTRIM(ma_da) LIKE '%${lit}%' OR ten_da LIKE N'%${lit}%' OR ten_ngan LIKE N'%${lit}%' ` +
        `OR dir_pro_web LIKE '%${lit}%' OR dir_pro_app LIKE '%${lit}%') ORDER BY ma_da`;
    } else if (pmResolved) {
      const lit = sqlLiteral(pmResolved);
      scope = `dự án đứng tên lập trình ${pmResolved}`;
      sql = `SELECT ${NBDMDA_COLUMNS} FROM nbdmda WHERE status = '1' AND ` +
        `(RTRIM(ma_lt1) = '${lit}' OR RTRIM(ma_lt2) = '${lit}' OR RTRIM(ma_lt3) = '${lit}') ORDER BY ma_da`;
    } else {
      throw new Error(
        'Thiếu `query` và chưa gán PM — khai `pm.maNv` trong data/qlda.local.json ' +
        '(ghi đè token {PMName} của data/qlda.json → review.pm), hoặc truyền `query` (mã dự án hoặc tên) để tìm.');
    }

    const res = runSql({ programPath, database, dbType: 'app', sql, maxRows: limit });
    const rows = res.rows.map((r) => {
      const rowProgramPath = programPathFromRow(r);
      return {
        maDa: trimmed(r.ma_da),
        name: trimmed(r.ten_da),
        shortName: trimmed(r.ten_ngan) || undefined,
        sp: trimmed(r.ma_pbsp) || undefined,
        programPath: rowProgramPath,
        reachable: rowProgramPath ? fs.existsSync(rowProgramPath) : false,
        indexed: rowProgramPath ? fs.existsSync(indexPathFor(hub, rowProgramPath)) : false,
        bpLt: trimmed(r.bp_lt) || undefined,
        lt: [r.ma_lt1, r.ma_lt2, r.ma_lt3].map(trimmed).filter(Boolean),
      };
    });

    return {
      source: 'nbdmda (QLDA · QLDA_APP)',
      scope,
      count: rows.length,
      truncated: res.truncated,
      programs: rows,
      hint: 'Program chưa `indexed` thì chạy index_program trước. Không thấy dự án cần tìm thì truyền `query` khớp ma_da hoặc tên. `reachable: false` thường do share mạng chưa kết nối. Tên (`name`/`shortName`) có thể mất dấu tiếng Việt do codepage sqlcmd — đừng copy nguyên văn vào tài liệu bàn giao.',
    };
  },

  index_program(hub, args) {
    const programPath = resolveProgram(hub, args.program);
    if (!fs.existsSync(programPath)) {
      throw new Error(`Program path không tồn tại hoặc không truy cập được: ${programPath}`);
    }
    const root = controllersRoot(programPath);
    if (!root) throw new Error(`Không tìm thấy App_Data\\Controllers trong: ${programPath}`);
    const stats = buildIndex(hub, programPath);
    return { ...stats, indexFile: indexPathFor(hub, programPath) };
  },

  find_controller(hub, args) {
    const programPath = resolveProgram(hub, args.program);
    const db = requireIndex(hub, programPath);
    try {
      const terms = stripAccents(args.query).split(/\s+/).filter(Boolean);
      if (terms.length === 0) throw new Error('`query` rỗng.');
      const where = ['search_blob LIKE ?'];
      const params = [`%${terms[0]}%`];
      for (const t of terms.slice(1)) { where.push('search_blob LIKE ?'); params.push(`%${t}%`); }
      if (args.folder) { where.push('folder = ?'); params.push(args.folder); }
      const limit = Math.min(args.limit ?? 25, 200);

      const rows = db.prepare(
        `SELECT rel_path, folder, stem, ext, root_tag, controller_type, table_name,
                title_vi, title_en, field_count, has_pair_xml, has_pair_f
         FROM file WHERE ${where.join(' AND ')}
         ORDER BY CASE folder WHEN 'Dir' THEN 0 WHEN 'Grid' THEN 1 WHEN 'Filter' THEN 2
                              WHEN 'Report' THEN 3 WHEN 'Lookup' THEN 4 ELSE 5 END,
                  stem, ext
         LIMIT ?`).all(...params, limit + 1);

      // Gom theo MÃ controller, không theo file. Lý do: bản .f mã hoá không bóc được
      // title/field nên không bao giờ tự khớp từ khoá nghiệp vụ — nhưng nó thường CHÍNH LÀ
      // màn hình người dùng đang hỏi. Khớp ở Report\CPTran.xml phải kéo Dir\CPTran.f theo.
      const seen = new Set();
      const groups = [];
      for (const r of rows) {
        const key = r.stem.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (groups.length >= limit) break;
        const family = familyRows(db, r.stem);
        const entry = family.find((x) => x.folder === 'Dir') ?? r;
        groups.push({
          controller: r.stem,
          matchedIn: r.rel_path,
          entry: entry.rel_path ?? r.rel_path,
          title: family.map((x) => x.title_vi || x.title_en).find(Boolean) ?? null,
          type: r.controller_type,
          table: r.table_name,
          customized: family.some((x) => x.ext === '.xml' && x.has_pair_f === 1),
          files: family.map((x) => x.rel_path),
        });
      }

      return {
        program: programPath,
        query: args.query,
        normalized: terms.join(' '),
        count: groups.length,
        truncated: rows.length > limit,
        results: groups,
        note: 'Kết quả gom theo mã controller. `matchedIn` là file thật sự khớp từ khoá; `entry` là màn hình nhập chính. File .f mã hoá không bóc được nội dung nên không tự khớp — nó xuất hiện qua họ file cùng mã.',
        hint: groups.length === 0
          ? 'Không có kết quả. Thử từ khoá ngắn hơn, tên field (dien_giai, ten_vt), hoặc mã controller trực tiếp. Kết quả rỗng KHÔNG có nghĩa màn hình không tồn tại.'
          : undefined,
      };
    } finally { db.close(); }
  },

  describe_controller(hub, args) {
    const programPath = resolveProgram(hub, args.program);
    const db = requireIndex(hub, programPath);
    try {
      let row;
      if (args.path) {
        row = fileRow(db, args.path);
      } else if (args.stem) {
        const q = args.folder
          ? db.prepare('SELECT * FROM file WHERE lower(stem) = lower(?) AND folder = ? ORDER BY ext DESC')
          : db.prepare('SELECT * FROM file WHERE lower(stem) = lower(?) ORDER BY folder, ext DESC');
        const all = args.folder ? q.all(args.stem, args.folder) : q.all(args.stem);
        if (all.length > 1 && !args.folder) {
          return {
            program: programPath,
            ambiguous: true,
            message: `Mã \`${args.stem}\` có ở nhiều nơi — chọn một rồi gọi lại với \`path\`.`,
            candidates: all.map((r) => ({ path: r.rel_path, folder: r.folder, ext: r.ext })),
          };
        }
        row = all[0];
      } else {
        throw new Error('Cần `path` hoặc `stem`.');
      }
      if (!row) {
        return { program: programPath, found: false, requested: args.path ?? args.stem, note: NOT_FOUND_NOTE };
      }

      const pairs = db.prepare(
        'SELECT rel_path, ext FROM file WHERE folder = ? AND lower(stem) = lower(?) ORDER BY ext')
        .all(row.folder, row.stem);

      return {
        program: programPath,
        found: true,
        path: row.rel_path,
        folder: row.folder,
        stem: row.stem,
        ext: row.ext,
        rootTag: row.root_tag,
        type: row.controller_type,
        table: row.table_name,
        title: { vi: row.title_vi, en: row.title_en },
        encoding: { charset: row.encoding, bom: row.bom === 1, newline: row.newline },
        bytes: row.bytes,
        pair: {
          files: pairs.map((p) => p.rel_path),
          customized: row.has_pair_xml === 1 && row.has_pair_f === 1,
          note: row.has_pair_xml === 1 && row.has_pair_f === 1
            ? 'Có .xml cạnh .f ⇒ màn hình này ĐÃ customize. Sửa vào .xml, không đụng .f.'
            : row.ext === '.f'
              ? 'Chỉ có .f, chưa có XML nguồn. Muốn customize phải lấy XML nguồn theo quy trình của Fast — KHÔNG tự dựng file mới.'
              : undefined,
        },
        counts: {
          fields: row.field_count,
          jsChars: row.js_chars,
          sqlChars: row.sql_chars,
        },
        commands: parseJson(row.commands_json, []),
        entities: parseJson(row.entities_json, []).filter((e) => e.resolved).map((e) => e.name),
        fields: args.includeFields === false ? undefined : parseJson(row.fields_json, []),
      };
    } finally { db.close(); }
  },

  list_related(hub, args) {
    const programPath = resolveProgram(hub, args.program);
    const db = requireIndex(hub, programPath);
    try {
      const row = fileRow(db, args.path);
      if (!row) return { program: programPath, found: false, requested: args.path, note: NOT_FOUND_NOTE };
      const kind = args.kind ?? 'all';
      const limit = Math.min(args.limit ?? 50, 500);
      const out = { program: programPath, path: row.rel_path };

      const outgoing = (k) => db.prepare(
        `SELECT f.rel_path, f.folder, f.ext, r.detail
         FROM rel r JOIN file f ON f.id = r.dst_id
         WHERE r.src_id = ? AND r.kind = ? ORDER BY f.rel_path LIMIT ?`).all(row.id, k, limit);

      if (kind === 'companion' || kind === 'all') {
        out.companion = outgoing('companion').map((r) => ({ path: r.rel_path, folder: r.folder }));
      }
      if (kind === 'lookup' || kind === 'all') {
        out.lookup = outgoing('lookup').map((r) => ({ field: r.detail, path: r.rel_path }));
      }
      if (kind === 'include' || kind === 'all') {
        out.include = outgoing('include').map((r) => ({ entity: r.detail, path: r.rel_path }));
      }
      if (kind === 'used_by' || kind === 'all') {
        const total = db.prepare(
          "SELECT count(DISTINCT src_id) AS n FROM rel WHERE dst_id = ? AND kind = 'include'")
          .get(row.id).n;
        const rows = db.prepare(
          `SELECT f.rel_path, r.detail FROM rel r JOIN file f ON f.id = r.src_id
           WHERE r.dst_id = ? AND r.kind = 'include' ORDER BY f.rel_path LIMIT ?`).all(row.id, limit);
        out.usedBy = {
          total,
          shown: rows.length,
          controllers: rows.map((r) => ({ path: r.rel_path, entity: r.detail })),
        };
        if (row.folder === 'Include') {
          out.usedBy.warning = `File này nằm trong Include\\ và đang được ${total} controller dùng chung. ` +
            'Sửa nó là thay đổi toàn hệ thống của program, KHÔNG phải customize một màn hình.';
        }
      }
      return out;
    } finally { db.close(); }
  },

  resolve_entities(hub, args) {
    const programPath = resolveProgram(hub, args.program);
    const db = requireIndex(hub, programPath);
    try {
      const row = fileRow(db, args.path);
      if (!row) return { program: programPath, found: false, requested: args.path, note: NOT_FOUND_NOTE };

      let ents = db.prepare('SELECT * FROM entity_ref WHERE file_id = ? ORDER BY name').all(row.id);
      if (args.name) ents = ents.filter((e) => e.name === args.name);

      const root = controllersRoot(programPath);
      const result = ents.map((e) => {
        const target = e.resolved ? fileRow(db, e.resolved) : null;
        const sharedBy = target
          ? db.prepare("SELECT count(DISTINCT src_id) AS n FROM rel WHERE dst_id = ? AND kind = 'include'")
            .get(target.id).n
          : null;
        const item = {
          name: e.name,
          parameter: e.is_parameter === 1,
          systemPath: e.system_path,
          resolved: e.resolved,
          exists: !!target,
          usedInBody: e.used === 1,
          sharedByControllers: sharedBy,
        };
        if (!target && e.resolved) item.note = `Không tìm thấy \`${e.resolved}\` trong index. ${NOT_FOUND_NOTE}`;
        if (args.includeContent && target && root) {
          try {
            const src = readSource(path.join(root, target.rel_path));
            item.content = src.text.length > 20000 ? src.text.slice(0, 20000) + '\n… (cắt bớt)' : src.text;
            item.encoding = { charset: src.encoding, bom: src.bom, newline: src.newline };
          } catch (err) {
            item.contentError = redact(String(err.message));
          }
        }
        return item;
      });

      return {
        program: programPath,
        path: row.rel_path,
        count: result.length,
        entities: result,
        hint: 'sharedByControllers > 1 nghĩa là file include đó dùng chung — sửa nó ảnh hưởng tất cả controller đang liệt kê ở used_by.',
      };
    } finally { db.close(); }
  },

  search_content(hub, args) {
    const programPath = resolveProgram(hub, args.program);
    const db = requireIndex(hub, programPath);
    try {
      const scope = args.in ?? 'all';
      const cols = scope === 'js' ? ['js_text'] : scope === 'sql' ? ['sql_text'] : ['js_text', 'sql_text'];
      const limit = Math.min(args.limit ?? 25, 200);
      const where = [`(${cols.map((c) => `${c} LIKE ?`).join(' OR ')})`];
      const params = cols.map(() => `%${args.query}%`);
      if (args.folder) { where.push('folder = ?'); params.push(args.folder); }

      const rows = db.prepare(
        `SELECT rel_path, folder, js_chars, sql_chars, js_text, sql_text
         FROM file WHERE ${where.join(' AND ')} ORDER BY rel_path LIMIT ?`).all(...params, limit + 1);

      const snip = (text) => {
        const i = text.toLowerCase().indexOf(args.query.toLowerCase());
        if (i === -1) return null;
        return text.slice(Math.max(0, i - 80), i + args.query.length + 80).replace(/\s+/g, ' ').trim();
      };

      return {
        program: programPath,
        query: args.query,
        scope,
        count: Math.min(rows.length, limit),
        truncated: rows.length > limit,
        results: rows.slice(0, limit).map((r) => ({
          path: r.rel_path,
          folder: r.folder,
          jsChars: r.js_chars,
          sqlChars: r.sql_chars,
          snippetJs: cols.includes('js_text') && r.js_text ? snip(r.js_text) : undefined,
          snippetSql: cols.includes('sql_text') && r.sql_text ? snip(r.sql_text) : undefined,
        })),
        note: scope === 'xml'
          ? 'Chỉ index JS và SQL đã bóc tách; để quét toàn văn XML hãy dùng read_source trên file cụ thể.'
          : undefined,
      };
    } finally { db.close(); }
  },

  read_source(hub, args) {
    const programPath = resolveProgram(hub, args.program);
    const root = controllersRoot(programPath);
    const candidates = [
      root ? path.join(root, args.path) : null,
      path.join(programPath, args.path),
    ].filter(Boolean);

    const abs = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
    if (!abs) {
      return { program: programPath, found: false, requested: args.path, note: NOT_FOUND_NOTE };
    }
    // Chặn thoát ra ngoài program.
    const resolved = path.resolve(abs);
    if (!resolved.toLowerCase().startsWith(path.resolve(programPath).toLowerCase())) {
      throw new Error('Đường dẫn thoát ra ngoài thư mục program — từ chối.');
    }

    const src = readSource(resolved);
    const lines = src.text.split(/\r?\n/);
    const offset = Math.max(1, args.offset ?? 1);
    const limit = Math.min(args.limit ?? 200, 2000);
    const slice = lines.slice(offset - 1, offset - 1 + limit);

    return {
      program: programPath,
      path: args.path,
      encoding: {
        charset: src.encoding,
        bom: src.bom,
        newline: src.newline,
        note: 'Ghi lại file này PHẢI giữ nguyên charset/bom/newline ở trên. Không bao giờ normalize sang UTF-8 LF.',
      },
      totalLines: lines.length,
      offset,
      shown: slice.length,
      content: slice.map((l, i) => `${offset + i}\t${l}`).join('\n'),
    };
  },

  query_sql(hub, args) {
    const programPath = resolveProgram(hub, args.program);
    if (!args.sql && !args.object) throw new Error('Cần `sql` hoặc `object`.');

    const sql = args.object ? objectSql(args.object) : args.sql;
    if (!args.object && WRITE_SQL.test(sql) && args.allowWrite !== true) {
      throw new Error(
        'Câu lệnh có vẻ ghi dữ liệu (INSERT/UPDATE/DELETE/DDL/EXEC) và đây là database THẬT của khách. ' +
        'Nếu thực sự có chủ đích, gọi lại với allowWrite: true — và nêu câu lệnh cho người dùng duyệt trước.');
    }

    try {
      const res = runSql({
        programPath,
        sql,
        dbType: args.db ?? 'app',
        database: args.database,
        entity: args.entity,
        maxRows: Math.min(args.maxRows ?? 50, 1000),
      });
      return {
        program: programPath,
        database: res.database,
        object: args.object,
        columns: res.columns,
        rowCount: res.rowCount,
        rows: res.rows,
        truncated: res.truncated,
        warning: res.stderr,
        note: 'Kết nối phân giải từ Web.config nội bộ — connection string không bao giờ được trả về.',
      };
    } catch (e) {
      throw new Error(redact(e.message));
    }
  },

  resolve_vouchercode(hub, args) {
    const programPath = resolveProgram(hub, args.program);
    const code = typeof args.code === 'string' ? args.code.trim() : '';
    if (!code) {
      throw new Error('Thiếu tham số `code` — truyền mã chứng từ (ví dụ HDA) hoặc sysid (ví dụ SVTran).');
    }
    const lit = sqlLiteral(code);

    // Ba nguồn chạy độc lập: hỏng nguồn này không được giết kết quả của nguồn kia.
    // Thiếu sqlcmd thì hai leg SQL hỏng nhưng leg chỉ mục vẫn dùng được nếu code chính là sysid.
    const leg = (fn) => {
      try { return { ok: true, data: fn() }; } catch (e) { return { ok: false, error: redact(e.message) }; }
    };

    // `database`/`entity` chỉ áp cho leg app: leg sys tự phân giải qua sysDatabaseName, ép tên
    // database app vào đó là gọi nhầm chỗ.
    const w = leg(() => runSql({
      programPath,
      sql: `SELECT * FROM wcommand WHERE syscode = '${lit}' OR sysid = '${lit}'`,
      dbType: 'sys',
      maxRows: 10,
    }));
    const d = leg(() => runSql({
      programPath,
      sql: `SELECT * FROM dmct9 WHERE ma_ct = '${lit}'`,
      dbType: 'app',
      database: args.database,
      entity: args.entity,
      maxRows: 10,
    }));

    const wRows = w.ok ? w.data.rows : [];
    const dRows = d.ok ? d.data.rows : [];
    const sysid = wRows[0]?.sysid || null;
    const stem = sysid ?? code;

    let controller;
    const db = openIndex(hub, programPath);
    if (!db) {
      controller = {
        found: false,
        sysid: stem,
        note: `Program chưa được index — chạy index_program rồi gọi lại để tra controller cho \`${stem}\`.`,
      };
    } else {
      try {
        const family = familyRows(db, stem);
        if (family.length === 0) {
          controller = {
            found: false,
            sysid: stem,
            note: `Không có controller mã \`${stem}\` trong chỉ mục program này. ${NOT_FOUND_NOTE}`,
          };
        } else {
          const entry = family.find((x) => x.folder === 'Dir') ?? family[0];
          controller = {
            found: true,
            controller: stem,
            entry: entry.rel_path,
            title: family.map((x) => x.title_vi || x.title_en).find(Boolean) ?? null,
            customized: family.some((x) => x.ext === '.xml' && x.has_pair_f === 1),
            files: family.map((x) => x.rel_path),
          };
        }
      } finally { db.close(); }
    }

    return {
      program: programPath,
      code,
      wcommand: {
        found: wRows.length > 0,
        database: w.ok ? w.data.database : undefined,
        rows: wRows,
        truncated: w.ok ? w.data.truncated : undefined,
        error: w.ok ? undefined : w.error,
      },
      dmct9: {
        found: dRows.length > 0,
        database: d.ok ? d.data.database : undefined,
        rows: dRows,
        truncated: d.ok ? d.data.truncated : undefined,
        error: d.ok ? undefined : d.error,
        note: dRows.length > 0
          ? 'Cột `url` trỏ một trang ASPX dưới Main\\ — chỉ để tham khảo, tool không tự phân tích ASPX.'
          : undefined,
      },
      resolved: { sysid: stem, from: sysid ? 'wcommand' : 'input' },
      controller,
      note: sysid
        ? undefined
        : w.ok
          ? `wcommand không có dòng nào khớp \`${code}\` (cả syscode lẫn sysid) — đang coi \`${code}\` là sysid để tra chỉ mục.`
          : `Không tra được wcommand nên chưa phân giải được mã chứng từ — đang coi \`${code}\` là sysid để tra chỉ mục.`,
    };
  },

  async plan_report(hub, args) {
    const programPath = args.program ? resolveProgram(hub, args.program) : null;
    return await planReport(args.request, {
      hub,
      programPath,
      domain: args.domain,
      maxRows: args.maxRows,
    });
  },

  async execute_report(hub, args) {
    const programPath = args.program ? resolveProgram(hub, args.program) : null;
    return await executeReport(args.planId, args.sql, {
      hub,
      programPath,
      database: args.database,
      maxRows: args.maxRows,
    });
  },

  get_review_dataset(hub, args = {}) {
    const { programPath, database } = qldaConnection(hub);
    const project = trimmed(args.project);
    let pmName = trimmed(args.pmName);
    const pmDept = trimmed(args.pmDept);
    // Chỉ rớt về pm.maNv mặc định khi CẢ BA filter đều bỏ trống — pmDept một mình nghĩa là
    // "toàn bộ phòng", không phải "phòng của PM này"; tự thêm pmName vào sẽ lọc hẹp sai ý.
    if (!project && !pmName && !pmDept) {
      const cfg = loadQldaConfig(hub);
      const pmCode = trimmed(cfg?.review?.pm?.maNv);
      pmName = !isPmPlaceholder(pmCode) ? pmCode : '';
    }
    if (!project && !pmName && !pmDept) {
      throw new Error(
        'Cần ít nhất một trong project / pmName / pmDept — hoặc gán pm.maNv trong data/qlda.local.json.');
    }
    const statusList = (Array.isArray(args.statusUR) && args.statusUR.length ? args.statusUR : ['DD', 'XN', 'TH'])
      .map(trimmed).filter(Boolean);
    if (statusList.length === 0) {
      throw new Error('statusUR rỗng sau khi lọc — truyền ít nhất một mã trạng thái.');
    }

    const where = [];
    if (project) where.push(`RTRIM(dm.ma_da) = '${sqlLiteral(project)}'`);
    if (pmName) {
      const lit = sqlLiteral(pmName);
      where.push(`(RTRIM(dm.ma_lt1) = '${lit}' OR RTRIM(dm.ma_lt2) = '${lit}' OR RTRIM(dm.ma_lt3) = '${lit}')`);
    }
    if (pmDept) where.push(`RTRIM(yc.bp_lt) = '${sqlLiteral(pmDept)}'`);
    where.push(`RTRIM(yc.trang_thai) IN (${statusList.map((s) => `'${sqlLiteral(s)}'`).join(', ')})`);

    const maxRows = Math.min(args.maxRows ?? 5000, 10000);
    const sql = `
SELECT
  RTRIM(dm.ma_da)        AS ma_da,
  RTRIM(dm.ten_ngan)     AS ten_ngan,
  RTRIM(dm.ma_pbsp)      AS ma_pbsp,
  RTRIM(dm.bp_lt)        AS project_bp_lt,
  RTRIM(dm.ma_lt1)       AS project_ma_lt1,
  RTRIM(dm.ma_lt2)       AS project_ma_lt2,
  RTRIM(dm.ma_lt3)       AS project_ma_lt3,
  RTRIM(yc.stt_rec)      AS stt_rec,
  RTRIM(yc.fcode1)       AS fcode1,
  REPLACE(REPLACE(REPLACE(ISNULL(yc.noi_dung,''),CHAR(13),' '),CHAR(10),' '),CHAR(9),' ') AS noi_dung,
  LEN(yc.noi_dung)       AS noi_dung_len,
  RTRIM(yc.giai_doan_da) AS giai_doan_da,
  RTRIM(yc.trang_thai)   AS trang_thai,
  RTRIM(yc.menu_id)      AS menu_id,
  RTRIM(yc.sysid)        AS sysid,
  yc.tlks_yn             AS tlks_yn,
  RTRIM(REPLACE(REPLACE(REPLACE(ISNULL(yc.trang_tlks,''),CHAR(13),' '),CHAR(10),' '),CHAR(9),' ')) AS trang_tlks,
  RTRIM(yc.ma_lt1)       AS ur_ma_lt1,
  RTRIM(yc.bp_lt)        AS ur_bp_lt,
  yc.tg_dk_th            AS tg_dk_th,
  hh.ngay_ht             AS ngay_ht,
  hh.xac_nhan_da_hen_yn  AS xac_nhan_da_hen_yn,
  hh.noi_dung            AS giai_doan_noi_dung,
  RTRIM(dmuc.stt_rec0)   AS daumuc_stt_rec0,
  RTRIM(dmuc.ma_daumuc)  AS ma_daumuc,
  REPLACE(REPLACE(REPLACE(ISNULL(dmuc.ten_daumuc,''),CHAR(13),' '),CHAR(10),' '),CHAR(9),' ') AS ten_daumuc,
  RTRIM(dmuc.ma_lt)      AS daumuc_ma_lt,
  RTRIM(dmuc.ma_tester)  AS daumuc_ma_tester,
  dmuc.so_luong          AS daumuc_so_luong,
  dmuc.stt               AS daumuc_stt
FROM nbphyc yc
LEFT JOIN nbdmda dm ON RTRIM(yc.ma_da) = RTRIM(dm.ma_da)
LEFT JOIN (
  -- Tự-join vào đúng dòng có ngay_ht = MAX — lấy noi_dung/xac_nhan_da_hen_yn CỦA dòng hạn
  -- hiện tại, không phải MAX/aggregate gộp cả lịch sử dời hạn (nbcnhanhtda mỗi hạn khác nhau
  -- là một dòng khác, xem data/qlda.json → capNhatHanHoanThanh.purpose).
  SELECT RTRIM(h.ma_da) AS ma_da, h.giai_doan_da, h.ngay_ht, h.xac_nhan_da_hen_yn,
         REPLACE(REPLACE(REPLACE(ISNULL(h.noi_dung,''),CHAR(13),' '),CHAR(10),' '),CHAR(9),' ') AS noi_dung
  FROM nbcnhanhtda h
  INNER JOIN (
    SELECT RTRIM(ma_da) AS ma_da, giai_doan_da, MAX(ngay_ht) AS ngay_ht
    FROM nbcnhanhtda GROUP BY RTRIM(ma_da), giai_doan_da
  ) m ON RTRIM(h.ma_da) = m.ma_da AND h.giai_doan_da = m.giai_doan_da AND h.ngay_ht = m.ngay_ht
) hh ON hh.ma_da = RTRIM(yc.ma_da) AND hh.giai_doan_da = yc.giai_doan_da
LEFT JOIN nbctdaumuc dmuc ON dmuc.stt_rec = yc.stt_rec
WHERE ${where.join(' AND ')}
ORDER BY RTRIM(dm.ma_da), RTRIM(yc.giai_doan_da), RTRIM(yc.stt_rec), RTRIM(dmuc.stt_rec0)`.trim();

    const res = runSql({ programPath, database, dbType: 'app', sql, maxRows });

    // Gộp theo stt_rec ngay ở đây — KHÔNG trả flat rows buộc agent tự JOIN lại bằng tay/script.
    const byUr = new Map();
    for (const r of res.rows) {
      const key = trimmed(r.stt_rec);
      if (!byUr.has(key)) {
        byUr.set(key, {
          ma_da: trimmed(r.ma_da),
          ten_ngan: trimmed(r.ten_ngan) || undefined,
          ma_pbsp: trimmed(r.ma_pbsp) || undefined,
          project_bp_lt: trimmed(r.project_bp_lt) || undefined,
          project_lt: [r.project_ma_lt1, r.project_ma_lt2, r.project_ma_lt3].map(trimmed).filter(Boolean),
          stt_rec: key,
          fcode1: trimmed(r.fcode1) || undefined,
          noi_dung: r.noi_dung,
          noi_dung_len: r.noi_dung_len !== undefined ? Number(r.noi_dung_len) : undefined,
          giai_doan_da: trimmed(r.giai_doan_da) || undefined,
          trang_thai: trimmed(r.trang_thai),
          menu_id: trimmed(r.menu_id) || undefined,
          sysid: trimmed(r.sysid) || undefined,
          tlks_yn: r.tlks_yn,
          trang_tlks: trimmed(r.trang_tlks) || undefined,
          ur_ma_lt1: trimmed(r.ur_ma_lt1) || undefined,
          ur_bp_lt: trimmed(r.ur_bp_lt) || undefined,
          tg_dk_th: r.tg_dk_th,
          ngay_ht: r.ngay_ht || undefined,
          xac_nhan_da_hen_yn: r.xac_nhan_da_hen_yn,
          giai_doan_noi_dung: r.giai_doan_noi_dung || undefined,
          daumuc: [],
        });
      }
      const daumucKey = trimmed(r.daumuc_stt_rec0);
      if (daumucKey) {
        byUr.get(key).daumuc.push({
          stt_rec0: daumucKey,
          ma_daumuc: trimmed(r.ma_daumuc) || undefined,
          ten_daumuc: r.ten_daumuc || undefined,
          ma_lt: trimmed(r.daumuc_ma_lt) || undefined,
          ma_tester: trimmed(r.daumuc_ma_tester) || undefined,
          so_luong: r.daumuc_so_luong,
          stt: r.daumuc_stt,
        });
      }
    }

    return {
      source: 'nbphyc + nbdmda + nbcnhanhtda + nbctdaumuc (QLDA · QLDA_APP)',
      filters: { project: project || undefined, pmName: pmName || undefined, pmDept: pmDept || undefined, statusUR: statusList },
      count: byUr.size,
      truncated: res.truncated,
      yeuCau: [...byUr.values()],
      hint: 'Mỗi phần tử `yeuCau[]` là MỘT UR — không lặp lại theo đầu mục; `daumuc[]` bên trong đã gộp sẵn (rỗng nếu UR không có đầu mục), không cần tự JOIN lại. ' +
        '`ngay_ht`/`xac_nhan_da_hen_yn` lấy theo (ma_da, giai_doan_da) — dự án nhiều bộ phận cùng giai đoạn có thể gộp hạn của bộ phận khác, giống hành vi tài liệu cũ. ' +
        '`truncated: true` nghĩa là dòng thô (trước khi gộp) bị cắt ở `maxRows` — UR cuối cùng trong danh sách có thể thiếu vài dòng đầu mục, tăng `maxRows` hoặc lọc hẹp lại (project/pmDept) nếu cần đủ. ' +
        'noi_dung mất dấu tiếng Việt do codepage sqlcmd — đối chiếu `noi_dung_len` (LEN thật trong DB) trước khi coi nội dung đã lấy đủ, đừng copy nguyên văn vào báo cáo.',
    };
  },
};
