// report.mjs — dựng báo cáo rà soát thành HTML tự chứa.
//
// TRẢ VỀ {relPath, content}; writer.mjs mới ghi. Không gọi DB, không gọi mạng, không CDN:
// dữ liệu vào bằng payload JSON do người chạy rà soát chuẩn bị (query_sql →
// scratchpad → lệnh này). Nhờ vậy báo cáo dựng lại được y hệt từ cùng payload.
//
// Hai loại payload:
//   - một dự án  : { ma_da, ngay_chay, giaiDoan[], yeuCau[] }              -> buildReportArtifact
//   - tổng quan  : { kind: "portfolio", ngay_chay, projects: [payload,…] } -> buildPortfolioArtifact
//
// Biểu đồ là SVG sinh tay — không CDN, không thư viện, mở offline vẫn đúng.
// Thiết kế: bảng màu semantic (đỏ/vàng/xanh) từ ui-ux-pro-max, font hệ thống (không @import
// Google Fonts — trang phải mở được offline).

import fs from 'node:fs';
import path from 'node:path';
import { loadHolidays, classifyDeadline, isWorkingDay } from './workdays.mjs';
import { renderDdl } from './ddl.mjs';
import { promptKyThuat } from './prompt.mjs';
import { HUB, readJson } from './assets.mjs';
import { goiYPhanCong, laChuaPhanCong, TRONG_SO_MAC_DINH } from './assignee.mjs';
import { loadTemplate, renderTemplate } from './template.mjs';

/** Tải cấu hình từ qlda.local.json; fallback về defaults nếu file không tồn tại. */
function loadConfig(hub = HUB) {
  const localConfigPath = path.join(hub, 'data', 'qlda.local.json');
  const defaults = { pm: { maNv: 'PM01', boPhanLt: 'FSD' } };

  try {
    return readJson(localConfigPath, defaults);
  } catch {
    return defaults;
  }
}

/** Trọng số chấm điểm phân công — data/qlda.json → review.phanCong ghi đè mặc định. */
function loadTrongSoPhanCong(hub = HUB) {
  try {
    const cfg = readJson(path.join(hub, 'data', 'qlda.json'), {});
    return { ...TRONG_SO_MAC_DINH, ...(cfg?.review?.phanCong ?? {}) };
  } catch {
    return { ...TRONG_SO_MAC_DINH };
  }
}

/**
 * SQL của một UR: ưu tiên `ddl` (đặc tả có cấu trúc → code sinh, luật cưỡng chế được),
 * lùi về `ghiChuDdl` (chuỗi viết tay, chỉ còn cho dữ liệu cũ).
 * @returns {{sql: string|null, err: string|null}}
 */
function sqlCuaUr(u) {
  if (u.ddl) {
    try { return { sql: renderDdl(u.ddl), err: null }; }
    catch (e) { return { sql: null, err: e.message }; }
  }
  return { sql: u.ghiChuDdl ?? null, err: null };
}

const TRANG_THAI = {
  DD: { ten: 'Đã duyệt', mau: 'tt-dd' },
  XN: { ten: 'Xác nhận chuyển LT', mau: 'tt-xn' },
  TH: { ten: 'Đang thực hiện', mau: 'tt-th' },
};

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * URL trong text ĐÃ escape. Chạy SAU esc() nên `&` đã thành `&amp;` — bắt luôn dạng đó để
 * không cắt query string làm đôi ở tham số thứ hai (`...?t=35336&amp;p=366179`).
 *
 * Ký tự cuối cùng bị loại khỏi URL: `.,;:` và `)` `]` hay đứng liền sau link trong câu tiếng
 * Việt ("theo link forum: https://...?t=35383."). Dấu chấm cuối câu mà nuốt vào href thì link
 * mở ra 404.
 */
const URL_RE = /https?:\/\/[^\s<>"']+/g;
const DUOI_URL = /(?:&amp;|[.,;:!?)\]}]|&quot;)+$/;

/**
 * Escape rồi biến URL thành thẻ bấm được.
 *
 * THỨ TỰ QUAN TRỌNG: escape TRƯỚC, dựng thẻ SAU. Làm ngược lại (linkify trên chuỗi thô rồi
 * escape) sẽ escape luôn cả thẻ `<a>` vừa dựng; còn nếu bỏ escape để giữ thẻ thì `noi_dung`
 * của UR — do người dùng nhập, có thể chứa `<script>` — chảy thẳng vào HTML. Vì escape chạy
 * trước, phần href cũng đã an toàn: không thể chèn `"` để thoát khỏi attribute.
 *
 * `target="_blank"` + `rel="noopener noreferrer"`: báo cáo là file HTML tự chứa, mở bằng
 * file:// — điều hướng cả tab đi mất thì mất luôn trang đang đọc.
 */
export const escLink = (s) => esc(s).replace(URL_RE, (raw) => {
  const duoi = (raw.match(DUOI_URL) ?? [''])[0];
  const url = raw.slice(0, raw.length - duoi.length);
  if (!url) return raw;
  return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${duoi}`;
});

export const fmtDate = (iso) => {
  const s = String(iso ?? '').slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
};

/**
 * Bố cục thư mục review: gom theo NGÀY trước, trong ngày mới chia dự án. Đường dẫn tính
 * tương đối từ `ledgerRoot` (xem assets.mjs) — writer nhận destRoot là chính thư mục ledger.
 *
 *   review/<yyyyMMdd>/_tong/tong.html      ← trang điều hướng toàn danh mục
 *   review/<yyyyMMdd>/<MA_DA>/review.html  ← báo cáo riêng từng dự án
 *
 * Gom theo ngày để một lượt rà soát nằm gọn một chỗ — xoá, nén, gửi đi đều theo lô.
 * `_tong` có gạch dưới để luôn đứng đầu khi sắp xếp và không bao giờ đụng mã dự án thật.
 */
const YMD = (iso) => String(iso ?? '').slice(0, 10).replace(/-/g, '');
const THU_MUC_TONG = '_tong';
export const duongDanTong = (iso) => `review/${YMD(iso)}/${THU_MUC_TONG}/tong.html`;
export const duongDanDuAn = (iso, maDa) => `review/${YMD(iso)}/${maDa}/review.html`;

// ---------------------------------------------------------------- SQL highlight

const SQL_KEYWORDS = ['CREATE', 'TABLE', 'ALTER', 'ADD', 'DROP', 'COLUMN', 'NOT', 'NULL',
  'PRIMARY', 'KEY', 'CONSTRAINT', 'DEFAULT', 'REFERENCES', 'UNIQUE', 'EXEC', 'DECLARE',
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'IF', 'EXISTS', 'AND', 'OR', 'SET', 'AS'];
const SQL_TYPES = ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR',
  'DATETIME', 'SMALLDATETIME', 'DATE', 'NUMERIC', 'DECIMAL', 'BIT', 'MONEY', 'TEXT', 'NTEXT'];
const kwRe = new RegExp(`\\b(${SQL_KEYWORDS.join('|')})\\b`, 'g');
const tyRe = new RegExp(`\\b(${SQL_TYPES.join('|')})\\b`, 'gi');

/** Tô nhẹ SQL bằng regex trên text ĐÃ escape — an toàn, không cần thư viện highlight. */
function highlightSql(raw) {
  return String(raw ?? '').split('\n').map((line) => {
    if (line.trim().startsWith('--')) return `<span class="sql-cm">${esc(line)}</span>`;
    return esc(line).replace(kwRe, '<span class="sql-kw">$1</span>').replace(tyRe, '<span class="sql-ty">$&</span>');
  }).join('\n');
}

// `ghiChuDdl` phải là SQL CHẠY ĐƯỢC, không phải mô tả bằng lời. Chỉ dẫn trong skill là
// chưa đủ — một lượt chạy thật ngày 2026-08-10 vẫn sinh ra 17 dòng văn xuôi dù skill đã
// nói rõ. Nên luật này được CƯỠNG CHẾ ở đây: sai thì `report` từ chối dựng.
const DDL_RE = /\b(CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+INDEX|DROP\s+TABLE|EXEC\s+\S*AddTable)/i;
// Script CREATE TABLE phải khai đích đến bằng một marker tường minh. Dò theo văn xuôi
// ("bảng trung gian…") quá mong manh — marker cho phép kiểm bằng máy, và đọc báo cáo
// cũng biết ngay bảng này sinh ra ở DB nào.
const CREATE_RE = /\bCREATE\s+TABLE\s+\[?([A-Za-z_][\w$]*)/i;
const DB_MARKER_RE = /^\s*--\s*DB:\s*(app|trung-gian)\s*$/im;
const AUDIT_COLS = ['status', 'user_id0', 'user_id2', 'datetime0', 'datetime2'];

/**
 * Kiểm payload, tách hai mức:
 *   fatal   — dữ liệu không dựng nổi (thiếu khoá, trạng thái lạ, hỏng cách tính hạn).
 *   quality — nội dung sai chuẩn nhưng phần deadline vẫn dùng được (ghiChuDdl không phải SQL).
 * Báo cáo một dự án đòi SẠCH cả hai. Trang tổng quan chỉ loại dự án khi `fatal` — lỗi
 * `quality` không được phép làm một dự án biến mất khỏi tầm mắt PM, chỉ hiện cảnh báo.
 */
function validatePayloadDetailed(p) {
  const fatal = [];
  const quality = [];
  if (!p || typeof p !== 'object') return { fatal: ['payload không phải object'], quality };
  if (!p.ma_da) fatal.push('thiếu `ma_da`');
  if (!p.ngay_chay) fatal.push('thiếu `ngay_chay` (YYYY-MM-DD) — ngày chạy rà soát');
  if (!Array.isArray(p.giaiDoan)) fatal.push('thiếu mảng `giaiDoan`');
  if (!Array.isArray(p.yeuCau)) fatal.push('thiếu mảng `yeuCau`');
  for (const [i, g] of (p.giaiDoan ?? []).entries()) {
    if (!g.giai_doan_da) fatal.push(`giaiDoan[${i}] thiếu \`giai_doan_da\``);
    if (!g.ngay_ht) fatal.push(`giaiDoan[${i}] thiếu \`ngay_ht\` (hạn hiệu lực = MAX(ngay_ht))`);
  }
  for (const [i, u] of (p.yeuCau ?? []).entries()) {
    const nhan = u.fcode1 || String(u.stt_rec ?? '').trim() || `#${i}`;
    if (!u.stt_rec) fatal.push(`yeuCau[${i}] thiếu \`stt_rec\``);
    if (!TRANG_THAI[u.trang_thai]) {
      fatal.push(`yeuCau[${i}] có trang_thai "${u.trang_thai}" — chỉ rà soát DD, XN, TH`);
    }
    // UR ở DD chưa phân là việc PM phải xử lý; thiếu menu_id thì tiêu chí 1 (kinh nghiệm
    // theo menu) không chấm được và gợi ý tụt xuống mức chỉ-xếp-theo-tải.
    // `ma_lt1` = mã PM tính là CHƯA phân (mặc định BA để lại) — xem laChuaPhanCong().
    if (u.trang_thai === 'DD' && laChuaPhanCong(u.ma_lt1, p.pm)
        && !String(u.menu_id ?? '').trim() && !String(u.sysid ?? '').trim()) {
      quality.push(`${nhan}: ở DD chưa phân lập trình mà cũng không có \`menu_id\`/\`sysid\` — không khớp được lịch sử menu, gợi ý phân công sẽ chỉ dựa vào tải.`);
    }
    if (u.ddl) {
      const { err } = sqlCuaUr(u);
      if (err) quality.push(`${nhan}: \`ddl\` sai spec — ${err}`);
    } else if (u.ghiChuDdl && !DDL_RE.test(u.ghiChuDdl)) {
      quality.push(`${nhan}: \`ghiChuDdl\` không chứa câu DDL nào — gợi ý tạo bảng/thêm cột PHẢI là script SQL chạy được. Tốt hơn: dùng \`ddl\` có cấu trúc để bộ sinh tự viết SQL (tools/lib/ddl.mjs). Xem skill fbo-new-table-proposal.`);
    }
    // `noi_dung` bị cắt tay khi agent copy từ kết quả `query_sql` vào payload là lỗi đã xảy ra
    // thật (2026-08-11, UR DEMO1) dù skill đã dặn lấy đủ — chỉ dẫn trong skill là chưa đủ, y hệt
    // lý do DDL_RE tồn tại ở trên. Luật này CƯỠNG CHẾ: agent khai thêm `noiDungLenGoc` = kết quả
    // `LEN(noi_dung)` thật từ SQL cạnh `noi_dung`; lệch độ dài là bị chặn ngay, không phải chờ
    // người đọc nhận ra câu cụt giữa chừng. Trường này TUỲ CHỌN — thiếu thì không kiểm được,
    // nhưng không chặn dựng báo cáo (nhiều UR cũ trong payload hiện có chưa kịp bổ sung).
    if (u.noiDungLenGoc !== undefined) {
      const lenGoc = Number(u.noiDungLenGoc);
      const lenHienTai = String(u.noi_dung ?? '').length;
      // Ngưỡng 0.9, không so bằng tuyệt đối: gộp khoảng trắng thừa (nhiều dấu cách liền nhau
      // do nguồn có xuống dòng/tab) là bước làm sạch HỢP LỆ, đo thực tế chỉ hụt ~1-3%. Cắt
      // xén thật (bug đã gặp) hụt 40-70% — ngưỡng 0.9 bắt được cắt xén, không bắt nhầm gộp.
      if (!Number.isFinite(lenGoc) || lenGoc <= 0) {
        quality.push(`${nhan}: \`noiDungLenGoc\` phải là số > 0 (kết quả LEN(noi_dung) từ SQL).`);
      } else if (lenHienTai < lenGoc * 0.9) {
        quality.push(`${nhan}: \`noi_dung\` dài ${lenHienTai} ký tự nhưng LEN(noi_dung) gốc là ${lenGoc} (hụt hơn 10%) — có thể đã bị cắt khi copy từ query_sql. Lấy lại đủ, đừng tóm tắt.`);
      }
    }
    // Tính năng chạy trên màn hình FBO ĐÃ CÓ SẴN thì không đẻ bảng mới — cái cần ghi lại là
    // luồng dữ liệu nguồn → đích, không phải DDL.
    if (u.luongDuLieu) {
      const ld = u.luongDuLieu;
      if (!Array.isArray(ld.nguon) || !ld.nguon.length) {
        quality.push(`${nhan}: \`luongDuLieu\` thiếu \`nguon\` (mảng bảng/nguồn dữ liệu đầu vào).`);
      }
      if (!ld.dich || !ld.dich.manHinh) {
        quality.push(`${nhan}: \`luongDuLieu\` thiếu \`dich.manHinh\` — phải nói rõ chứng từ đích trên FBO.`);
      }
    }
    // Kiểm chéo dưới đây chỉ dành cho `ghiChuDdl` viết tay. Spec `ddl` đi qua bộ sinh nên
    // các luật này đã được cưỡng chế ngay lúc sinh, không thể vi phạm.
    const created = !u.ddl && u.ghiChuDdl && CREATE_RE.exec(u.ghiChuDdl);
    if (created) {
      const marker = DB_MARKER_RE.exec(u.ghiChuDdl);
      const tableName = created[1];
      const laZc = /^zc/i.test(tableName);
      if (!marker) {
        quality.push(`${nhan}: script CREATE TABLE thiếu dòng khai đích đến. Thêm \`-- DB: app\` (DB App của FBO) hoặc \`-- DB: trung-gian\` (DB staging) — quy ước đặt tên khác nhau hoàn toàn giữa hai nơi.`);
      } else if (marker[1].toLowerCase() === 'trung-gian' && laZc) {
        quality.push(`${nhan}: khai \`-- DB: trung-gian\` nhưng đặt tên bảng \`${tableName}\` — tiền tố zc CHỈ dành cho DB App. Bảng ở DB trung gian giữ nguyên tên hệ nguồn để ETL ánh xạ 1-1. Xem data/fbo-ddl.json → bangTrungGian.`);
      } else if (marker[1].toLowerCase() === 'app' && laZc) {
        const thieu = AUDIT_COLS.filter((c) => !new RegExp(`\\b${c}\\b`, 'i').test(u.ghiChuDdl));
        if (thieu.length) {
          quality.push(`${nhan}: danh mục \`${tableName}\` trong DB App thiếu cột audit bắt buộc: ${thieu.join(', ')}. Xem data/fbo-ddl.json → danhMuc.mandatoryColumns.`);
        }
      }
    }
  }

  // Khối nhân sự là TUỲ CHỌN — thiếu thì báo cáo vẫn dựng, chỉ mất mục gợi ý phân công.
  // Nhưng khai sai hình dạng thì phải nói ngay, đừng để chấm điểm ra kết quả rỗng khó hiểu.
  const ns = p.nhanSu;
  if (ns !== undefined) {
    if (typeof ns !== 'object' || ns === null || Array.isArray(ns)) {
      fatal.push('`nhanSu` phải là object { ungVien?, lichSuMenu, taiTrong, dongGopDauVao? }');
    } else {
      for (const [key, cot] of [
        ['lichSuMenu', 'ma_lt1'],
        ['taiTrong', 'ma_lt1'],
        ['dongGopDauVao', 'ma_lt1'],
      ]) {
        const arr = ns[key];
        if (arr === undefined) continue;
        if (!Array.isArray(arr)) { fatal.push(`\`nhanSu.${key}\` phải là mảng`); continue; }
        for (const [j, row] of arr.entries()) {
          if (!row || !String(row[cot] ?? '').trim()) {
            fatal.push(`nhanSu.${key}[${j}] thiếu \`${cot}\``);
          }
        }
      }
      const coDdChuaGiao = (p.yeuCau ?? []).some(
        (u) => u.trang_thai === 'DD' && laChuaPhanCong(u.ma_lt1, p.pm));
      if (coDdChuaGiao && !ns.lichSuMenu?.length) {
        quality.push('`nhanSu` không có `lichSuMenu` — tiêu chí 1 (ưu tiên người đã làm menu đó) không chấm được.');
      }
      if (coDdChuaGiao && !ns.taiTrong?.length) {
        quality.push('`nhanSu` không có `taiTrong` — tiêu chí 2 (tải sắp tới hạn) không chấm được.');
      }
    }
  }

  return { fatal, quality };
}

/** Kiểm payload trước khi dựng — thiếu gì báo rõ chỗ đó, không lặng lẽ render rỗng. */
export function validatePayload(p) {
  const { fatal, quality } = validatePayloadDetailed(p);
  return [...fatal, ...quality];
}

export function validatePortfolioPayload(p) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['payload không phải object'];
  if (p.kind !== 'portfolio') errs.push('thiếu `kind: "portfolio"`');
  if (!p.ngay_chay) errs.push('thiếu `ngay_chay` (YYYY-MM-DD)');
  if (!Array.isArray(p.projects) || !p.projects.length) errs.push('thiếu mảng `projects` (ít nhất một dự án)');
  return errs;
}

/** Ghép UR với hạn giai đoạn, xếp mức cảnh báo. */
function enrich(payload, h, pm = '') {
  const today = String(payload.ngay_chay).slice(0, 10);
  const byPhase = new Map();
  for (const g of payload.giaiDoan) {
    const cls = classifyDeadline(h, today, String(g.ngay_ht).slice(0, 10));
    byPhase.set(g.giai_doan_da, { ...g, ...cls });
  }
  const urs = payload.yeuCau.map((u) => {
    const phase = byPhase.get(u.giai_doan_da) ?? null;
    return {
      ...u,
      _phase: phase,
      _muc: phase?.muc ?? 'khong-co-han',
      _soNgay: phase?.soNgay ?? null,
      _chotDaHen: phase ? !!phase.xac_nhan_da_hen_yn : null,
      _pm: pm,
    };
  });
  return { today, phases: [...byPhase.values()], urs };
}

/**
 * Mã PM của một payload — quyết định `ma_lt1` nào bị coi là "mặc định BA để lại", nên phải
 * lấy đúng: payload khai gì dùng nấy, không có mới rớt về cấu hình.
 */
function pmCuaPayload(payload, hub = HUB) {
  return String(payload?.pm ?? loadConfig(hub).pm.maNv ?? '').trim();
}

/** Tóm tắt một dự án dùng cho cả trang riêng lẫn thẻ trong trang tổng quan. */
function summarize(payload, h) {
  const pm = pmCuaPayload(payload);
  const { today, phases, urs } = enrich(payload, h, pm);
  const quaHan = urs.filter((u) => u._muc === 'qua-han');
  const sapToi = urs.filter((u) => u._muc === 'sap-toi');

  // urs chỉ chứa UR DD/XN/TH (validatePayload chặn mọi trạng thái khác) — đếm số YC tồn đọng
  // theo giai đoạn để biết giai đoạn nào THẬT SỰ còn việc đang chờ, chứ không phải cứ chưa
  // tick chốt đã hẹn là liệt kê. `nbcnhanhtda` không tự dọn dòng cũ — giai đoạn đã xong hết
  // (mọi UR đã lên HT trở lên) vẫn còn nằm đó, không nên vẫn báo "quá hạn".
  const soUrTonDongTheoGiaiDoan = new Map();
  for (const u of urs) {
    const key = u.giai_doan_da;
    soUrTonDongTheoGiaiDoan.set(key, (soUrTonDongTheoGiaiDoan.get(key) ?? 0) + 1);
  }
  const chuaChot = phases
    .filter((p) => !p.xac_nhan_da_hen_yn && soUrTonDongTheoGiaiDoan.has(p.giai_doan_da))
    .map((p) => ({ ...p, soUrTonDong: soUrTonDongTheoGiaiDoan.get(p.giai_doan_da) }));

  // Nguồn sự thật là CHI TIẾT: nbphyc lọc DD/XN/TH. Mọi con số tổng hợp phải suy ra từ đó,
  // nên giai đoạn không còn UR nào tồn đọng thì không lên biểu đồ — `nbcnhanhtda` giữ lại
  // cả dòng của giai đoạn đã xong, vẽ chúng lên chỉ làm nhiễu bức tranh việc cần làm.
  const phasesCoUr = phases.filter((p) => soUrTonDongTheoGiaiDoan.has(p.giai_doan_da));
  const soPhaseAn = phases.length - phasesCoUr.length;
  const congPm = urs.filter((u) => u.trang_thai === 'DD');
  // `ma_lt1` = mã PM là giá trị MẶC ĐỊNH màn hình BA để lại, không phải bằng chứng đã phân
  // việc — xem laChuaPhanCong(). Coi như chưa giao, y hệt ô trống.
  const chuaGiao = congPm.filter((u) => laChuaPhanCong(u.ma_lt1, pm));
  const ngoaiTlksThieuCanCu = urs.filter((u) => !u.tlks_yn && !u.canCu);
  const health = quaHan.length ? 'khan-cap' : sapToi.length || chuaChot.length ? 'can-chu-y' : 'on';
  const ganNhat = [...quaHan, ...sapToi].sort((a, b) => (a._soNgay ?? 0) - (b._soNgay ?? 0))[0] ?? null;
  return { today, pm, phases, phasesCoUr, soPhaseAn, urs, quaHan, sapToi, chuaChot, congPm, chuaGiao,
    ngoaiTlksThieuCanCu, health, ganNhat };
}

// ---------------------------------------------------------------- biểu đồ

function chartDeadline(phases, today) {
  if (!phases.length) return '<p class="empty">Không có giai đoạn nào có hạn.</p>';
  const rowH = 34, padL = 210, padR = 24, padT = 28, w = 900;
  const h = padT + phases.length * rowH + 30;
  const dayMs = 86400000;
  const t0 = Date.parse(today + 'T00:00:00Z');
  const stamps = phases.map((p) => Date.parse(String(p.ngay_ht).slice(0, 10) + 'T00:00:00Z'));
  let min = Math.min(t0, ...stamps), max = Math.max(t0, ...stamps);
  const pad = Math.max((max - min) * 0.12, 3 * dayMs);
  min -= pad; max += pad;
  const x = (t) => padL + ((t - min) / (max - min)) * (w - padL - padR);

  const rows = phases.map((p, i) => {
    const y = padT + i * rowH;
    const ts = Date.parse(String(p.ngay_ht).slice(0, 10) + 'T00:00:00Z');
    const from = Math.min(x(t0), x(ts)), to = Math.max(x(t0), x(ts));
    const label = p.giai_doan_da.length > 26 ? p.giai_doan_da.slice(0, 25) + '…' : p.giai_doan_da;
    return `  <text class="ax" x="${padL - 10}" y="${y + 16}" text-anchor="end">${esc(label)}</text>
  <rect class="track" x="${padL}" y="${y + 10}" width="${w - padL - padR}" height="6" rx="3"/>
  <rect class="bar ${p.muc}" x="${from.toFixed(1)}" y="${y + 8}" width="${Math.max(to - from, 2).toFixed(1)}" height="10" rx="5"/>
  <circle class="dot ${p.muc}" cx="${x(ts).toFixed(1)}" cy="${y + 13}" r="5"/>
  <text class="val ${p.muc}" x="${Math.min(x(ts) + 12, w - padR - 4).toFixed(1)}" y="${y + 17}">${fmtDate(p.ngay_ht)}${p.xac_nhan_da_hen_yn ? '' : ' ⚑'}</text>`;
  }).join('\n');

  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Hạn theo giai đoạn">
  <line class="today" x1="${x(t0).toFixed(1)}" y1="${padT - 8}" x2="${x(t0).toFixed(1)}" y2="${h - 26}"/>
  <text class="today-lbl" x="${x(t0).toFixed(1)}" y="${h - 10}" text-anchor="middle">hôm nay ${fmtDate(today)}</text>
${rows}
</svg>`;
}

function chartByPhase(urs, phases) {
  const keys = phases.map((p) => p.giai_doan_da);
  for (const u of urs) if (!keys.includes(u.giai_doan_da)) keys.push(u.giai_doan_da);
  if (!keys.length) return '<p class="empty">Không có yêu cầu nào.</p>';
  const rowH = 30, padL = 210, padR = 60, padT = 12, w = 900;
  const h = padT + keys.length * rowH + 8;
  const counts = keys.map((k) => {
    const inPhase = urs.filter((u) => u.giai_doan_da === k);
    return { k, DD: inPhase.filter((u) => u.trang_thai === 'DD').length,
      XN: inPhase.filter((u) => u.trang_thai === 'XN').length,
      TH: inPhase.filter((u) => u.trang_thai === 'TH').length, tong: inPhase.length };
  });
  const maxN = Math.max(1, ...counts.map((c) => c.tong));
  const scale = (n) => (n / maxN) * (w - padL - padR);

  const rows = counts.map((c, i) => {
    const y = padT + i * rowH;
    let cx = padL;
    const segs = ['DD', 'XN', 'TH'].filter((s) => c[s] > 0).map((s) => {
      const wd = scale(c[s]);
      const r = `<rect class="seg ${TRANG_THAI[s].mau}" x="${cx.toFixed(1)}" y="${y}" width="${wd.toFixed(1)}" height="18" rx="3"><title>${s} — ${TRANG_THAI[s].ten}: ${c[s]}</title></rect>`;
      cx += wd;
      return r;
    }).join('');
    const label = c.k.length > 26 ? c.k.slice(0, 25) + '…' : c.k;
    return `  <text class="ax" x="${padL - 10}" y="${y + 13}" text-anchor="end">${esc(label)}</text>
  ${segs}
  <text class="val" x="${(cx + 8).toFixed(1)}" y="${y + 13}">${c.tong}</text>`;
  }).join('\n');

  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Yêu cầu theo giai đoạn và trạng thái">
${rows}
</svg>`;
}

function chartTlks(urs) {
  const trong = urs.filter((u) => u.tlks_yn).length;
  const ngoai = urs.length - trong;
  if (!urs.length) return '<p class="empty">Không có yêu cầu nào.</p>';
  const w = 900, h = 62, barW = w - 24;
  const wTrong = (trong / urs.length) * barW;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Trong và ngoài TLKS">
  <rect class="seg tlks-in" x="12" y="12" width="${wTrong.toFixed(1)}" height="22" rx="4"><title>Trong TLKS: ${trong}</title></rect>
  <rect class="seg tlks-out" x="${(12 + wTrong).toFixed(1)}" y="12" width="${(barW - wTrong).toFixed(1)}" height="22" rx="4"><title>Ngoài TLKS: ${ngoai}</title></rect>
  <text class="val" x="12" y="52">Trong TLKS: ${trong}</text>
  <text class="val" x="${(w - 12).toFixed(1)}" y="52" text-anchor="end">Ngoài TLKS: ${ngoai}</text>
</svg>`;
}

// ---------------------------------------------------------------- bảng

function urTable(urs, cols) {
  if (!urs.length) return '<p class="empty">Không có mục nào.</p>';
  const head = cols.map((c) => `<th>${esc(c.ten)}</th>`).join('');
  const body = urs.map((u) => {
    const tds = cols.map((c) => `<td class="${c.cls ?? ''}">${c.get(u)}</td>`).join('');
    return `<tr>${tds}</tr>`;
  }).join('\n');
  return `<div class="tw"><table><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table></div>`;
}

const colStt = { ten: 'UR', cls: 'mono', get: (u) => esc(u.fcode1 || String(u.stt_rec).trim()) };
const colNoiDung = { ten: 'Nội dung', get: (u) => escLink(u.noi_dung ?? '') };
const colGiaiDoan = { ten: 'Giai đoạn', get: (u) => esc(u.giai_doan_da ?? '') };
const colTrangThai = { ten: 'TT', cls: 'mono', get: (u) => `<span class="pill ${TRANG_THAI[u.trang_thai]?.mau ?? ''}">${esc(u.trang_thai)}</span>` };
const colHan = { ten: 'Hạn', cls: 'mono', get: (u) => u._phase ? fmtDate(u._phase.ngay_ht) : '—' };
const colConLai = { ten: 'Còn (ngày LV)', cls: 'mono', get: (u) =>
  u._soNgay === null ? '—' : u._soNgay < 0 ? `<span class="qua-han">quá ${Math.abs(u._soNgay)}</span>` : String(u._soNgay) };
const colTlks = { ten: 'TLKS', get: (u) => u.tlks_yn
  ? `<span class="ok">trong</span> ${esc(u.trang_tlks ?? '')}`
  : `<span class="warn">ngoài</span>${u.canCu ? ' ' + esc(u.canCu) : ' <em>chưa có căn cứ</em>'}` };
const colDeXuat = { ten: 'Đề xuất', get: (u) => u.deXuat
  ? `<span class="pill dx">${esc(u.deXuat.trang_thai)}</span> ${esc(u.deXuat.lyDo ?? '')}` : '—' };
const colDuAn = { ten: 'Dự án', cls: 'mono', get: (u) => esc(u._ma_da ?? '') };
/**
 * Hiển thị ma_lt1 — BẮT BUỘC trên mọi danh sách việc gấp để PM biết ai để liên hệ.
 * `_pm` do enrich() gắn: `ma_lt1` bằng đúng mã PM là giá trị mặc định BA để lại lúc lên UR,
 * không phải đã phân việc — phải nói rõ chứ không hiện như một cái tên đã giao.
 */
function fmtMaLt1(u, { emptyAsWarn = false } = {}) {
  const nguoi = String(u?.ma_lt1 ?? '').trim();

  if (nguoi) {
    // Mang mã PM và đang ở DD = mặc định BA còn sót. Ngoài DD (XN/TH) thì PM đã thật sự nhận
    // việc — bám vào trang_thai, KHÔNG bám vào emptyAsWarn, nếu không nhãn sẽ rò sang mọi
    // danh sách gấp và bôi bẩn cả những UR PM đang làm dở.
    return u?.trang_thai === 'DD' && laChuaPhanCong(nguoi, u?._pm)
      ? `<span class="warn">${esc(nguoi)} (mặc định — chưa phân)</span>`
      : esc(nguoi);
  }
  // Ô trống: cảnh báo khi ở DD, hoặc khi đang nằm trong danh sách "phải xử lý ngay".
  return u?.trang_thai === 'DD' || emptyAsWarn
    ? '<span class="warn">chưa giao</span>'
    : '<span class="muted">—</span>';
}
const colMaLt1 = { ten: 'LT thực hiện', cls: 'mono', get: (u) => fmtMaLt1(u) };

export function section(id, tieuDe, moTa, noiDung, dem) {
  const badge = dem === undefined ? '' : `<span class="count${dem ? '' : ' zero'}">${dem}</span>`;
  return `<section id="${id}">
<h2>${esc(tieuDe)}${badge}</h2>
${moTa ? `<p class="lead">${esc(moTa)}</p>` : ''}
${noiDung}
</section>`;
}

const HEALTH_LABEL = { 'khan-cap': 'Khẩn cấp', 'can-chu-y': 'Cần chú ý', 'on': 'Ổn' };

export function page(title, metaLine, body) {
  return renderTemplate('page.html', {
    title: esc(title),
    metaLine,
    body,
    css: CSS,
  });
}

// ---------------------------------------------------------------- shell dashboard
//
// Bố cục 1 viewport: header dính + KPI + 2 biểu đồ chiều cao cố định + danh sách việc phải
// làm ngay. Chi tiết dài (bảng đầy đủ, SQL, luồng dữ liệu) nằm ở tab khác.
//
// Tab và bộ lọc dùng radio ẩn + CSS `:checked ~` — KHÔNG JavaScript. Báo cáo mở offline,
// gửi qua mail, nhúng trong iframe đều chạy; không có gì để hỏng.

const TAB_IDS = ['tq', 'ct', 'kt'];

/**
 * @param {{title:string, metaLine:string, canhBao?:string, kpi:string, hero:string,
 *          viz:string, action:string, danhSach?:string,
 *          tabs:Array<{id:string,nhan:string,dem?:number,html:string}>}} p
 */
function dashboardPage(p) {
  const tabs = p.tabs.filter(Boolean);
  const radios = tabs.map((t, i) => `<input type="radio" name="tab" id="tab-${t.id}" class="uin"${i === 0 ? ' checked' : ''}>`).join('\n');
  const filters = ['all', 'qua', 'sap', 'pm']
    .map((f, i) => `<input type="radio" name="filt" id="f-${f}" class="uin"${i === 0 ? ' checked' : ''}>`).join('\n');
  const nav = tabs.map((t) => {
    const badge = t.dem === undefined ? '' : `<span class="tab-dem${t.dem ? '' : ' zero'}">${t.dem}</span>`;
    return `<label class="tab" for="tab-${t.id}">${esc(t.nhan)}${badge}</label>`;
  }).join('');
  const panels = tabs.map((t, i) => {
    const noiDung = i === 0
      ? [p.canhBao, p.kpi, p.hero, p.viz, p.action, p.danhSach].filter(Boolean).join('\n')
      : t.html;
    return `<section class="panel pn-${t.id}">\n${noiDung}\n</section>`;
  }).join('\n');

  return renderTemplate('dashboard.html', {
    title: esc(p.title),
    metaLine: p.metaLine,
    css: CSS,
    radios,
    filters,
    nav,
    panels,
  });
}

/** KPI card lớn. `muc`: bad | warn | ok | '' */
function kpiRow(cards) {
  return `<div class="kpis">${cards.map((c) => `
  <div class="kpi ${c.n ? (c.muc ?? '') : 'zero'}">
    <b>${c.n}</b>
    <span>${esc(c.nhan)}</span>
    ${c.phu ? `<i>${esc(c.phu)}</i>` : ''}
  </div>`).join('')}</div>`;
}

/** Một dòng "việc nóng nhất" ngay dưới KPI. */
function heroLine(u, opts = {}) {
  if (!u) {
    return `<p class="hero ok-hero">Không có việc nào quá hạn hay sắp tới hạn. Danh mục đang trong tầm kiểm soát.</p>`;
  }
  const con = u._soNgay < 0 ? `quá hạn ${Math.abs(u._soNgay)} ngày LV` : `còn ${u._soNgay} ngày LV`;
  const da = u._ma_da ? `<code>${esc(u._ma_da)}</code> · ` : '';
  const lt = ` · LT <strong class="mono">${fmtMaLt1(u, { emptyAsWarn: true })}</strong>`;
  const href = opts.href ? ` <a class="hero-go" href="${opts.href}">mở →</a>` : '';
  return `<p class="hero ${u._muc}">
  <span class="hero-tag">Nóng nhất</span>
  ${da}<strong>${esc(u.fcode1 || String(u.stt_rec).trim())}</strong>${lt} — ${escLink(u.noi_dung ?? '')}
  <span class="hero-con">${con}</span>${href}</p>`;
}

const cutTo = (s, n) => {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

/**
 * Danh sách việc phải xử lý ngay. Thứ tự: quá hạn (quá nhiều→ít) → sắp tới ≤2 ngày → chờ PM.
 * Mỗi dòng mang `data-f` để bộ lọc CSS ẩn/hiện, và `data-muc` để tô màu.
 */
function actionList(rows, { top = 6, hrefOf } = {}) {
  if (!rows.length) {
    return `<section class="act">
  <div class="act-head"><h2>Phải xử lý ngay</h2></div>
  <p class="act-empty">Sạch việc gấp — không có mục quá hạn, sắp tới hạn hay đang chờ duyệt.</p>
</section>`;
  }
  const chip = (id, nhan) => `<label class="chip" for="f-${id}">${nhan}</label>`;
  const dong = (r, i) => {
    const con = r._soNgay === null ? '—'
      : r._soNgay < 0 ? `<span class="qua-han">quá ${Math.abs(r._soNgay)}</span>`
      : `${r._soNgay} ngày`;
    // Mức độ khẩn phải đọc được bằng CHỮ, không chỉ bằng màu — người mù màu và bản in
    // đen trắng vẫn phải phân biệt được (ux-guideline "Color Only", severity High).
    const mucNhan = r._f.includes('qua') ? { t: 'QUÁ HẠN', c: 'sv-bad' }
      : r._f.includes('sap') ? { t: 'GẤP', c: 'sv-warn' }
      : { t: 'CHỜ DUYỆT', c: 'sv-neu' };
    const href = hrefOf ? hrefOf(r) : null;
    // ma_lt1 đứng ngay sau mã UR — PM nhìn dòng nào cũng biết ai đang làm để gọi.
    const inner = `<span class="a-sv ${mucNhan.c}">${mucNhan.t}</span>
    <span class="a-da">${esc(r._ma_da ?? '')}</span>
    <span class="a-ur mono">${esc(r.fcode1 || String(r.stt_rec).trim())}</span>
    <span class="a-lt mono" title="LT thực hiện">${fmtMaLt1(r, { emptyAsWarn: true })}</span>
    <span class="a-nd">${esc(cutTo(r.noi_dung, 88))}</span>
    <span class="a-tt"><span class="pill ${TRANG_THAI[r.trang_thai]?.mau ?? ''}">${esc(r.trang_thai)}</span></span>
    <span class="a-han mono">${r._phase ? fmtDate(r._phase.ngay_ht) : '—'}</span>
    <span class="a-con mono">${con}</span>`;
    return href
      ? `<a class="act-row${i >= top ? ' act-more' : ''}" data-muc="${r._muc}" data-f="${r._f}" href="${href}">${inner}</a>`
      : `<div class="act-row${i >= top ? ' act-more' : ''}" data-muc="${r._muc}" data-f="${r._f}">${inner}</div>`;
  };
  const con = rows.length - top;
  return `<section class="act">
  <div class="act-head">
    <h2>Phải xử lý ngay</h2>
    <div class="chips">${chip('all', 'Tất cả')}${chip('qua', 'Quá hạn')}${chip('sap', '≤ 3 ngày')}${chip('pm', 'Chờ duyệt')}</div>
  </div>
  <div class="act-cols" aria-hidden="true"><span>Mức</span><span>Dự án</span><span>UR</span><span>Lập trình</span><span>Nội dung</span><span>TT</span><span>Hạn</span><span>Còn</span></div>
  <div class="act-list">${rows.map(dong).join('\n')}</div>
  ${con > 0 ? `<label class="xem-them" for="more"><span class="mo">Xem thêm ${con} mục</span><span class="dong">Thu gọn</span></label>` : ''}
  <p class="act-none">Không có mục nào khớp bộ lọc đang chọn.</p>
</section>`;
}

/** Gom + xếp ưu tiên việc cần làm ngay. Trả về mảng đã gắn `_f` (token cho bộ lọc CSS). */
function xepViecCanLam({ quaHan, sapToi, congPm }, leadDays) {
  const seen = new Set();
  const out = [];
  const them = (u, f) => {
    const k = `${u._ma_da ?? ''}|${u.stt_rec}`;
    if (seen.has(k)) { const cu = out.find((x) => `${x._ma_da ?? ''}|${x.stt_rec}` === k); if (cu) cu._f += ' ' + f; return; }
    seen.add(k);
    out.push({ ...u, _f: f });
  };
  [...quaHan].sort((a, b) => a._soNgay - b._soNgay).forEach((u) => them(u, 'qua'));
  [...sapToi].sort((a, b) => a._soNgay - b._soNgay).forEach((u) => them(u, 'sap'));
  [...congPm].sort((a, b) => (a._soNgay ?? 99) - (b._soNgay ?? 99)).forEach((u) => them(u, 'pm'));
  return out;
}

/**
 * Nhãn mức khẩn dạng CHỮ cho một UR.
 *
 * Chữ chứ không chỉ màu: bản in đen trắng và người mù màu vẫn phải đọc ra được mức độ
 * (ux-guideline "Color Only", severity High). Cùng bảng chữ với actionList() — hai danh sách
 * trên cùng một trang mà gọi tên mức khác nhau là bắt người đọc dịch qua lại.
 */
const MUC_NHAN = {
  'qua-han': { t: 'QUÁ HẠN', c: 'sv-bad' },
  'sap-toi': { t: 'GẤP', c: 'sv-warn' },
  'con-thoi-gian': { t: 'CÒN HẠN', c: 'sv-calm' },
  'khong-co-han': { t: 'CHƯA CÓ HẠN', c: 'sv-neu' },
};

/**
 * Thứ tự đọc của một danh sách UR: gấp trước, thong thả sau, chưa có hạn cuối cùng.
 * `_soNgay === null` (giai đoạn không có hạn) phải nằm cuối chứ không được coi là 0 ngày.
 */
const xepTheoHan = (a, b) => {
  const k = (u) => (u._soNgay === null || u._soNgay === undefined ? Infinity : u._soNgay);
  return k(a) - k(b);
};

/**
 * TOÀN BỘ UR trong phạm vi (DD/XN/TH), không lọc theo mức khẩn.
 *
 * Vì sao phải có, dù đã có actionList(): actionList chỉ gom quá hạn + sắp tới + chờ duyệt. Dự
 * án nào không có mục nào trong ba nhóm đó — HUM, PSL_DKVN ngày 2026-08-18 — thì tab Tổng quan
 * báo "1 UR đang theo dõi" rồi không hiện UR nào cả. Con số không dẫn tới được cái nó đếm là
 * con số PM không kiểm chứng được.
 *
 * UR chưa tới hạn tô `--calm` (xám xanh trầm) chứ không đỏ/cam: chúng không đòi hành động hôm
 * nay, và một danh sách mà mọi dòng đều kêu thì không dòng nào kêu được nữa.
 *
 * @param {Array} urs         UR đã qua enrich() (_muc/_soNgay/_phase)
 * @param {{hrefOf?: Function, cotDau: {ten: string, get: Function}}} opts
 */
function danhSachUr(urs, { hrefOf, cotDau } = {}) {
  if (!urs.length) return '<p class="empty">Không có yêu cầu nào ở DD/XN/TH.</p>';
  const cot = cotDau ?? { ten: 'Dự án', get: (u) => u._ma_da ?? '' };

  const dong = (u) => {
    const m = MUC_NHAN[u._muc] ?? MUC_NHAN['khong-co-han'];
    const con = u._soNgay === null || u._soNgay === undefined ? '—'
      : u._soNgay < 0 ? `<span class="qua-han">quá ${Math.abs(u._soNgay)}</span>`
      : `${u._soNgay} ngày`;
    const inner = `<span class="a-sv ${m.c}">${m.t}</span>
    <span class="a-da">${esc(cot.get(u))}</span>
    <span class="a-ur mono">${esc(u.fcode1 || String(u.stt_rec).trim())}</span>
    <span class="a-lt mono" title="LT thực hiện">${fmtMaLt1(u)}</span>
    <span class="a-nd" title="${esc(u.noi_dung ?? '')}">${esc(cutTo(u.noi_dung, 88))}</span>
    <span class="a-tt"><span class="pill ${TRANG_THAI[u.trang_thai]?.mau ?? ''}">${esc(u.trang_thai)}</span></span>
    <span class="a-han mono">${u._phase ? fmtDate(u._phase.ngay_ht) : '—'}</span>
    <span class="a-con mono">${con}</span>`;
    const href = hrefOf ? hrefOf(u) : null;
    return href
      ? `<a class="act-row" data-muc="${u._muc}" href="${href}">${inner}</a>`
      : `<div class="act-row" data-muc="${u._muc}">${inner}</div>`;
  };

  const dem = (muc) => urs.filter((u) => u._muc === muc).length;
  const chuThich = ['qua-han', 'sap-toi', 'con-thoi-gian', 'khong-co-han']
    .filter((m) => dem(m))
    .map((m) => `<span class="ul-key ${MUC_NHAN[m].c}">${MUC_NHAN[m].t} ${dem(m)}</span>`).join('');

  return `<div class="ul-head">
  <p class="lead">Mọi yêu cầu còn ở DD/XN/TH, kể cả những cái chưa tới hạn — đây là danh sách con số “UR đang theo dõi” bên trên đếm.</p>
  <div class="ul-keys">${chuThich}</div>
</div>
<div class="act-cols" aria-hidden="true"><span>Mức</span><span>${esc(cot.ten)}</span><span>UR</span><span>Lập trình</span><span>Nội dung</span><span>TT</span><span>Hạn</span><span>Còn</span></div>
<div class="act-list ul-scroll">${[...urs].sort(xepTheoHan).map(dong).join('\n')}</div>`;
}

// ---------------------------------------------------------------- biểu đồ dashboard

/** Cột chồng theo dự án: đỏ quá hạn · cam sắp tới · xanh phần còn lại. */
function chartPriorityByProject(items) {
  if (!items.length) return '<p class="empty">Chưa có dự án nào.</p>';
  const w = 620, h = 200, padB = 34, padT = 22, padL = 8, padR = 8;
  const n = items.length;
  const slot = (w - padL - padR) / n;
  const barW = Math.min(52, slot * 0.62);
  const maxN = Math.max(1, ...items.map(({ summary: s }) => s.urs.length));
  const sc = (v) => (v / maxN) * (h - padT - padB);

  const cols = items.map(({ payload, summary: s }, i) => {
    const cx = padL + slot * i + slot / 2;
    const q = s.quaHan.length, sp = s.sapToi.length;
    const on = Math.max(0, s.urs.length - q - sp);
    let y = h - padB;
    const seg = (v, cls) => {
      if (!v) return '';
      const hh = sc(v);
      y -= hh;
      return `<rect class="pb ${cls}" x="${(cx - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${hh.toFixed(1)}"><title>${cls === 'q' ? 'quá hạn' : cls === 's' ? 'sắp tới hạn' : 'còn thời gian'}: ${v}</title></rect>`;
    };
    const bars = seg(on, 'o') + seg(sp, 's') + seg(q, 'q');
    const tong = s.urs.length;
    return `${bars}
  <text class="pb-n" x="${cx.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle">${tong}</text>
  <text class="pb-l" x="${cx.toFixed(1)}" y="${h - padB + 15}" text-anchor="middle">${esc(cutTo(payload.ma_da, 9))}</text>
  ${q ? `<text class="pb-q" x="${cx.toFixed(1)}" y="${h - padB + 28}" text-anchor="middle">${q} quá hạn</text>` : ''}`;
  }).join('\n');

  return `<svg class="vchart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Ưu tiên theo dự án">
  <line class="base" x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}"/>
${cols}
</svg>`;
}

/** Timeline thu gọn: hôm nay ở giữa, quá hạn bên trái, sắp tới bên phải. */
function chartTimelineCompact(points, today) {
  if (!points.length) return '<p class="empty">Không có mốc hạn nào.</p>';
  const w = 620, h = 200, mid = w / 2, padT = 26, padB = 26;
  const maxAbs = Math.max(3, ...points.map((p) => Math.abs(p.soNgay ?? 0)));
  const x = (d) => mid + (d / maxAbs) * (mid - 46);
  const lane = (h - padT - padB) / Math.max(points.length, 1);
  const rowH = Math.min(26, lane);

  const rows = points.slice(0, 7).map((p, i) => {
    const y = padT + i * rowH + rowH / 2;
    const px = x(p.soNgay ?? 0);
    const from = Math.min(mid, px), to = Math.max(mid, px);
    const anchor = px < mid ? 'end' : 'start';
    const tx = px < mid ? px - 8 : px + 8;
    return `  <rect class="tl-bar ${p.muc}" x="${from.toFixed(1)}" y="${(y - 3).toFixed(1)}" width="${Math.max(to - from, 2).toFixed(1)}" height="6" rx="3"/>
  <circle class="tl-dot ${p.muc}" cx="${px.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"/>
  <text class="tl-lbl ${p.muc}" x="${tx.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}">${esc(cutTo(p.label, 22))}</text>`;
  }).join('\n');

  return `<svg class="vchart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Timeline hạn">
  <line class="tl-now" x1="${mid}" y1="${padT - 12}" x2="${mid}" y2="${h - padB + 4}"/>
  <text class="tl-now-l" x="${mid}" y="${padT - 16}" text-anchor="middle">hôm nay ${fmtDate(today)}</text>
  <text class="tl-side" x="14" y="${h - 8}">← quá hạn</text>
  <text class="tl-side" x="${w - 14}" y="${h - 8}" text-anchor="end">sắp tới →</text>
${rows}
</svg>`;
}

function vizRow(a, b, nhanA, nhanB) {
  return `<div class="viz">
  <figure class="viz-box"><figcaption>${esc(nhanA)}</figcaption>${a}</figure>
  <figure class="viz-box"><figcaption>${esc(nhanB)}</figcaption>${b}</figure>
</div>`;
}

// ---------------------------------------------------------------- dựng: một dự án

const DO_TIN_CAY = {
  'cao': { nhan: 'tin cậy cao', cls: 'ok', vi: 'có lịch sử làm đúng menu này' },
  'trung-binh': { nhan: 'tin cậy trung bình', cls: 'warn', vi: 'chỉ dựa vào đóng góp UR đầu vào' },
  'thap': { nhan: 'tin cậy thấp', cls: 'warn', vi: 'không có bằng chứng kinh nghiệm, chỉ xếp theo tải' },
};

/** Nhãn ứng viên: mã là khoá, tên chỉ để người đọc khỏi phải tra ai là ai. */
function nhanUngVien(c) {
  const vai = [c.ma_chv === 'PP' ? 'phó phòng' : null, c.laPm ? 'PM' : null].filter(Boolean);
  return `<strong>${esc(c.ma_lt1)}</strong>${c.ten ? ` <span class="muted">${esc(c.ten)}</span>` : ''}`
    + (vai.length ? ` <span class="pill">${esc(vai.join(' · '))}</span>` : '');
}

/**
 * Nói rõ PM của dự án này là ai và vì sao.
 *
 * `pmNguon = 'pp-thay-the'` là tình huống có thật và dễ hiểu nhầm: LTQL ghi trên `nbdmda`
 * không còn trong roster phòng (đã off hoặc chuyển bộ phận) nên người chịu trách nhiệm là
 * cấp phó phòng. Không nói ra thì PM nhìn thấy một cái tên lạ đứng ở cột PM và không hiểu.
 */
function ghiChuPmDuAn(payload) {
  if (payload?.pmNguon === 'pp-thay-the') {
    const cu = (payload.pmNgoaiPhong ?? []).map((m) => `<code>${esc(m)}</code>`).join(', ');
    return `<p class="banner">Lập trình quản lý ghi trên dự án (${cu || 'không rõ'}) không còn trong danh sách nhân sự đang làm việc của bộ phận — đã off hoặc chuyển công tác. Người chịu trách nhiệm ở đây tính là <strong>${esc(payload.pm)}</strong> (phó phòng, quản lý toàn bộ dự án của phòng).</p>`;
  }
  if (payload?.pmNguon === 'khong-xac-dinh') {
    return '<p class="banner">Không xác định được PM của dự án: lập trình quản lý trên <code>nbdmda</code> đã rời bộ phận và roster cũng không có ai ở cấp phó phòng.</p>';
  }
  return '';
}

/** Mục gợi ý người tiếp nhận cho UR ở DD chưa phân công thật sự. */
function phanCongBlock(canGiao, payload, trongSo, pm) {
  if (!canGiao.length) return { dem: 0, html: '<p class="empty">Mọi yêu cầu ở DD đều đã phân lập trình thực hiện.</p>' };

  const nhanSu = payload?.nhanSu;
  // Nói rõ vì sao những UR mang tên PM vẫn nằm ở đây — nếu không, PM nhìn cột thấy tên mình
  // mà mục vẫn kêu "chưa giao" thì tưởng báo cáo sai.
  const soMacDinhPm = canGiao.filter((u) => String(u.ma_lt1 ?? '').trim()).length;
  const ghiChuPm = ghiChuPmDuAn(payload) + (soMacDinhPm
    ? `<p class="lead">${soMacDinhPm} yêu cầu đang để <code>ma_lt1 = ${esc(pm)}</code> — đó là giá trị mặc định màn hình BA điền lúc lên yêu cầu, không phải đã phân việc. Nếu thật sự PM tự làm thì bỏ qua, còn lại chọn người theo bảng dưới.</p>`
    : '');

  if (!nhanSu) {
    return {
      dem: canGiao.length,
      html: `${ghiChuPm}<p class="banner">Có <strong>${canGiao.length}</strong> yêu cầu ở DD chưa phân, nhưng payload không có khối <code>nhanSu</code> nên không chấm điểm được ứng viên. Payload sinh từ <code>4ai report</code> luôn có khối này (tools/lib/staffing.mjs) — thiếu nghĩa là payload viết tay hoặc từ bản cũ.</p>
${urTable(canGiao, [colStt, colNoiDung, colGiaiDoan, colHan, colMaLt1])}`,
    };
  }

  // Nguồn hỏng (không đọc được userinfo2, chưa gán bộ phận…) phải hiện ở đầu mục, không nấp
  // dưới từng UR: mất roster thì MỌI xếp hạng bên dưới đều yếu đi, không phải chỉ một cái.
  const hongNguon = nhanSu.thieuDuLieu?.length
    ? `<p class="banner">Nguồn nhân sự thiếu: ${nhanSu.thieuDuLieu.map(esc).join(' · ')}</p>` : '';

  const ketQua = goiYPhanCong(canGiao, nhanSu, trongSo, pm);
  const html = ghiChuPm + hongNguon + ketQua.map(({ ur, goiY }) => {
    const thieu = goiY.thieuDuLieu.length
      ? `<p class="banner">Thiếu dữ kiện: ${goiY.thieuDuLieu.map(esc).join(' · ')}. Xếp hạng bên dưới yếu đi tương ứng.</p>` : '';

    const dauRa = goiY.laBaoCaoDauRa
      ? `<p class="lead">Nhận diện là <strong>báo cáo đầu ra</strong> (${goiY.nhanDienTu === 'payload' ? 'payload khai rõ' : 'suy từ nội dung UR'}) — có áp tiêu chí 3.</p>`
      : '';

    const bang = goiY.ungVien.length
      ? `<div class="tw"><table><thead><tr><th>#</th><th>Ứng viên</th><th>Điểm</th><th>Độ tin cậy</th><th>Căn cứ</th></tr></thead><tbody>
${goiY.ungVien.map((c, i) => {
        const tc = DO_TIN_CAY[c.doTinCay] ?? DO_TIN_CAY['thap'];
        return `<tr>
  <td class="mono">${i + 1}</td>
  <td class="mono">${nhanUngVien(c)}</td>
  <td class="mono">${c.diem}</td>
  <td><span class="${tc.cls}">${tc.nhan}</span></td>
  <td>${c.lyDo.map(esc).join(' · ')}</td>
</tr>`;
      }).join('\n')}
</tbody></table></div>`
      : '<p class="empty">Không có ứng viên nào khớp dữ kiện đã nạp.</p>';

    return `<article class="phan-cong">
<h3>${esc(ur.fcode1 || String(ur.stt_rec).trim())} — ${escLink(ur.noi_dung ?? '')}</h3>
<p class="lead">Menu <code>${esc(ur.menu_id || '—')}</code>${ur.sysid ? ` · controller <code>${esc(ur.sysid)}</code>` : ''}${ur._phase ? ` · hạn ${fmtDate(ur._phase.ngay_ht)}` : ''}</p>
${dauRa}
${thieu}
${bang}
</article>`;
  }).join('\n');

  return { dem: canGiao.length, html };
}

/**
 * Hướng dẫn thực chiến áp cho các UR đang rà soát.
 *
 * Nguồn là kho `node_Playbook` — do người viết, không phải máy rút. Xuất xứ (`ma_da` của dự án
 * đã chạy thật cách làm này) và người kể (`nguonLt`) đứng ngay dưới tiêu đề: một cách làm không
 * biết đã chạy ở đâu thì lập trình viên không có cơ sở nào để tin.
 *
 * Khớp bằng `menu_id` phải NÓI RÕ là khớp yếu. `nbphyc.menu_id` là số hiệu BA gõ tay, không
 * phải khoá ngoại tới màn hình (đo được: 25 giá trị menu_id trên DVDKB_FBO, đúng 1 cái tồn tại
 * trong cây menu thật) — im lặng để nó trông ngang hàng với khớp `sysid` là mời người đọc tin
 * nhầm.
 */
function huongDanBlock(capHuongDan) {
  if (!capHuongDan?.length) {
    return { dem: 0, html: '<p class="empty">Chưa có hướng dẫn nào trong kho khớp với các yêu cầu này. Ghi cái đầu tiên bằng <code>4ai playbook add</code>.</p>' };
  }
  const html = capHuongDan.map(({ ur, huongDan }) => {
    const muc = huongDan.map((g) => {
      // Ba mức khớp, ba cách nói khác nhau. `chinh-ur` KHÔNG phải "kinh nghiệm dự án khác" mà
      // là cách làm chốt cho đúng yêu cầu này — với UR còn ở DD thì đó là chỉ dẫn để bắt tay
      // vào, không phải tư liệu tham khảo, nên nó đứng đầu và được nói thẳng.
      const neo = g._khop === 'chinh-ur'
        ? '<span class="hd-khop chinh">cách làm ghi cho chính yêu cầu này</span>'
        : g._khop === 'menu_id'
          ? `<span class="hd-khop yeu" title="menu_id là số hiệu BA ghi tay, không phải khoá ngoại tới màn hình">khớp yếu qua menu ${esc(g.menu_id ?? '')}</span>`
          : `<span class="hd-khop">khớp controller <code>${esc(g.sysid ?? '')}</code></span>`;
      const xuatXu = g._khop === 'chinh-ur'
        ? ''
        : ` · đã chạy ở <code>${esc(g.ma_da ?? '?')}</code>`;
      return `<article class="hd${g._khop === 'chinh-ur' ? ' hd-chinh' : ''}">
  <h4>${esc(g.tieuDe ?? '')}</h4>
  <p class="hd-meta">${neo}${xuatXu}${g.nguonLt ? ` · kinh nghiệm của <strong class="mono">${esc(g.nguonLt)}</strong>` : ''}${g.nhapBoi ? ` · ghi bởi <span class="mono">${esc(g.nhapBoi)}</span>` : ''}</p>
  ${g.boiCanh ? `<p class="hd-khi"><strong>Khi nào:</strong> ${escLink(g.boiCanh)}</p>` : ''}
  <div class="hd-lam"><strong>Cách làm</strong><p>${escLink(g.cachLam ?? '')}</p></div>
  ${g.canhBao ? `<p class="hd-canh"><strong>Cẩn thận:</strong> ${escLink(g.canhBao)}</p>` : ''}
</article>`;
    }).join('\n');
    return `<section class="hd-ur">
<h3>${esc(ur.fcode1 || String(ur.stt_rec).trim())}${ur._ma_da ? ` <span class="muted">${esc(ur._ma_da)}</span>` : ''} — ${esc(cutTo(ur.noi_dung, 120))}</h3>
${muc}
</section>`;
  }).join('\n');
  return { dem: capHuongDan.reduce((n, c) => n + c.huongDan.length, 0), html };
}

/**
 * Nội dung topic forum của UR ở DD.
 *
 * Rất nhiều UR chỉ ghi "update theo link forum: <url>" — đọc mỗi UR thì không có gì để phân
 * tích, yêu cầu thật nằm ở topic. Mở sẵn ra đây để PM khỏi phải rời báo cáo đi tra tay.
 *
 * Thu trong `<details>`: một topic có thể tới 22 bài / hơn 11 nghìn ký tự, bung hết ra sẽ đè
 * mất phần còn lại của báo cáo. Mặc định đóng, cần thì bấm mở.
 */
function forumBlock(urs) {
  const coForum = urs.filter((u) => u.trang_thai === 'DD' && u.forum?.length);
  if (!coForum.length) {
    return { dem: 0, html: '<p class="empty">Không có yêu cầu nào ở DD kèm link forum.fast.com.vn.</p>' };
  }
  const html = coForum.map((u) => {
    const topics = u.forum.map((t) => {
      const bai = (t.baiViet ?? []).map((b) => `<article class="fr-post">
  <p class="fr-meta"><strong>#${b.thu_tu}</strong> ${esc(b.nguoi_viet ?? '')}${b.ngay_viet ? ` · ${fmtDate(b.ngay_viet)}` : ''}</p>
  <p>${escLink(b.noi_dung ?? '')}</p>
</article>`).join('\n');
      return `<details class="fr-topic">
<summary>Topic <code>${t.topicId}</code> · ${(t.baiViet ?? []).length} bài — <a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">mở trên forum</a></summary>
${bai}
</details>`;
    }).join('\n');
    return `<article class="forum">
<h3>${esc(u.fcode1 || String(u.stt_rec).trim())} — ${escLink(u.noi_dung ?? '')}</h3>
${topics}
</article>`;
  }).join('\n');
  return { dem: coForum.length, html };
}

export function renderReport(payload, h) {
  const config = loadConfig();
  const { today, pm, phases, phasesCoUr, soPhaseAn, urs, quaHan, sapToi, chuaChot, congPm, chuaGiao,
    ngoaiTlksThieuCanCu } = summarize(payload, h);
  const urChuaChot = urs.filter((u) => u._chotDaHen === false);
  const deXuatKl = urs.filter((u) => u.deXuat?.trang_thai === 'KL');
  const coDdl = urs.filter((u) => u.ddl || u.ghiChuDdl);
  const lichChuaChot = phases.some((p) => p.lichChuaChot);

  const canhBaoLich = lichChuaChot
    ? `<p class="banner">Có hạn rơi vào năm mà lịch nghỉ <strong>chưa chốt</strong> trong <code>data/holidays-vn.json</code>. Số ngày làm việc còn lại là ước tính — đừng dùng để cam kết hạn với khách.</p>` : '';

  const hangHom = isWorkingDay(h, today)
    ? '' : `<p class="banner">Hôm nay <strong>không phải ngày làm việc</strong> theo lịch đã khai.</p>`;

  const phanCong = phanCongBlock(chuaGiao, payload, loadTrongSoPhanCong(), pm);
  const forum = forumBlock(urs);

  // Nhãn KPI: một danh từ viết hoa đầu câu, phần định lượng ("≤ 3 ngày LV", "DD/XN/TH") xuống
  // dòng phụ. Nhồi điều kiện vào chính cái nhãn thì con số to bên trên mất chỗ dựa — người đọc
  // phải giải mã "chờ cổng PM (DD)" trước khi biết số 0 đó nói về cái gì.
  const kpi = kpiRow([
    { n: quaHan.length, nhan: 'Quá hạn', muc: 'bad', phu: 'hạn giai đoạn đã trôi qua' },
    { n: sapToi.length, nhan: 'Sắp tới hạn', muc: 'warn', phu: `≤ ${h.leadWorkingDays} ngày LV` },
    { n: congPm.length, nhan: 'Chờ duyệt', muc: 'warn',
      phu: ['UR ở DD', phanCong.dem ? `${phanCong.dem} chưa giao LT` : ''].filter(Boolean).join(' · ') },
    { n: chuaChot.length, nhan: 'Chưa chốt hẹn', muc: 'warn', phu: 'giai đoạn còn UR tồn đọng' },
    { n: urs.length, nhan: 'UR đang theo dõi', muc: '',
      phu: ['DD/XN/TH', ngoaiTlksThieuCanCu.length ? `${ngoaiTlksThieuCanCu.length} ngoài TLKS thiếu căn cứ` : '']
        .filter(Boolean).join(' · ') },
  ]);

  const nong = [...quaHan, ...sapToi].sort((a, b) => a._soNgay - b._soNgay)[0] ?? null;
  const hero = heroLine(nong);

  const diemPha = phasesCoUr
    .map((p) => ({ label: p.giai_doan_da, soNgay: p.soNgay, muc: p.muc }))
    .sort((a, b) => a.soNgay - b.soNgay);
  const viz = vizRow(
    chartByPhase(urs, phasesCoUr),
    chartTimelineCompact(diemPha, today),
    'Yêu cầu theo giai đoạn (DD/XN/TH)', 'Hạn theo giai đoạn — hôm nay ở giữa');

  const action = actionList(xepViecCanLam({ quaHan, sapToi, congPm }, h.leadWorkingDays), { top: 6 });

  // Trang một dự án: cột đầu là GIAI ĐOẠN, không phải mã dự án — mã dự án đã nằm trên tiêu đề
  // trang, lặp lại nó ở mỗi dòng chỉ tốn một cột mà không thêm thông tin nào.
  const danhSach = section('toan-bo-ur', 'Toàn bộ yêu cầu đang theo dõi', '',
    danhSachUr(urs, { cotDau: { ten: 'Giai đoạn', get: (u) => u.giai_doan_da ?? '' } }), urs.length);

  const phaseTable = chuaChot.length ? `<div class="tw"><table><thead><tr><th>Giai đoạn</th><th>Hạn hiệu lực</th><th>Còn (ngày LV)</th><th>YC tồn đọng</th><th>Nội dung cần HT</th></tr></thead><tbody>
${chuaChot.map((p) => `<tr><td>${esc(p.giai_doan_da)}</td><td class="mono">${fmtDate(p.ngay_ht)}</td><td class="mono">${p.soNgay < 0 ? `<span class="qua-han">quá ${Math.abs(p.soNgay)}</span>` : p.soNgay}</td><td class="mono">${p.soUrTonDong}</td><td>${esc(p.noi_dung ?? '')}</td></tr>`).join('\n')}
</tbody></table></div>
<p class="lead">Đề xuất: đưa các yêu cầu chưa chốt được hạn trong những giai đoạn trên về trạng thái <code>TA</code>.</p>
${urTable(urChuaChot, [colStt, colNoiDung, colGiaiDoan, colTrangThai, colHan])}` : '<p class="empty">Không có giai đoạn nào vừa chưa chốt đã hẹn vừa còn yêu cầu tồn đọng (DD/XN/TH).</p>';

  const ddlBlock = coDdl.length ? coDdl.map((u) => {
    const { sql, err } = sqlCuaUr(u);
    const than = err
      ? `<p class="banner">Không sinh được SQL: ${esc(err)}</p>`
      : `<div class="sql"><div class="sql-chip"><span>SQL${u.ddl ? ' — sinh tự động' : ''} · chờ PM xác nhận</span><button class="sql-copy">Copy</button></div><pre>${highlightSql(sql)}</pre></div>`;
    return `<article class="ddl">
<h3>${esc(u.fcode1 || String(u.stt_rec).trim())} — ${escLink(u.noi_dung ?? '')}</h3>
${than}
</article>`;
  }).join('\n') : '<p class="empty">Không có yêu cầu nào nhắc tạo bảng hay thêm cột.</p>';

  const coLuong = urs.filter((u) => u.luongDuLieu);
  const luongBlock = coLuong.length ? coLuong.map((u) => {
    const ld = u.luongDuLieu;
    const d = ld.dich ?? {};
    const dichMo = [d.syscode && `mã <code>${esc(d.syscode)}</code>`, d.sysid && `controller <code>${esc(d.sysid)}</code>`,
      d.bang && `bảng <code>${esc(d.bang)}</code>`].filter(Boolean).join(' · ');
    // Prompt của UR này đã nằm ở mục `prompt-ky-thuat` phía trên, gộp cả kinh nghiệm thực
    // chiến — hiện lại ở đây thành hai hộp prompt cho cùng một UR, người đọc không biết dán
    // cái nào. Ở đây chỉ còn phần MÔ TẢ luồng.
    return `<article class="flow">
<h3>${esc(u.fcode1 || String(u.stt_rec).trim())} — ${escLink(u.noi_dung ?? '')}</h3>
<dl class="flow-dl">
  <dt>Nguồn</dt><dd>${(ld.nguon ?? []).map((n) => `<code>${esc(n)}</code>`).join(' + ') || '—'}</dd>
  <dt>Đích</dt><dd><strong>${esc(d.manHinh ?? '—')}</strong>${dichMo ? ` — ${dichMo}` : ''}</dd>
  ${ld.ghiChu ? `<dt>Ghi chú</dt><dd>${esc(ld.ghiChu)}</dd>` : ''}
</dl>
</article>`;
  }).join('\n') : '';

  /**
   * Một prompt cho mỗi UR có gợi ý kỹ thuật — gộp kinh nghiệm + luồng dữ liệu + việc cần làm.
   *
   * Đứng ĐẦU tab vì đây là thứ người sắp code lấy đi; ba mục bên dưới là bản đọc bằng mắt của
   * cùng nội dung đó. SQL script cố ý không vào prompt: nó là đầu ra xác định của
   * `tools/lib/ddl.mjs`, cho model đọc là mời nó viết lại mỗi lần một khác.
   */
  const promptBlock = (() => {
    const theoUr = new Map((payload.huongDan ?? []).map((c) => [String(c.ur?.stt_rec ?? '').trim(), c.huongDan]));
    const ungVien = urs.filter((u) => theoUr.has(String(u.stt_rec).trim()) || u.luongDuLieu || u.ddl || u.ghiChuDdl);
    if (!ungVien.length) {
      return { dem: 0, html: '<p class="empty">Chưa có UR nào trong phạm vi có gợi ý kỹ thuật để dựng prompt.</p>' };
    }
    const html = ungVien.map((u) => {
      const { prompt, err } = promptKyThuat(u, payload, {
        huongDan: theoUr.get(String(u.stt_rec).trim()) ?? [],
        coDdl: !!(u.ddl || u.ghiChuDdl),
      });
      if (err) return `<article class="flow"><h3>${esc(u.fcode1 || String(u.stt_rec).trim())}</h3><p class="banner">Không dựng được prompt: ${esc(err)}</p></article>`;
      return `<article class="flow">
<h3>${esc(u.fcode1 || String(u.stt_rec).trim())} — ${escLink(u.noi_dung ?? '')}</h3>
<div class="sql"><div class="sql-chip"><span>Prompt — dán vào Claude Code</span><button class="sql-copy">Copy</button></div><pre>${esc(prompt)}</pre></div>
</article>`;
    }).join('\n');
    return { dem: ungVien.length, html };
  })();

  const chiTiet = [
    section('qua-han', 'Quá hạn', 'Yêu cầu còn ở DD/XN/TH mà hạn giai đoạn đã trôi qua.',
      urTable(quaHan, [colStt, colNoiDung, colGiaiDoan, colTrangThai, colMaLt1, colHan, colConLai]), quaHan.length),
    section('sap-toi', 'Sắp tới hạn', `Còn ${h.leadWorkingDays} ngày làm việc hoặc ít hơn, đã trừ T7/CN và ngày lễ.`,
      urTable(sapToi, [colStt, colNoiDung, colGiaiDoan, colTrangThai, colMaLt1, colHan, colConLai]), sapToi.length),
    section('chua-chot', 'Giai đoạn chưa tick chốt đã hẹn', '', phaseTable, chuaChot.length),
    section('cong-pm', 'Chờ duyệt (UR ở DD)', 'Kiểm TLKS rồi quyết định XN / TA / KL. Đề xuất bên dưới chưa được thi hành.',
      urTable(congPm, [colStt, colNoiDung, colMaLt1, colHan, colTlks, colDeXuat]), congPm.length),
    section('phan-cong', 'Gợi ý người tiếp nhận (DD chưa giao)',
      'Xếp hạng theo: (1) đã làm menu đó trong dự án · (2) đang gánh ít UR sắp tới hạn · (3) báo cáo đầu ra thì ưu tiên người đóng góp nhiều UR đầu vào. Đây là ĐỀ XUẤT — PM chốt rồi mới giao.',
      phanCong.html, phanCong.dem),
    section('forum', 'Nội dung forum kèm theo (DD)',
      'UR chỉ ghi "update theo link forum" thì yêu cầu thật nằm ở topic, không nằm trong UR. Nội dung dưới đây lấy từ bản sao forum trong DB — đọc nó rồi mới kết luận phạm vi và giờ công.',
      forum.html, forum.dem),
    section('ngoai-tlks', 'Ngoài TLKS, chưa có căn cứ', 'Cần biên bản nghiệm thu, phụ lục hoặc email đính kèm ở cấp dự án. Chưa có thì đề xuất TA và tính thêm giờ công.',
      urTable(ngoaiTlksThieuCanCu, [colStt, colNoiDung, colGiaiDoan, colTrangThai]), ngoaiTlksThieuCanCu.length),
    section('de-xuat-kl', 'Đề xuất KL', 'Mỗi mục phải dẫn được node Capability verdict "khong" làm căn cứ.',
      urTable(deXuatKl, [colStt, colNoiDung, colDeXuat]), deXuatKl.length),
    section('bieu-do', 'Biểu đồ đầy đủ',
      soPhaseAn ? `Biểu đồ ở tab Tổng quan chỉ vẽ ${phasesCoUr.length} giai đoạn còn UR tồn đọng. Bản dưới đây vẽ đủ ${phases.length} giai đoạn, gồm ${soPhaseAn} giai đoạn không còn UR nào ở DD/XN/TH.` : '', `
<h3>Hạn theo giai đoạn</h3>
${chartDeadline(phases, today)}
<p class="lead">⚑ = giai đoạn chưa tick chốt đã hẹn.</p>
<h3>Yêu cầu theo giai đoạn và trạng thái</h3>
${chartByPhase(urs, phases)}
<p class="legend"><span class="key tt-dd"></span>DD <span class="key tt-xn"></span>XN <span class="key tt-th"></span>TH</p>
<h3>Trong / ngoài TLKS</h3>
${chartTlks(urs)}`),
  ].filter(Boolean).join('\n\n');

  const huongDan = huongDanBlock(payload.huongDan);
  const kyThuat = [
    section('prompt-ky-thuat', 'Prompt cho AI — gộp mọi gợi ý kỹ thuật của từng UR',
      'Mỗi UR một prompt, dán thẳng vào Claude Code: bối cảnh + kinh nghiệm đã có + luồng dữ liệu + việc cần làm. Ba mục bên dưới là cùng nội dung đó, bày ra để đọc bằng mắt. Script SQL CỐ Ý không nằm trong prompt — nó là đầu ra xác định, chạy nguyên văn chứ không đưa cho AI viết lại.',
      promptBlock.html, promptBlock.dem),
    section('huong-dan', 'Hướng dẫn từ kinh nghiệm thực chiến',
      'Cách làm do NGƯỜI viết, không phải máy rút. Gồm cả hướng dẫn ghi đích danh yêu cầu này lẫn kinh nghiệm mượn từ dự án khác qua controller/menu — mỗi mục nói rõ nó thuộc loại nào. Đây là kinh nghiệm chứ không phải quy định: đọc rồi tự quyết. Ghi thêm bằng `4ai playbook add`.',
      huongDan.html, huongDan.dem),
    coLuong.length ? section('luong-du-lieu', 'Luồng dữ liệu — tính năng dùng màn hình có sẵn',
      'Những yêu cầu này KHÔNG tạo bảng mới: chứng từ đích đã tồn tại trên FBO. Cái cần chốt là nguồn lấy ở đâu và ghi vào chứng từ nào.',
      luongBlock, coLuong.length) : '',
    section('ddl', 'Gợi ý tạo bảng / thêm cột', 'Script SQL đầy đủ cho lập trình viên — không tự chạy từ báo cáo này.',
      ddlBlock, coDdl.length),
  ].filter(Boolean).join('\n\n');

  const title = `Rà soát ${payload.ma_da}${payload.ten_ngan ? ' — ' + payload.ten_ngan : ''} · ${fmtDate(today)}`;
  // Trang dự án và trang tổng nằm cùng cấp trong thư mục ngày → lùi một cấp là tới nhau.
  const metaLine = `<a class="back" href="../${THU_MUC_TONG}/tong.html">← Tổng quan</a> · <code>${esc(payload.ma_da)}</code>${payload.ma_pbsp ? ` · <code>${esc(payload.ma_pbsp)}</code>` : ''} · LTQL ${esc(payload.pm ?? config.pm.maNv)} · vai PM kết thúc ở HT.`;
  return dashboardPage({
    title, metaLine,
    canhBao: [canhBaoLich, hangHom].filter(Boolean).join('\n'),
    kpi, hero, viz, action, danhSach,
    tabs: [
      { id: 'tq', nhan: 'Tổng quan' },
      { id: 'ct', nhan: 'Chi tiết đầy đủ', dem: quaHan.length + sapToi.length + congPm.length, html: chiTiet },
      { id: 'kt', nhan: 'Gợi ý kỹ thuật', dem: promptBlock.dem + coDdl.length + coLuong.length + huongDan.dem, html: kyThuat },
    ],
  });
}

// ---------------------------------------------------------------- dựng: tổng quan nhiều dự án

/**
 * Vì sao dự án này mang nhãn sức khoẻ đó — suy NGƯỢC từ đúng biểu thức trong summarize().
 *
 * Không có dòng này thì thẻ tự mâu thuẫn: HUM và PSL_DKVN hiện "Cần chú ý" bên cạnh ba số 0
 * (quá hạn / sắp tới / chờ duyệt), vì lý do thật — giai đoạn chưa tick chốt đã hẹn — không
 * nằm trong ba con số đang hiện. Người đọc kết luận báo cáo sai, chứ không kết luận là mình
 * chưa nhìn thấy đủ.
 */
function lyDoSucKhoe(s) {
  if (s.health === 'khan-cap') return `${s.quaHan.length} UR đã quá hạn`;
  if (s.health === 'on') return 'không có UR gấp, hạn đều đã chốt';
  const ly = [];
  if (s.sapToi.length) ly.push(`${s.sapToi.length} UR sắp tới hạn`);
  if (s.chuaChot.length) ly.push(`${s.chuaChot.length} giai đoạn chưa chốt hẹn`);
  return ly.join(' · ');
}

function projectCard(s, payload) {
  const urgent = s.ganNhat ? `<p class="card-urgent ${s.ganNhat._muc}">${esc(s.ganNhat.fcode1 || s.ganNhat.stt_rec)} — ${s.ganNhat._soNgay < 0 ? `quá ${Math.abs(s.ganNhat._soNgay)} ngày LV` : `còn ${s.ganNhat._soNgay} ngày LV`}</p>`
    : '<p class="card-urgent ok">Không có hạn khẩn cấp</p>';
  return `<a class="pcard ${s.health}" href="../${esc(payload.ma_da)}/review.html">
  <div class="pcard-head">
    <span class="dot ${s.health}"></span>
    <b>${esc(payload.ma_da)}</b>
    <span class="pcard-health">${HEALTH_LABEL[s.health]}</span>
  </div>
  <p class="pcard-name">${esc(payload.ten_ngan ?? payload.ma_da)}</p>
  <p class="pcard-why">${esc(lyDoSucKhoe(s))}</p>
  <div class="pcard-counts">
    <span class="bad">${s.quaHan.length} quá hạn</span>
    <span class="warn">${s.sapToi.length} sắp tới</span>
    <span class="warn">${s.chuaChot.length} chưa chốt hẹn</span>
    <span>${s.congPm.length} chờ duyệt</span>
    <span class="calm">${s.urs.length} UR</span>
  </div>
  ${urgent}
</a>`;
}

/**
 * @param {Array<{payload: object, summary: object}>} items dự án hợp lệ
 * @param {Array<{ma_da: string|null, errors: string[]}>} skipped dự án bị bỏ qua vì payload lỗi
 */
export function renderPortfolio(items, skipped, warned, meta, h) {
  const config = loadConfig();
  const rong = meta.rong ?? [];
  const ghiChuRong = rong.length
    ? `<p class="lead rong-note">Không đưa vào báo cáo ${rong.length} dự án vì không còn yêu cầu nào ở DD/XN/TH: ${rong.map((m) => `<code>${esc(m)}</code>`).join(' ')}. Nguồn chi tiết là <code>nbphyc</code> lọc ba trạng thái đó — dự án hết việc trong đó thì không còn gì để rà soát.</p>`
    : '';
  const allQuaHan = items.flatMap(({ payload, summary }) =>
    summary.quaHan.map((u) => ({ ...u, _ma_da: payload.ma_da })));
  const allSapToi = items.flatMap(({ payload, summary }) =>
    summary.sapToi.map((u) => ({ ...u, _ma_da: payload.ma_da })));

  // UR ở DD chưa giao lập trình — gộp toàn danh mục, kèm ứng viên số 1 nếu dự án đó có
  // khối `nhanSu`. Đây là trang PM mở đầu tiên mỗi sáng nên việc "chưa giao ai" phải nổi.
  const trongSo = loadTrongSoPhanCong();
  const allChuaGiao = items.flatMap(({ payload, summary }) => {
    const goiYTheoUr = payload.nhanSu
      ? new Map(goiYPhanCong(summary.chuaGiao, payload.nhanSu, trongSo, summary.pm)
        .map(({ ur, goiY }) => [ur.stt_rec, goiY]))
      : null;
    return summary.chuaGiao.map((u) => ({
      ...u,
      _ma_da: payload.ma_da,
      _goiY: goiYTheoUr?.get(u.stt_rec) ?? null,
    }));
  });

  // MỌI UR trong phạm vi, không chỉ phần gấp. KPI đếm được "1 UR" mà trang không có chỗ nào
  // chỉ ra UR đó là gì thì con số ấy vô dụng — xem section 'toan-bo-ur'.
  const allUr = items.flatMap(({ payload, summary }) =>
    summary.urs.map((u) => ({ ...u, _ma_da: payload.ma_da })));

  const tongQuaHan = allQuaHan.length, tongSapToi = allSapToi.length;
  const tongCongPm = items.reduce((n, { summary }) => n + summary.congPm.length, 0);
  const tongChuaGiao = allChuaGiao.length;
  const tongUr = allUr.length;
  const soKhanCap = items.filter(({ summary }) => summary.health === 'khan-cap').length;

  const colGoiY = { ten: 'Gợi ý tiếp nhận', get: (u) => {
    if (!u._goiY) return '<span class="muted">chưa nạp <code>nhanSu</code></span>';
    const top = u._goiY.ungVien[0];
    if (!top) return '<span class="muted">không có ứng viên khớp</span>';
    const tc = DO_TIN_CAY[top.doTinCay] ?? DO_TIN_CAY['thap'];
    const them = u._goiY.ungVien.length > 1
      ? ` <span class="muted">(rồi ${u._goiY.ungVien.slice(1).map((c) => esc(c.ma_lt1)).join(', ')})</span>` : '';
    const ten = top.ten ? ` <span class="muted">${esc(top.ten)}</span>` : '';
    return `<strong class="mono">${esc(top.ma_lt1)}</strong>${ten} <span class="${tc.cls}">${tc.nhan}</span>${them}`;
  } };

  // Ứng viên lấy từ đâu, và thiếu gì. Không có dòng này thì một bảng xếp hạng rỗng trông y
  // hệt một bảng xếp hạng "cả phòng đều bận" — hai chuyện hoàn toàn khác nhau.
  const ns = meta.nhanSu ?? items[0]?.payload?.nhanSu;
  const ghiChuNhanSu = ns
    ? `<p class="lead">Ứng viên lấy từ nhân sự đang làm việc của bộ phận <code>${esc(ns.boPhan || '?')}</code> (<code>userinfo2.status=1</code>, <code>ma_bo_phan=${esc(ns.boPhan || '?')}</code>): ${ns.roster?.length ?? 0} người${ns.pm?.length ? `, trong đó ${ns.pm.map((m) => `<code>${esc(m)}</code>`).join(', ')} đang đứng tên lập trình quản lý` : ''}.</p>`
      + (ns.thieuDuLieu?.length
        ? `<p class="banner">Nguồn nhân sự thiếu: ${ns.thieuDuLieu.map(esc).join(' · ')}</p>` : '')
    : '';

  // Dự án mà LTQL trên nbdmda đã off/chuyển phòng — PM tính là cấp phó phòng. Gom một chỗ
  // để PM biết ngay những dự án nào đang không có người đứng tên thật sự.
  const ppThayThe = items.filter(({ payload: p }) => p.pmNguon === 'pp-thay-the');
  const ghiChuPpThayThe = ppThayThe.length
    ? `<p class="banner">${ppThayThe.length} dự án có lập trình quản lý đã off hoặc chuyển bộ phận — PM tính là cấp phó phòng: ${ppThayThe.map(({ payload: p }) => `<code>${esc(p.ma_da)}</code> (${(p.pmNgoaiPhong ?? []).map(esc).join(', ') || '?'} → ${esc(p.pm)})`).join(', ')}.</p>`
    : '';

  // Gợi ý của những lần chạy TRƯỚC có khớp với người PM thật sự giao không. Dữ liệu quan sát
  // từ `nbphyc`, không ai phải xác nhận — xem tools/lib/recommendation-log.mjs.
  const hq = meta.hieuQuaGoiY;
  const soanHieuQua = () => {
    if (!hq || !hq.soGoiY) return '';
    const dong = [];
    if (hq.tiLeTrung === null) {
      dong.push(`<p class="lead">Đã ghi nhận ${hq.soGoiY} lượt gợi ý, chưa lượt nào được giao — chưa đo được độ chính xác.</p>`);
    } else {
      dong.push(`<p class="lead">Trong ${hq.soDaQuyet} UR đã giao sau khi có gợi ý, PM chọn đúng người đứng đầu <strong>${hq.soTrung}</strong> lần — <strong>${hq.tiLeTrung}%</strong>.${hq.soChuaGiao ? ` Còn ${hq.soChuaGiao} UR chưa giao, không tính vào tỉ lệ.` : ''}</p>`);
    }
    if (hq.thayThe?.length) {
      dong.push(`<p class="lead">Người PM hay chọn thay: ${hq.thayThe.slice(0, 5).map((t) => `<code>${esc(t.ma_lt1)}</code> ${t.soLan} lần${t.trongGoiY ? ` (${t.trongGoiY} lần có trong danh sách gợi ý nhưng không đứng đầu)` : ' (không nằm trong gợi ý)'}`).join(' · ')}.</p>`);
    }
    dong.push('<p class="lead muted">Lý do PM đổi người không được ghi nhận — dữ liệu này chỉ quan sát <code>nbphyc.ma_lt1</code>, không suy đoán động cơ.</p>');
    return section('hieu-qua-goi-y', 'Gợi ý có trúng không',
      'Đối chiếu gợi ý các lần chạy trước với người PM thật sự giao trên QLDA.',
      dong.join('\n'), hq.soDaQuyet);
  };

  const boBoQua = skipped.length ? `<p class="banner">Bỏ qua ${skipped.length} dự án do payload lỗi nặng: ${skipped.map((s) => `<strong>${esc(s.ma_da ?? '?')}</strong> (${esc(s.errors.join('; '))})`).join(', ')}.</p>` : '';

  const canhBaoChatLuong = warned.length ? `<div class="banner">
  <strong>${warned.length} dự án có gợi ý DDL chưa đúng chuẩn</strong> — phần hạn/deadline vẫn đúng và vẫn hiện đầy đủ bên dưới, nhưng script SQL cần sửa trước khi giao lập trình viên:
  <ul>${warned.map((w) => `<li><code>${esc(w.ma_da)}</code> — ${w.errors.map((e) => esc(e)).join('<br>')}</li>`).join('')}</ul>
</div>` : '';

  const allCongPm = items.flatMap(({ payload, summary }) =>
    summary.congPm.map((u) => ({ ...u, _ma_da: payload.ma_da })));

  // Cùng cách đặt nhãn với trang dự án — xem chú thích ở renderReport(). Hai trang lệch chữ
  // thì PM phải học hai bộ từ vựng cho cùng một con số.
  const kpi = kpiRow([
    { n: soKhanCap, nhan: 'Dự án cháy', muc: 'bad', phu: soKhanCap ? 'có UR quá hạn' : 'không có' },
    { n: tongQuaHan, nhan: 'Quá hạn', muc: 'bad', phu: 'UR toàn danh mục' },
    { n: tongSapToi, nhan: 'Sắp tới hạn', muc: 'warn', phu: `≤ ${h.leadWorkingDays} ngày LV` },
    { n: tongCongPm, nhan: 'Chờ duyệt', muc: 'warn',
      phu: ['UR ở DD', tongChuaGiao ? `${tongChuaGiao} chưa giao LT` : ''].filter(Boolean).join(' · ') },
    { n: tongUr, nhan: 'UR đang theo dõi', muc: '', phu: `DD/XN/TH · ${items.length} dự án` },
  ]);

  const hrefDuAn = (r) => {
    const it = items.find(({ payload }) => payload.ma_da === r._ma_da);
    return it ? `../${esc(it.payload.ma_da)}/review.html` : null;
  };
  const nong = [...allQuaHan, ...allSapToi].sort((a, b) => a._soNgay - b._soNgay)[0] ?? null;
  const hero = heroLine(nong, { href: nong ? hrefDuAn(nong) : null });

  const diem = [...allQuaHan, ...allSapToi]
    .sort((a, b) => a._soNgay - b._soNgay)
    .map((u) => ({ label: `${u._ma_da} · ${u.fcode1 || u.stt_rec}`, soNgay: u._soNgay, muc: u._muc }));
  const viz = vizRow(
    chartPriorityByProject(items),
    chartTimelineCompact(diem, meta.ngay_chay),
    'Ưu tiên theo dự án', 'Timeline hạn — hôm nay ở giữa');

  const viecCanLam = xepViecCanLam(
    { quaHan: allQuaHan, sapToi: allSapToi, congPm: allCongPm }, h.leadWorkingDays);
  const action = actionList(viecCanLam, { top: 7, hrefOf: hrefDuAn });
  const danhSach = section('toan-bo-ur', 'Toàn bộ yêu cầu đang theo dõi', '',
    danhSachUr(allUr, { hrefOf: hrefDuAn }), tongUr);

  // `meta.huongDan` gom từ MỌI dự án — dựng ở review-report.mjs, xem huongDanChoDataset().
  const huongDanTong = huongDanBlock((meta.huongDan ?? []).map((c) => ({
    ...c,
    ur: { ...c.ur, _ma_da: c.ur._ma_da ?? c.ur.ma_da },
  })));

  const sorted = [...items].sort((a, b) => {
    const rank = { 'khan-cap': 0, 'can-chu-y': 1, 'on': 2 };
    return rank[a.summary.health] - rank[b.summary.health];
  });
  const grid = `<div class="pgrid">${sorted.map(({ payload, summary }) => projectCard(summary, payload)).join('\n')}</div>`;

  const chiTiet = [
    section('theo-du-an', 'Theo dự án', 'Bấm vào thẻ để xem báo cáo chi tiết của dự án đó.',
      grid + ghiChuRong),
    section('quan-trong-nhat', 'Danh mục — quá hạn', 'Gộp mọi dự án, ưu tiên xử lý trước.',
      urTable(allQuaHan.sort((a, b) => a._soNgay - b._soNgay), [colDuAn, colStt, colNoiDung, colGiaiDoan, colTrangThai, colMaLt1, colHan, colConLai]), tongQuaHan),
    section('sap-toi-toan-danh-muc', 'Danh mục — sắp tới hạn', '',
      urTable(allSapToi.sort((a, b) => a._soNgay - b._soNgay), [colDuAn, colStt, colNoiDung, colGiaiDoan, colTrangThai, colMaLt1, colHan, colConLai]), tongSapToi),
    section('chua-giao', 'Chưa giao lập trình (DD)',
      'Yêu cầu đã duyệt nhưng chưa có lập trình. Ứng viên xếp theo: đã làm menu đó · đang gánh ít UR sắp tới hạn · báo cáo đầu ra thì ưu tiên người làm nhiều UR đầu vào. ĐỀ XUẤT — PM chốt rồi mới giao.',
      ghiChuNhanSu + ghiChuPpThayThe
      + urTable(allChuaGiao.sort((a, b) => (a._soNgay ?? 99) - (b._soNgay ?? 99)),
        [colDuAn, colStt, colNoiDung, colHan, colConLai, colGoiY]), tongChuaGiao),
    soanHieuQua(),
    // Gắn `_ma_da` vào UR để khối hướng dẫn nói được cách làm này đang áp cho dự án nào —
    // trên trang tổng thì mã UR không thôi chưa đủ để định vị.
    section('huong-dan', 'Hướng dẫn từ kinh nghiệm thực chiến',
      'Cách làm do NGƯỜI viết. Gồm cả hướng dẫn ghi đích danh một yêu cầu lẫn kinh nghiệm mượn từ dự án khác qua controller/menu — mỗi mục nói rõ nó thuộc loại nào. Ghi thêm bằng `4ai playbook add`.',
      huongDanTong.html, huongDanTong.dem),
  ].filter(Boolean).join('\n\n');

  const title = `Tổng quan rà soát PM · ${fmtDate(meta.ngay_chay)}`;
  const metaLine = `LTQL <code>${esc(meta.pm ?? config.pm.maNv)}</code> · ${items.length} dự án còn việc${skipped.length ? ` · ${skipped.length} bị bỏ qua` : ''}${rong.length ? ` · ${rong.length} dự án rỗng` : ''} · nguồn <code>nbphyc</code> DD/XN/TH.`;
  return dashboardPage({
    title, metaLine,
    canhBao: [boBoQua, canhBaoChatLuong].filter(Boolean).join('\n'),
    kpi, hero, viz, action, danhSach,
    tabs: [
      { id: 'tq', nhan: 'Tổng quan' },
      { id: 'ct', nhan: 'Chi tiết đầy đủ', dem: tongQuaHan + tongSapToi + tongChuaGiao, html: chiTiet },
    ],
  });
}

// CSS sống ở tools/templates/report/report.css — export để caller/test và injectCss (performance) dùng.
export const CSS = loadTemplate('report.css');

// ---------------------------------------------------------------- xây artifact

/**
 * Đọc payload một dự án → trả mô tả file. KHÔNG ghi đĩa.
 * @returns {{artifact: {relPath, content}|null, errors: string[]}}
 */
export function buildReportArtifact(payload, hub = HUB, opts = {}) {
  // ignoreQuality: lần sinh tự động từ dataset (không có deXuat/nhanSu) — quality không
  // được chặn HTML; trang tổng quan vốn đã chỉ skip khi fatal.
  const { fatal, quality } = validatePayloadDetailed(payload);
  const errors = opts.ignoreQuality ? fatal : [...fatal, ...quality];
  if (errors.length) return { artifact: null, errors };
  const h = loadHolidays(hub);
  const config = loadConfig(hub);
  const ngay = String(payload.ngay_chay).slice(0, 10);
  return {
    artifact: {
      relPath: duongDanDuAn(ngay, payload.ma_da),
      content: renderReport({ ...payload, pm: payload.pm ?? config.pm.maNv }, h),
    },
    errors: [],
  };
}

/**
 * Đọc payload tổng quan { kind:"portfolio", ngay_chay, pm, projects:[...] } → trả mô tả file.
 * Dự án nào payload lỗi thì BỊ BỎ QUA (không chặn cả trang) nhưng hiện rõ trong banner —
 * không lặng lẽ mất một dự án ra khỏi tổng quan.
 * @returns {{artifact: {relPath, content}|null, errors: string[]}}
 */
export function buildPortfolioArtifact(payload, hub = HUB) {
  const topErrors = validatePortfolioPayload(payload);
  if (topErrors.length) return { artifact: null, errors: topErrors };

  const h = loadHolidays(hub);
  const config = loadConfig(hub);
  const items = [];
  const skipped = [];
  const warned = [];
  // Danh sách dự án SUY RA TỪ CHI TIẾT: chỉ dự án còn UR ở DD/XN/TH mới vào báo cáo.
  // Dự án hết việc trong ba trạng thái đó không phải "dự án đang theo dõi" — đưa vào chỉ
  // làm loãng KPI và biểu đồ. Vẫn liệt kê tên ở cuối để không ai tưởng bị mất dự án.
  const rong = [];
  for (const projRaw of payload.projects) {
    // `nhanSu` khai một lần ở cấp portfolio (roster là của cả phòng, không phải của dự án).
    // Rót xuống từng dự án ở đây để phần dựng bên dưới chỉ cần biết `payload.nhanSu`.
    const keThua = payload.nhanSu && projRaw && !projRaw.nhanSu;
    const proj = keThua ? { ...projRaw, nhanSu: payload.nhanSu } : projRaw;
    const { fatal, quality } = validatePayloadDetailed(proj);
    if (fatal.length) { skipped.push({ ma_da: proj?.ma_da ?? null, errors: fatal }); continue; }
    const summary = summarize(proj, h);
    if (!summary.urs.length) { rong.push(proj.ma_da); continue; }
    if (quality.length) warned.push({ ma_da: proj.ma_da, errors: quality });
    items.push({ payload: proj, summary });
  }
  if (!items.length) {
    return { artifact: null, errors: [
      rong.length
        ? `không dự án nào còn yêu cầu ở DD/XN/TH (${rong.length} dự án rỗng: ${rong.join(', ')}) — không có gì để rà soát`
        : 'không có dự án nào hợp lệ trong `projects`',
      ...skipped.flatMap((s) => s.errors)] };
  }

  const ngay = String(payload.ngay_chay).slice(0, 10);
  return {
    artifact: {
      relPath: duongDanTong(ngay),
      content: renderPortfolio(items, skipped, warned,
        { ngay_chay: ngay, pm: payload.pm ?? config.pm.maNv, rong, nhanSu: payload.nhanSu,
          hieuQuaGoiY: payload.hieuQuaGoiY, huongDan: payload.huongDan }, h),
    },
    errors: [],
  };
}
