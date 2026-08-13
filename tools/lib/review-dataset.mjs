// review-dataset.mjs — dataset rà soát UR: bốn câu SQL cố định, gộp JS, map sang payload report.
//
// Agent KHÔNG viết SQL và KHÔNG ghép payload. CLI `4ai report` (không file JSON) và MCP
// `get_review_dataset` cùng gọi function này. Mức cảnh báo hạn của từng UR do report.mjs tính.
//
// Khối nhân sự (roster phòng · lịch sử menu · tải hiện tại) do `staffing.mjs` dựng và đi kèm
// dataset. Không có nó thì mục "Chưa giao lập trình (DD)" chỉ liệt kê được UR chứ không gợi
// ý nổi ai nhận — xem buildNhanSu().
//
// Nội dung forum của UR ở DD do `forum.mjs` phân giải: nhiều UR chỉ ghi "update theo link
// forum: <url>", yêu cầu thật nằm ở topic chứ không nằm trong UR — xem fetchForum().

import { runSql, sqlLiteral } from '../../mcp/fbo/lib/sql.mjs';
import { loadQldaConfig, isPmPlaceholder } from '../../src/database/qlda-metadata.mjs';
import { buildNhanSu, pmCuaDuAn } from './staffing.mjs';
import { fetchForum } from './forum.mjs';

export const STATUS_MAC_DINH = ['DD', 'XN', 'TH'];

export function trimmed(v) {
  return String(v ?? '').trim();
}

/** Bit SQL Server / sqlcmd: true/1/'1' → true; còn lại (kể cả null/rỗng) → false. */
export function bit(v) {
  if (v === true || v === 1 || v === '1') return true;
  if (v === false || v === 0 || v === '0' || v == null || v === '') return false;
  return Boolean(v);
}

/** Ngày local YYYY-MM-DD — không dùng toISOString() (UTC lệch ngày ở VN). */
export function todayIso(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function qldaConnection(hub) {
  const cfg = loadQldaConfig(hub);
  const qlda = cfg?.databases?.qlda;
  if (!qlda?.path || !qlda?.databaseName) {
    throw new Error(
      'Không đọc được cấu hình kết nối QLDA (data/qlda.json → databases.qlda.path/databaseName).');
  }
  return { programPath: qlda.path, database: qlda.databaseName };
}

/** Trạng thái mà UR mang tên PM được coi là "việc PM đang tự làm" — xem buildReviewWhere(). */
export const STATUS_PM_TU_LAM = ['XN', 'TH'];

/**
 * Chốt filter AND. Bỏ trống cả project/pmName/pmDept → lấy pm.maNv từ qlda.local.json.
 * pmDept một mình = toàn phòng, không tự thêm PM vào phạm vi dự án.
 *
 * `pmSelf` LUÔN được phân giải từ cấu hình (không phụ thuộc filter nào được truyền) — nó
 * không thu hẹp phạm vi mà chỉ dùng để KÉO THÊM việc PM tự làm, xem buildReviewWhere().
 */
export function resolveReviewFilters(hub, args = {}) {
  const project = trimmed(args.project);
  let pmName = trimmed(args.pmName);
  const pmDept = trimmed(args.pmDept);
  const cfg = loadQldaConfig(hub);
  const cfgPm = trimmed(cfg?.review?.pm?.maNv);
  const pmSelf = !isPmPlaceholder(cfgPm) ? cfgPm : '';
  if (!project && !pmName && !pmDept) {
    pmName = pmSelf;
  }
  if (!project && !pmName && !pmDept) {
    // Thông báo này là toàn bộ thứ model có để tự chữa. Chỉ vào FILE là bế tắc ở bề mặt
    // không có shell (chat/Cowork): ở đó đường dẫn đúng nằm trong ${CLAUDE_PLUGIN_DATA},
    // model không tính ra được và cũng không ghi được. Nên phải gọi TÊN TOOL trước, và
    // nói rõ hình dạng giá trị — thiếu chỗ đó model đi hỏi "họ tên đầy đủ" rồi bịa ví dụ.
    throw new Error(
      'CHƯA GÁN PM. Cách chữa, theo thứ tự: (1) gọi tool `set_pm_identity({ maNv, boPhanLt })` — '
      + 'chạy được ở mọi bề mặt, tự ghi đúng chỗ; (2) có shell thì `node tools/4ai.mjs setup`; '
      + '(3) hoặc truyền thẳng `project` / `pmName` / `pmDept` cho lần gọi này. '
      + '`maNv` là MÃ nhân viên dùng trong nbdmda.ma_lt1/2/3 (chuỗi in hoa không dấu, KHÔNG phải '
      + 'họ tên), `boPhanLt` là mã bộ phận lập trình trong nbphyc.bp_lt. Hỏi người dùng hai giá '
      + 'trị đó — không đoán, không bịa ví dụ.');
  }
  const statusList = (Array.isArray(args.statusUR) && args.statusUR.length ? args.statusUR : STATUS_MAC_DINH)
    .map(trimmed).filter(Boolean);
  if (statusList.length === 0) {
    throw new Error('statusUR rỗng sau khi lọc — truyền ít nhất một mã trạng thái.');
  }
  return { project, pmName, pmDept, pmSelf, statusList };
}

/**
 * WHERE dùng chung bốn câu — alias bắt buộc `yc` (nbphyc) và `dm` (nbdmda).
 *
 * Hai LÝ DO một UR lọt vào phạm vi, OR với nhau:
 *   1. Phạm vi quản lý — dự án PM đứng tên LTQL (`pmName`) và/hoặc bộ phận lập trình
 *      (`pmDept`). Đây là phần cũ, giữ nguyên quan hệ AND giữa hai filter đó.
 *   2. VIỆC PM TỰ LÀM — `nbphyc.ma_lt1` = PM, chỉ ở trạng thái XN/TH.
 *
 * Vì sao cần lý do 2: PM cũng là nhân viên của phòng và vẫn trực tiếp lập trình. Lọc theo
 * LTQL dự án chỉ trả về việc PM QUẢN LÝ, không trả về việc PM ĐANG LÀM trên dự án người khác
 * quản lý — đo trên dữ liệu thật (PM01, DD/XN/TH): 10 UR mang tên PM thì 6 nằm ở dự án
 * do người khác đứng LTQL, tức lọt 6/10 nếu chỉ có lý do 1.
 *
 * Vì sao CHỈ XN/TH: DD là cổng PM — UR ở DD mang tên PM chỉ là giá trị mặc định màn hình BA
 * để lại, chưa phải việc đã nhận (xem laChuaPhanCong() ở assignee.mjs); kéo chúng vào đây sẽ
 * bơm nhầm UR chưa giao của cả công ty vào báo cáo của PM.
 *
 * `project` và `statusList` vẫn AND ở ngoài: chúng là phép THU HẸP tường minh, lý do 2 không
 * được phép phá. Lọc `statusUR=['DD']` mà vẫn lòi ra XN/TH thì filter mất nghĩa.
 */
export function buildReviewWhere({ project, pmName, pmDept, pmSelf, statusList }) {
  const phamVi = [];
  if (pmName) {
    const lit = sqlLiteral(pmName);
    phamVi.push(`(RTRIM(dm.ma_lt1) = '${lit}' OR RTRIM(dm.ma_lt2) = '${lit}' OR RTRIM(dm.ma_lt3) = '${lit}')`);
  }
  if (pmDept) phamVi.push(`RTRIM(yc.bp_lt) = '${sqlLiteral(pmDept)}'`);

  const lyDo = [];
  if (phamVi.length) lyDo.push(phamVi.join(' AND '));
  // Lý do 2 chỉ MỞ RỘNG một phạm vi đã có, không bao giờ tự đứng một mình. Không có phamVi
  // (vd chỉ truyền `--project`) thì phạm vi vốn đã là "mọi UR của dự án đó" — thêm nhánh này
  // vào lúc đó biến OR thành phép THU HẸP, cắt báo cáo dự án xuống còn mỗi việc của PM.
  if (pmSelf && phamVi.length) {
    const tuLam = STATUS_PM_TU_LAM.map((s) => `'${sqlLiteral(s)}'`).join(', ');
    lyDo.push(`(RTRIM(yc.ma_lt1) = '${sqlLiteral(pmSelf)}' AND RTRIM(yc.trang_thai) IN (${tuLam}))`);
  }

  const where = [];
  if (project) where.push(`RTRIM(yc.ma_da) = '${sqlLiteral(project)}'`);
  if (lyDo.length) where.push(lyDo.length > 1 ? `(${lyDo.join(' OR ')})` : lyDo[0]);
  where.push(`RTRIM(yc.trang_thai) IN (${statusList.map((s) => `'${sqlLiteral(s)}'`).join(', ')})`);
  return where.join(' AND ');
}

const NL = "REPLACE(REPLACE(REPLACE(ISNULL(%s,''),CHAR(13),' '),CHAR(10),' '),CHAR(9),' ')";
const noiDung = (expr) => NL.replace('%s', expr);

function sqlYeuCau(where) {
  return `
SELECT
  RTRIM(yc.stt_rec)      AS stt_rec,
  RTRIM(yc.ma_da)        AS ma_da,
  RTRIM(yc.fcode1)       AS fcode1,
  ${noiDung('yc.noi_dung')} AS noi_dung,
  LEN(yc.noi_dung)       AS noi_dung_len,
  RTRIM(yc.giai_doan_da) AS giai_doan_da,
  RTRIM(yc.trang_thai)   AS trang_thai,
  RTRIM(yc.menu_id)      AS menu_id,
  RTRIM(yc.sysid)        AS sysid,
  yc.tlks_yn             AS tlks_yn,
  RTRIM(${noiDung('yc.trang_tlks')}) AS trang_tlks,
  RTRIM(yc.ma_lt1)       AS ur_ma_lt1,
  RTRIM(yc.bp_lt)        AS ur_bp_lt,
  yc.tg_dk_th            AS tg_dk_th
FROM nbphyc yc
LEFT JOIN nbdmda dm ON RTRIM(yc.ma_da) = RTRIM(dm.ma_da)
WHERE ${where}
ORDER BY RTRIM(yc.ma_da), RTRIM(yc.giai_doan_da), RTRIM(yc.stt_rec)`.trim();
}

function sqlDaumuc(where) {
  return `
SELECT
  RTRIM(yc.stt_rec)      AS stt_rec,
  RTRIM(dmuc.stt_rec0)   AS stt_rec0,
  RTRIM(dmuc.ma_daumuc)  AS ma_daumuc,
  ${noiDung('dmuc.ten_daumuc')} AS ten_daumuc,
  RTRIM(dmuc.ma_lt)      AS ma_lt,
  RTRIM(dmuc.ma_tester)  AS ma_tester,
  dmuc.so_luong          AS so_luong,
  dmuc.stt               AS stt
FROM nbctdaumuc dmuc
INNER JOIN nbphyc yc ON dmuc.stt_rec = yc.stt_rec
LEFT JOIN nbdmda dm ON RTRIM(yc.ma_da) = RTRIM(dm.ma_da)
WHERE ${where}
ORDER BY RTRIM(yc.stt_rec), RTRIM(dmuc.stt_rec0)`.trim();
}

function sqlHan(where) {
  return `
SELECT
  RTRIM(h.ma_da)         AS ma_da,
  h.giai_doan_da         AS giai_doan_da,
  h.ngay_ht              AS ngay_ht,
  h.xac_nhan_da_hen_yn   AS xac_nhan_da_hen_yn,
  ${noiDung('h.noi_dung')} AS noi_dung
FROM nbcnhanhtda h
INNER JOIN (
  SELECT RTRIM(ma_da) AS ma_da, giai_doan_da, MAX(ngay_ht) AS ngay_ht
  FROM nbcnhanhtda GROUP BY RTRIM(ma_da), giai_doan_da
) m ON RTRIM(h.ma_da) = m.ma_da AND h.giai_doan_da = m.giai_doan_da AND h.ngay_ht = m.ngay_ht
INNER JOIN (
  SELECT DISTINCT RTRIM(yc.ma_da) AS ma_da, yc.giai_doan_da AS giai_doan_da
  FROM nbphyc yc
  LEFT JOIN nbdmda dm ON RTRIM(yc.ma_da) = RTRIM(dm.ma_da)
  WHERE ${where}
) s ON s.ma_da = RTRIM(h.ma_da) AND s.giai_doan_da = h.giai_doan_da`.trim();
}

function sqlDuAn(where) {
  return `
SELECT DISTINCT
  RTRIM(dm.ma_da)    AS ma_da,
  RTRIM(dm.ten_ngan) AS ten_ngan,
  RTRIM(dm.ma_pbsp)  AS ma_pbsp,
  RTRIM(dm.bp_lt)    AS bp_lt,
  RTRIM(dm.ma_lt1)   AS ma_lt1,
  RTRIM(dm.ma_lt2)   AS ma_lt2,
  RTRIM(dm.ma_lt3)   AS ma_lt3
FROM nbphyc yc
LEFT JOIN nbdmda dm ON RTRIM(yc.ma_da) = RTRIM(dm.ma_da)
WHERE ${where}
  AND dm.ma_da IS NOT NULL
ORDER BY RTRIM(dm.ma_da)`.trim();
}

/** Bốn câu SQL cố định — chỉ thay WHERE filter. Dùng để test, không nhận SQL từ agent. */
export function buildReviewSql(filters) {
  const where = buildReviewWhere(filters);
  return {
    yeuCau: sqlYeuCau(where),
    daumuc: sqlDaumuc(where),
    han: sqlHan(where),
    duAn: sqlDuAn(where),
  };
}

function hanKey(maDa, giaiDoan) {
  return `${trimmed(maDa)}\t${trimmed(giaiDoan)}`;
}

/**
 * Gộp bốn result set thành { projects[], yeuCau[] }. Không gọi DB.
 * @param {{yeuCauRows: object[], daumucRows: object[], hanRows: object[], duAnRows: object[]}} rows
 */
export function mergeReviewRows({ yeuCauRows = [], daumucRows = [], hanRows = [], duAnRows = [] }) {
  const byDaumuc = new Map();
  for (const r of daumucRows) {
    const key = trimmed(r.stt_rec);
    if (!key || !trimmed(r.stt_rec0)) continue;
    if (!byDaumuc.has(key)) byDaumuc.set(key, []);
    byDaumuc.get(key).push({
      stt_rec0: trimmed(r.stt_rec0),
      ma_daumuc: trimmed(r.ma_daumuc) || undefined,
      ten_daumuc: r.ten_daumuc || undefined,
      ma_lt: trimmed(r.ma_lt) || undefined,
      ma_tester: trimmed(r.ma_tester) || undefined,
      so_luong: r.so_luong,
      stt: r.stt,
    });
  }

  const byHan = new Map();
  for (const r of hanRows) {
    const maDa = trimmed(r.ma_da);
    if (!maDa) continue;
    byHan.set(hanKey(maDa, r.giai_doan_da), {
      ngay_ht: r.ngay_ht || undefined,
      xac_nhan_da_hen_yn: r.xac_nhan_da_hen_yn,
      noi_dung: r.noi_dung || undefined,
    });
  }

  const byDuAn = new Map();
  for (const r of duAnRows) {
    const maDa = trimmed(r.ma_da);
    if (!maDa) continue;
    byDuAn.set(maDa, {
      ma_da: maDa,
      ten_ngan: trimmed(r.ten_ngan) || undefined,
      ma_pbsp: trimmed(r.ma_pbsp) || undefined,
      bp_lt: trimmed(r.bp_lt) || undefined,
      ltql: [r.ma_lt1, r.ma_lt2, r.ma_lt3].map(trimmed).filter(Boolean),
    });
  }

  const yeuCau = [];
  for (const r of yeuCauRows) {
    const stt = trimmed(r.stt_rec);
    if (!stt) continue;
    const maDa = trimmed(r.ma_da);
    const gd = trimmed(r.giai_doan_da);
    const han = byHan.get(hanKey(maDa, gd)) ?? {};
    const duAn = byDuAn.get(maDa);
    yeuCau.push({
      ma_da: maDa,
      ten_ngan: duAn?.ten_ngan,
      ma_pbsp: duAn?.ma_pbsp,
      project_bp_lt: duAn?.bp_lt,
      project_lt: duAn?.ltql ?? [],
      stt_rec: stt,
      fcode1: trimmed(r.fcode1) || undefined,
      noi_dung: r.noi_dung,
      noi_dung_len: r.noi_dung_len !== undefined ? Number(r.noi_dung_len) : undefined,
      giai_doan_da: gd || undefined,
      trang_thai: trimmed(r.trang_thai),
      menu_id: trimmed(r.menu_id) || undefined,
      sysid: trimmed(r.sysid) || undefined,
      tlks_yn: r.tlks_yn,
      trang_tlks: trimmed(r.trang_tlks) || undefined,
      ur_ma_lt1: trimmed(r.ur_ma_lt1) || undefined,
      ur_bp_lt: trimmed(r.ur_bp_lt) || undefined,
      tg_dk_th: r.tg_dk_th,
      ngay_ht: han.ngay_ht,
      xac_nhan_da_hen_yn: han.xac_nhan_da_hen_yn,
      giai_doan_noi_dung: han.noi_dung,
      daumuc: byDaumuc.get(stt) ?? [],
    });
  }

  return { projects: [...byDuAn.values()], yeuCau };
}

/**
 * Chạy bốn câu cố định trên QLDA · QLDA_APP.
 * `deps.runSql` để test không chạm DB.
 */
export function fetchReviewDataset(hub, args = {}, deps = {}) {
  const sqlFn = deps.runSql ?? runSql;
  const filters = resolveReviewFilters(hub, args);
  const { programPath, database } = qldaConnection(hub);
  const maxRows = Math.min(args.maxRows ?? 5000, 10000);
  const sqls = buildReviewSql(filters);

  const exec = (sql) => sqlFn({ programPath, database, dbType: 'app', sql, maxRows });
  const yeuCauRes = exec(sqls.yeuCau);
  const daumucRes = exec(sqls.daumuc);
  const hanRes = exec(sqls.han);
  const duAnRes = exec(sqls.duAn);

  const merged = mergeReviewRows({
    yeuCauRows: yeuCauRes.rows ?? [],
    daumucRows: daumucRes.rows ?? [],
    hanRows: hanRes.rows ?? [],
    duAnRows: duAnRes.rows ?? [],
  });

  // Nhân sự đi kèm dataset chứ không phải tuỳ chọn khai tay: `4ai report` không nhận payload
  // từ agent nữa, nên nếu chỗ này không dựng thì KHÔNG CÒN đường nào để mục gợi ý phân công
  // có dữ liệu. Lỗi ở đây không đánh sập báo cáo — buildNhanSu ghi lý do vào `thieuDuLieu`.
  const nhanSu = buildNhanSu(hub, {
    pmDept: filters.pmDept,
    yeuCau: merged.yeuCau,
    projects: merged.projects,
    ngayChay: args.ngayChay || todayIso(),
  }, deps);

  // UR ở DD chỉ ghi "update theo link forum: <url>" thì nội dung yêu cầu nằm ở topic, không
  // nằm trong UR — mở sẵn ra đây để cả PM lẫn agent phân tích được mà không phải rời báo cáo.
  const forum = fetchForum(hub, { yeuCau: merged.yeuCau, maxTopic: args.maxTopicForum }, deps);
  for (const u of merged.yeuCau) {
    const topics = forum.theoUr[trimmed(u.stt_rec)];
    if (topics?.length) u.forum = topics;
  }

  return {
    source: 'nbphyc + nbdmda + nbcnhanhtda + nbctdaumuc (QLDA · QLDA_APP) — 4 câu SQL cố định'
      + ', kèm nhân sự từ userinfo2 (DB sys) và nội dung forum từ frpost',
    filters: {
      project: filters.project || undefined,
      pmName: filters.pmName || undefined,
      pmDept: filters.pmDept || undefined,
      statusUR: filters.statusList,
    },
    count: merged.yeuCau.length,
    truncated: Boolean(yeuCauRes.truncated || daumucRes.truncated || hanRes.truncated || duAnRes.truncated),
    projects: merged.projects,
    yeuCau: merged.yeuCau,
    nhanSu,
    forum: { soTopic: forum.soTopic, thieuDuLieu: forum.thieuDuLieu },
    hint: 'Mỗi phần tử `yeuCau[]` là MỘT UR; `daumuc[]` đã gộp sẵn. `projects[]` là danh sách dự án có UR. '
      + '`ngay_ht`/`xac_nhan_da_hen_yn` lấy MAX(ngay_ht) theo (ma_da, giai_doan_da). '
      + '`truncated: true` = một trong bốn câu bị cắt ở maxRows. '
      + 'noi_dung mất dấu tiếng Việt do codepage sqlcmd — đối chiếu `noi_dung_len`. '
      + '`nhanSu.roster` là người CÒN làm và CÒN ở bộ phận đó (userinfo2.status=1, ma_bo_phan=dept); '
      + 'LTQL của dự án mà không có trong roster nghĩa là đã off hoặc chuyển phòng, khi đó PM là cấp PP. '
      + '`yeuCau[].forum[]` (chỉ UR ở DD có link forum.fast.com.vn) là nội dung topic lấy từ bản sao '
      + '`frpost` — với những UR chỉ ghi "update theo link forum" thì ĐÂY mới là yêu cầu thật, PHẢI đọc '
      + 'nó rồi mới phân tích, đừng kết luận chỉ từ noi_dung của UR. '
      + 'AI chỉ phân tích UR trang_thai=DD; XN/TH chỉ hiện trên báo cáo để theo dõi hạn.',
  };
}

function isoDate(v) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

/**
 * Dataset → payload report.mjs. Không tính ngày làm việc.
 * @returns {{ portfolio: object, byProject: Record<string, object> }}
 */
export function datasetToPayloads(dataset, { ngay_chay, pm } = {}) {
  const ngay = ngay_chay || todayIso();
  const pmCode = trimmed(pm);
  const nhanSu = dataset.nhanSu;
  const roster = nhanSu?.roster ?? [];
  const pp = nhanSu?.phoPhong ?? '';
  const byDa = new Map();

  /**
   * PM của dự án — KHÔNG phải cứ chép nguyên LTQL trên `nbdmda`. LTQL là dữ liệu đã nguội:
   * người off hoặc chuyển phòng vẫn còn tên ở đó, và `payload.pm` chính là thứ quyết định
   * `ma_lt1` nào bị coi là "mặc định BA để lại". Chép nguyên tên một người đã đi khỏi phòng
   * thì mọi UR mang tên họ lọt qua như đã phân việc xong.
   */
  const duAnMoi = (maDa, thongTin, ltqlRaw) => {
    const ltql = (ltqlRaw ?? []).map(trimmed).filter(Boolean);
    const r = roster.length ? pmCuaDuAn(ltql, roster, pp) : { pm: ltql, nguon: 'ltql', ngoaiPhong: [] };
    return {
      ma_da: maDa,
      ten_ngan: thongTin.ten_ngan || maDa,
      ma_pbsp: thongTin.ma_pbsp || '',
      pm: (r.pm.length ? r.pm : (pmCode ? [pmCode] : [])).join(', '),
      pmNguon: r.nguon,
      pmNgoaiPhong: r.ngoaiPhong,
      ltql,
      ngay_chay: ngay,
      giaiDoan: [],
      yeuCau: [],
    };
  };

  for (const p of dataset.projects ?? []) {
    const maDa = trimmed(p.ma_da);
    if (!maDa) continue;
    byDa.set(maDa, duAnMoi(maDa, p, p.ltql));
  }

  for (const u of dataset.yeuCau ?? []) {
    const maDa = trimmed(u.ma_da);
    if (!maDa) continue;
    if (!byDa.has(maDa)) {
      byDa.set(maDa, duAnMoi(maDa, { ten_ngan: u.ten_ngan, ma_pbsp: u.ma_pbsp }, u.project_lt));
    }
    const payload = byDa.get(maDa);
    const gd = trimmed(u.giai_doan_da);
    const ngayHt = isoDate(u.ngay_ht);
    if (gd && ngayHt && !payload.giaiDoan.some((g) => g.giai_doan_da === gd)) {
      payload.giaiDoan.push({
        giai_doan_da: gd,
        ngay_ht: ngayHt,
        xac_nhan_da_hen_yn: bit(u.xac_nhan_da_hen_yn),
        noi_dung: u.giai_doan_noi_dung || '',
      });
    }
    payload.yeuCau.push({
      stt_rec: u.stt_rec,
      fcode1: u.fcode1 || '',
      noi_dung: u.noi_dung || '',
      noiDungLenGoc: Number(u.noi_dung_len) || undefined,
      giai_doan_da: gd || '(không giai đoạn)',
      trang_thai: u.trang_thai,
      tlks_yn: bit(u.tlks_yn),
      trang_tlks: u.trang_tlks || '',
      menu_id: u.menu_id || '',
      sysid: u.sysid || '',
      tg_dk_th: Number(u.tg_dk_th) || 0,
      ma_lt1: u.ur_ma_lt1 || '',
      // Mã đầu mục công việc (nbctdaumuc.ma_daumuc) — tín hiệu đầu vào/đầu ra thật cho
      // assignee.mjs → nhanDienBaoCaoDauRa(), mạnh hơn đoán qua từ khoá tự do trong noi_dung.
      maDaumuc: (u.daumuc ?? []).map((d) => trimmed(d.ma_daumuc)).filter(Boolean),
      // Nội dung topic forum (chỉ UR ở DD có link) — với UR chỉ ghi "update theo link forum"
      // thì đây mới là yêu cầu thật. Xem forum.mjs.
      ...(u.forum?.length ? { forum: u.forum } : {}),
    });
  }

  const projects = [...byDa.values()].filter((p) => p.yeuCau.length);
  // `nhanSu` giống hệt nhau ở mọi dự án (roster là của cả phòng) nên chỉ khai MỘT lần ở cấp
  // portfolio — nhân nó ra 38 bản trong tong.payload.json chỉ làm file phình gấp đôi. Payload
  // dự án đứng riêng thì phải mang theo, vì trang review.html của dự án dựng từ chính nó.
  const byProject = Object.fromEntries(
    projects.map((p) => [p.ma_da, nhanSu ? { ...p, nhanSu } : p]));
  return {
    portfolio: {
      kind: 'portfolio',
      ngay_chay: ngay,
      pm: pmCode,
      ...(nhanSu ? { nhanSu } : {}),
      projects,
    },
    byProject,
  };
}
