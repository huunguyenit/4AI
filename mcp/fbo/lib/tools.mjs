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

const NOT_FOUND_NOTE =
  'File không tồn tại trong program này. KHÔNG được tự tạo mới hay suy đoán nội dung của nó.';

// ---------------------------------------------------------------- program resolution

function customersFile(hub) {
  return path.join(hub, 'data', 'customers.json');
}

function loadCustomers(hub) {
  const f = customersFile(hub);
  if (!fs.existsSync(f)) return [];
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')).customers ?? [];
  } catch {
    return [];
  }
}

/** Nhận program path trực tiếp hoặc mã khách trong data/customers.json. */
function resolveProgram(hub, program) {
  if (!program || typeof program !== 'string') {
    throw new Error('Thiếu tham số `program` — truyền đường dẫn program hoặc mã khách (xem list_programs).');
  }
  if (program.includes('\\') || program.includes('/') || /^[A-Za-z]:/.test(program)) {
    return path.resolve(program);
  }
  const hit = loadCustomers(hub).find((c) => c.code.toLowerCase() === program.toLowerCase());
  if (!hit) {
    throw new Error(`Không có mã khách \`${program}\` trong data/customers.json. ` +
      'Dùng list_programs để xem danh sách, hoặc truyền thẳng đường dẫn program.');
  }
  return hit.programPath;
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
      'Liệt kê các chương trình FBO/FBI đã đăng ký trong data/customers.json (mã khách, dòng sản phẩm, SP, program path, trạng thái index). Dùng đầu tiên khi chưa biết program path.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'index_program',
    description:
      'Quét và index cây App_Data/Controllers của một program vào SQLite cục bộ trong hub 4AI. Chạy một lần cho mỗi program trước khi dùng các tool tra cứu; chạy lại khi program đổi. Chỉ ĐỌC thư mục program, không bao giờ ghi vào đó.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string', description: 'Program path hoặc mã khách trong customers.json' },
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
        program: { type: 'string', description: 'Program path hoặc mã khách trong customers.json' },
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
];

// ---------------------------------------------------------------- handlers

const WRITE_SQL = /\b(insert|update|delete|merge|truncate|drop|alter|create|exec|execute|grant|revoke)\b/i;

export const HANDLERS = {
  list_programs(hub) {
    const rows = loadCustomers(hub).map((c) => ({
      code: c.code,
      name: c.name,
      product: c.product,
      sp: c.sp,
      programPath: c.programPath,
      reachable: fs.existsSync(c.programPath),
      indexed: fs.existsSync(indexPathFor(hub, c.programPath)),
      notes: c.notes || undefined,
    }));
    return {
      source: 'data/customers.json',
      count: rows.length,
      programs: rows,
      hint: 'Program chưa `indexed` thì chạy index_program trước. `reachable: false` thường là do share mạng chưa kết nối.',
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
};
