#!/usr/bin/env node
// test-report-pipeline.mjs — Test suite cho luồng báo cáo: phân giải domain → prompt → validate → chạy.
//
// `data/qlda.json` chỉ giữ TOKEN `{QldaDatabaseName}`/`{QldaProgramPath}` — gói phân phối
// công khai không mang tên hạ tầng nội bộ. Test dựng một data root TẠM với qlda.local.json
// giả để vừa có giá trị cụ thể mà khẳng định, vừa kiểm luôn cơ chế overlay token→giá trị.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '4ai-report-pipeline-'));
process.env.FBO_DATA_ROOT = tmp;
const DB_APP = 'TEST_APP';
const PROGRAM_QLDA = String.raw`\\test-share\FastPro$\QLDA\Src-Onl`;
/** Program của một khách bất kỳ — KHÁC PROGRAM_QLDA, để kiểm nhánh "không phải QLDA". */
const PROGRAM_KHACH = String.raw`\\test-share\CustomerPro\FBI\DEMO\FBISP2422`;
fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'data', 'qlda.local.json'), JSON.stringify({
  qldaProgramPath: PROGRAM_QLDA,
  qldaDatabaseName: DB_APP,
  qldaSysDatabaseName: 'TEST_SYS',
}), 'utf8');

const { validateSql } = await import('../src/database/query-validator.mjs');
const { resolveDomain, resolveMetadata } = await import('../src/database/metadata-resolver.mjs');
const { planReport, executeReport } = await import('../src/workflows/report-workflow.mjs');

let failures = 0;

function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

const FSD_REQUEST = 'Báo cáo các số lượng yêu cầu đã hoàn thành trong ngày hôm nay của phòng FSD';

async function runTests() {
  process.stdout.write('=== 1. PHÂN GIẢI DOMAIN (QLDA vs FBO) ===\n');
  // Câu hỏi về yêu cầu/UR thuộc DB nội bộ QLDA, KHÔNG thuộc chương trình khách nào.
  const fsdDomain = resolveDomain({}, { userRequest: FSD_REQUEST });
  ok('Yêu cầu phòng FSD -> domain qlda', fsdDomain.name === 'qlda', fsdDomain.reason);

  // Chiều ngược lại: câu hỏi nghiệp vụ thật vẫn phải đi đường FBO, không bị QLDA nuốt.
  const revenueDomain = resolveDomain({}, { userRequest: 'Tạo báo cáo doanh thu theo tháng năm 2026' });
  ok('Yêu cầu doanh thu -> domain fbo', revenueDomain.name === 'fbo', revenueDomain.reason);

  // Lỗi gốc: truyền program của khách nhưng hỏi chuyện QLDA thì vẫn phải ra QLDA.
  const mismatched = resolveDomain({}, {
    userRequest: FSD_REQUEST,
    programPath: PROGRAM_KHACH,
  });
  ok('Truyền nhầm program khách -> vẫn ra domain qlda', mismatched.name === 'qlda', mismatched.reason);

  const forced = resolveDomain({}, { userRequest: FSD_REQUEST, domain: 'fbo' });
  ok('Ép domain qua context -> tôn trọng', forced.name === 'fbo', forced.reason);

  // Vùng mù mờ: đúng 1 tín hiệu weight-1 ("du an"), dưới ngưỡng 2 — không được đoán fbo.
  const AMBIGUOUS_REQUEST = 'Báo cáo tiến độ dự án hôm nay mà tôi quản lý';
  const ambiguousDomain = resolveDomain({}, { userRequest: AMBIGUOUS_REQUEST });
  ok('Tín hiệu chưa đủ ngưỡng -> domain ambiguous (không âm thầm rớt về fbo)',
    ambiguousDomain.name === 'ambiguous', ambiguousDomain.reason);

  // Không tín hiệu nào (score 0) vẫn phải là fbo chắc chắn, không phải ambiguous.
  ok('Score 0 -> fbo chắc chắn, không phải ambiguous', revenueDomain.name === 'fbo');


  process.stdout.write('\n=== 2. METADATA QLDA TỪ data/qlda.json ===\n');
  const fsdMeta = await resolveMetadata({}, { userRequest: FSD_REQUEST });
  ok('Nguồn là data/qlda.json', fsdMeta.source === 'data/qlda.json', `source=${fsdMeta.source}`);
  ok('Bảng chính là nbphyc', fsdMeta.primaryTable === 'nbphyc', `primaryTable=${fsdMeta.primaryTable}`);
  ok('Có cột lọc bộ phận nbphyc.bp_lt',
    fsdMeta.fields.some(f => f.table === 'nbphyc' && f.name === 'bp_lt'));
  ok('Có cột ngày hoàn thành nbphyc.ngay_ht',
    fsdMeta.fields.some(f => f.table === 'nbphyc' && f.name === 'ngay_ht'));
  ok('Có enum trạng thái để khỏi đoán nghĩa mã HT',
    fsdMeta.enums?.trangThaiYeuCau?.values?.some(v => v.ma === 'HT'));
  ok('Chỉ đúng DB nội bộ QLDA (gán từ qlda.local.json, không phải token)', fsdMeta.connection?.database === DB_APP, `database=${fsdMeta.connection?.database}`);
  ok('Metadata chứa quy tắc ưu tiên ma_lt > ma_nv > ma_bp lt > ma_bp nv',
    fsdMeta.businessRules?.some(r => r.includes('ma_lt > ma_nv > ma_bp lt > ma_bp nv')));

  // Rào an toàn: cột credential của khách không được lọt vào metadata rồi ra prompt.
  const sensitiveNames = ['server', 'xuser', 'xpass', 'db_sys'];
  ok('KHÔNG lộ cột nhạy cảm của nbdmda',
    !fsdMeta.fields.some(f => sensitiveNames.includes(f.name)));
  ok('Chặn hẳn bảng nbdmserver', fsdMeta.deniedTables?.includes('nbdmserver'));
  ok('Cột nhạy cảm được ghi lại ở deniedColumns cho validator',
    sensitiveNames.every(n => fsdMeta.deniedColumns?.some(c => c.endsWith(`.${n}`))));
  ok('businessRules KHÔNG nhắc lại tên cột nhạy cảm (rule đi thẳng vào prompt)',
    !fsdMeta.businessRules.some(r => sensitiveNames.some(n => new RegExp(`\\b${n}\\b`).test(r))));

  const fboMeta = await resolveMetadata({}, { userRequest: 'Tạo báo cáo doanh thu theo tháng năm 2026' });
  ok('Domain fbo không có program -> fallback hda', fboMeta.domain === 'fbo'
    && fboMeta.tables.some(t => t.name === 'hda'));


  process.stdout.write('\n=== 3. SQL VALIDATOR ===\n');
  const metadata = {
    tables: [{ name: 'hda', alias: 'hda' }],
    fields: [
      { table: 'hda', name: 'stt_rec' },
      { table: 'hda', name: 'ngay_ct' },
      { table: 'hda', name: 'tien' },
    ],
    capabilities: { maxRows: 1000 },
  };

  ok('SELECT hợp lệ -> PASS', validateSql('SELECT stt_rec, ngay_ct, tien FROM hda', metadata).valid === true);

  for (const [kw, sql] of [
    ['INSERT', "INSERT INTO hda (stt_rec) VALUES ('001')"],
    ['UPDATE', 'UPDATE hda SET tien = 1000'],
    ['DELETE', 'DELETE FROM hda'],
    ['DROP', 'DROP TABLE hda'],
  ]) {
    const r = validateSql(sql, metadata);
    ok(`${kw} -> FAIL`, r.valid === false && r.errors.some(e => e.code.includes(kw)));
  }

  const unknownTableCheck = validateSql('SELECT * FROM table_khong_ton_tai_xyz', metadata);
  ok('Unknown table -> FAIL', unknownTableCheck.valid === false && unknownTableCheck.errors.some(e => e.code === 'UNKNOWN_TABLE'));

  const invalidJoinCheck = validateSql('SELECT * FROM hda JOIN dmkh', metadata);
  ok('JOIN thiếu ON -> FAIL', invalidJoinCheck.valid === false && invalidJoinCheck.errors.some(e => e.code === 'INVALID_JOIN'));


  process.stdout.write('\n=== 4. VALIDATOR ĐỐI CHIẾU METADATA QLDA ===\n');
  const forbiddenTableCheck = validateSql('SELECT * FROM nbdmserver', fsdMeta);
  ok('Bảng nbdmserver bị chặn -> FAIL', forbiddenTableCheck.valid === false
    && forbiddenTableCheck.errors.some(e => e.code === 'FORBIDDEN_TABLE'));

  const forbiddenColumnCheck = validateSql('SELECT xpass FROM nbdmda', fsdMeta);
  ok('SELECT xpass (credential) -> FAIL', forbiddenColumnCheck.valid === false
    && forbiddenColumnCheck.errors.some(e => e.code === 'FORBIDDEN_COLUMN'));

  const forbiddenColumnAliasCheck = validateSql('SELECT d.xuser FROM nbdmda d', fsdMeta);
  ok('SELECT alias.xuser -> FAIL', forbiddenColumnAliasCheck.valid === false
    && forbiddenColumnAliasCheck.errors.some(e => e.code === 'FORBIDDEN_COLUMN'));

  // Đúng mẫu query trong pm-ur-analyst.md — dùng alias, phải qua được validator.
  const realUrQuery = validateSql(
    "SELECT y.fcode1, y.bp_lt, y.trang_thai FROM nbphyc y WHERE RTRIM(y.bp_lt) = 'FSD'",
    fsdMeta
  );
  ok('Câu UR thật (alias.column hợp lệ) -> PASS', realUrQuery.valid === true, JSON.stringify(realUrQuery.errors));

  const unknownAliasFieldCheck = validateSql('SELECT y.khong_ton_tai FROM nbphyc y', fsdMeta);
  ok('alias.column không tồn tại -> FAIL', unknownAliasFieldCheck.valid === false
    && unknownAliasFieldCheck.errors.some(e => e.code === 'UNKNOWN_FIELD'));

  const lookupTableSkipped = validateSql(
    'SELECT t.ten_ttyc FROM nbphyc y LEFT JOIN nbdmttyc t ON RTRIM(t.ma_ttyc) = RTRIM(y.trang_thai)',
    fsdMeta
  );
  ok('Bảng lookup fieldsKnown=false -> không báo UNKNOWN_FIELD sai',
    !lookupTableSkipped.errors.some(e => e.code === 'UNKNOWN_FIELD'), JSON.stringify(lookupTableSkipped.errors));


  process.stdout.write('\n=== 5. WORKFLOW (PLAN THUẦN DỮ LIỆU ≠ EXECUTE) ===\n');
  const plan = await planReport(FSD_REQUEST);
  ok('planReport ra READY', plan.status === 'READY', `status=${plan.status}`);
  ok('planReport sinh planId', typeof plan.planId === 'string');
  ok('Plan nhận đúng domain qlda', plan.domain === 'qlda', plan.domainReason);
  ok('Plan KHÔNG tự sinh SQL (không có LLM bên trong)', plan.sql === undefined);

  ok('Prompt có schema thật của nbphyc',
    plan.prompt.includes('nbphyc') && plan.prompt.includes('bp_lt') && plan.prompt.includes('ngay_ht'));
  ok('Prompt có enum trạng thái để khỏi đoán mã HT',
    plan.prompt.includes('HT = Hoàn thành, chờ test'));
  ok('Prompt KHÔNG lộ tên cột credential',
    !/\b(xpass|xuser|db_sys)\b/.test(plan.prompt));

  const emptyPlan = await planReport('   ');
  ok('Yêu cầu rỗng -> NEED_CLARIFICATION', emptyPlan.status === 'NEED_CLARIFICATION');

  // Domain mù mờ phải escalate NEED_CLARIFICATION thay vì âm thầm build metadata fbo sai.
  const ambiguousPlan = await planReport('Báo cáo tiến độ dự án hôm nay mà tôi quản lý');
  ok('Domain mù mờ -> NEED_CLARIFICATION', ambiguousPlan.status === 'NEED_CLARIFICATION', ambiguousPlan.domainReason);
  ok('Câu hỏi nhắc gọi lại kèm domain tường minh',
    ambiguousPlan.questions?.some((q) => q.includes('domain')));

  // Truyền domain tường minh thì bỏ qua hẳn bước chấm điểm, đi thẳng vào việc.
  const disambiguatedPlan = await planReport('Báo cáo tiến độ dự án hôm nay mà tôi quản lý', { domain: 'qlda' });
  ok('Ép domain qlda cho câu mù mờ -> READY', disambiguatedPlan.status === 'READY', disambiguatedPlan.domainReason);
  ok('Ép domain -> đúng domain qlda', disambiguatedPlan.domain === 'qlda');

  // Execute nhận SQL do agent viết, validate theo metadata của CHÍNH plan đó.
  const badExec = await executeReport(plan.planId, 'SELECT xpass FROM nbdmda');
  ok('execute_report chặn SQL chạm cột cấm', badExec.status === 'VALIDATION_FAILED'
    && badExec.errors.some(e => e.code === 'FORBIDDEN_COLUMN'));

  const wrongSchemaExec = await executeReport(plan.planId, 'SELECT * FROM bang_bia_dat');
  ok('execute_report chặn SQL sai schema', wrongSchemaExec.status === 'VALIDATION_FAILED'
    && wrongSchemaExec.errors.some(e => e.code === 'UNKNOWN_TABLE'));

  let blockedEmptySql = false;
  try {
    await executeReport(plan.planId, '');
  } catch {
    blockedEmptySql = true;
  }
  ok('execute_report không nhận SQL rỗng', blockedEmptySql);

  let blockedUnknownPlan = false;
  try {
    await executeReport('plan_khong_ton_tai', 'SELECT 1');
  } catch {
    blockedUnknownPlan = true;
  }
  ok('execute_report chặn planId lạ', blockedUnknownPlan);


  process.stdout.write('\n=== 6. QUERY EXECUTOR — CHỮ KÝ runSql VÀ HÌNH DẠNG KẾT QUẢ ===\n');
  // runSql nhận MỘT object options, trả về { database, columns, rowCount, rows, truncated }.
  // Gọi sai kiểu positional thì programPath thành undefined và sqlcmd chết với
  // 'The "path" argument must be of type string' — bắt ở đây thay vì chờ tới lúc chạm DB thật.
  const realSql = "SELECT COUNT(*) AS sl FROM nbphyc WHERE RTRIM(bp_lt) = 'FSD'";
  let seen = null;
  const fakeRunner = (opts) => {
    seen = opts;
    return { database: opts.database, columns: ['sl'], rowCount: 1, rows: [{ sl: 7 }], truncated: false };
  };

  const exec = await executeReport(plan.planId, realSql, { runSql: fakeRunner });
  ok('execute_report chạy được câu SQL hợp lệ', exec.status === 'COMPLETED', JSON.stringify(exec.errors || exec.result?.error));
  ok('runSql nhận object có programPath (không phải tham số vị trí)',
    typeof seen?.programPath === 'string' && seen.programPath.length > 0, `programPath=${seen?.programPath}`);
  ok('Chạy trên chương trình QLDA, không phải program khách',
    seen?.programPath === PROGRAM_QLDA, seen?.programPath);
  ok('Ép đúng database QLDA', seen?.database === DB_APP, `database=${seen?.database}`);
  ok('Dùng key dbType (không phải db)', seen?.dbType === 'app', `dbType=${seen?.dbType}`);
  ok('Bóc đúng rows từ kết quả runSql',
    exec.result?.success === true && exec.result.rows[0]?.sl === 7, JSON.stringify(exec.result?.rows));
  ok('Đếm đúng theo rowCount', exec.result?.count === 1, `count=${exec.result?.count}`);

  // Truyền program khách vẫn phải chạy trên QLDA — metadata.connection thắng context.
  seen = null;
  await executeReport(plan.planId, realSql, {
    runSql: fakeRunner,
    programPath: PROGRAM_KHACH,
  });
  ok('Truyền nhầm program khách -> vẫn chạy trên QLDA',
    seen?.programPath === PROGRAM_QLDA, seen?.programPath);

  // Không có program thì phải báo lỗi, TUYỆT ĐỐI không trả số liệu bịa.
  const noProgramPlan = await planReport('Tạo báo cáo doanh thu theo tháng năm 2026');
  let refusedNoProgram = false;
  try {
    await executeReport(noProgramPlan.planId, 'SELECT ngay_ct, tien FROM hda');
  } catch (err) {
    refusedNoProgram = /không xác định được chương trình/i.test(err.message);
  }
  ok('Thiếu program -> báo lỗi chứ KHÔNG trả dữ liệu giả', refusedNoProgram);

  process.stdout.write(`\n=== TEST KẾT THÚC: ${failures === 0 ? 'TẤT CẢ PASS' : 'CÓ LỖI'} (${failures} thất bại) ===\n`);
  process.exit(failures === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Test suite bị crash:', err);
  process.exit(1);
});
