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
import { HUB, readJson } from './assets.mjs';

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

export const fmtDate = (iso) => {
  const s = String(iso ?? '').slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
};

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
    if (u.ddl) {
      const { err } = sqlCuaUr(u);
      if (err) quality.push(`${nhan}: \`ddl\` sai spec — ${err}`);
    } else if (u.ghiChuDdl && !DDL_RE.test(u.ghiChuDdl)) {
      quality.push(`${nhan}: \`ghiChuDdl\` không chứa câu DDL nào — gợi ý tạo bảng/thêm cột PHẢI là script SQL chạy được. Tốt hơn: dùng \`ddl\` có cấu trúc để bộ sinh tự viết SQL (tools/lib/ddl.mjs). Xem skill fbo-new-table-proposal.`);
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
function enrich(payload, h) {
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
    };
  });
  return { today, phases: [...byPhase.values()], urs };
}

/** Tóm tắt một dự án dùng cho cả trang riêng lẫn thẻ trong trang tổng quan. */
function summarize(payload, h) {
  const { today, phases, urs } = enrich(payload, h);
  const quaHan = urs.filter((u) => u._muc === 'qua-han');
  const sapToi = urs.filter((u) => u._muc === 'sap-toi');
  const chuaChot = phases.filter((p) => !p.xac_nhan_da_hen_yn);
  const congPm = urs.filter((u) => u.trang_thai === 'DD');
  const ngoaiTlksThieuCanCu = urs.filter((u) => !u.tlks_yn && !u.canCu);
  const health = quaHan.length ? 'khan-cap' : sapToi.length || chuaChot.length ? 'can-chu-y' : 'on';
  const ganNhat = [...quaHan, ...sapToi].sort((a, b) => (a._soNgay ?? 0) - (b._soNgay ?? 0))[0] ?? null;
  return { today, phases, urs, quaHan, sapToi, chuaChot, congPm, ngoaiTlksThieuCanCu, health, ganNhat };
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
  return `<table><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table>`;
}

const colStt = { ten: 'UR', cls: 'mono', get: (u) => esc(u.fcode1 || String(u.stt_rec).trim()) };
const colNoiDung = { ten: 'Nội dung', get: (u) => esc(u.noi_dung ?? '') };
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
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>${esc(title)}</h1>
  <p class="meta">${metaLine}</p>
</header>
<main>
${body}
</main>
<footer>
  <p>Sinh bởi <code>node tools/4ai.mjs report</code>. Mọi đề xuất trạng thái ở đây <strong>chưa được thi hành</strong> — chỉ chạy sau khi PM xác nhận.</p>
</footer>
</body>
</html>`;
}

// ---------------------------------------------------------------- dựng: một dự án

export function renderReport(payload, h) {
  const config = loadConfig();
  const { today, phases, urs, quaHan, sapToi, chuaChot, congPm, ngoaiTlksThieuCanCu } = summarize(payload, h);
  const urChuaChot = urs.filter((u) => u._chotDaHen === false);
  const deXuatKl = urs.filter((u) => u.deXuat?.trang_thai === 'KL');
  const coDdl = urs.filter((u) => u.ddl || u.ghiChuDdl);
  const lichChuaChot = phases.some((p) => p.lichChuaChot);

  const canhBaoLich = lichChuaChot
    ? `<p class="banner">Có hạn rơi vào năm mà lịch nghỉ <strong>chưa chốt</strong> trong <code>data/holidays-vn.json</code>. Số ngày làm việc còn lại là ước tính — đừng dùng để cam kết hạn với khách.</p>` : '';

  const hangHom = isWorkingDay(h, today)
    ? '' : `<p class="banner">Hôm nay <strong>không phải ngày làm việc</strong> theo lịch đã khai.</p>`;

  const tomTat = `<div class="cards">
  <div class="card ${quaHan.length ? 'bad' : ''}"><b>${quaHan.length}</b><span>quá hạn</span></div>
  <div class="card ${sapToi.length ? 'warn' : ''}"><b>${sapToi.length}</b><span>sắp tới hạn (≤ ${h.leadWorkingDays} ngày LV)</span></div>
  <div class="card ${chuaChot.length ? 'warn' : ''}"><b>${chuaChot.length}</b><span>giai đoạn chưa chốt hẹn</span></div>
  <div class="card"><b>${congPm.length}</b><span>chờ cổng PM (DD)</span></div>
  <div class="card ${ngoaiTlksThieuCanCu.length ? 'warn' : ''}"><b>${ngoaiTlksThieuCanCu.length}</b><span>ngoài TLKS, chưa có căn cứ</span></div>
  <div class="card"><b>${urs.length}</b><span>yêu cầu trong phạm vi</span></div>
</div>`;

  const phaseTable = chuaChot.length ? `<table><thead><tr><th>Giai đoạn</th><th>Hạn hiệu lực</th><th>Còn (ngày LV)</th><th>Nội dung cần HT</th></tr></thead><tbody>
${chuaChot.map((p) => `<tr><td>${esc(p.giai_doan_da)}</td><td class="mono">${fmtDate(p.ngay_ht)}</td><td class="mono">${p.soNgay < 0 ? `<span class="qua-han">quá ${Math.abs(p.soNgay)}</span>` : p.soNgay}</td><td>${esc(p.noi_dung ?? '')}</td></tr>`).join('\n')}
</tbody></table>
<p class="lead">Đề xuất: đưa các yêu cầu chưa chốt được hạn trong những giai đoạn trên về trạng thái <code>TA</code>.</p>
${urTable(urChuaChot, [colStt, colNoiDung, colGiaiDoan, colTrangThai, colHan])}` : '<p class="empty">Mọi giai đoạn có hạn đều đã tick chốt đã hẹn.</p>';

  const ddlBlock = coDdl.length ? coDdl.map((u) => {
    const { sql, err } = sqlCuaUr(u);
    const than = err
      ? `<p class="banner">Không sinh được SQL: ${esc(err)}</p>`
      : `<div class="sql"><span class="sql-chip">SQL${u.ddl ? ' — sinh tự động' : ''} · chờ PM xác nhận</span><pre>${highlightSql(sql)}</pre></div>`;
    return `<article class="ddl">
<h3>${esc(u.fcode1 || String(u.stt_rec).trim())} — ${esc(u.noi_dung ?? '')}</h3>
${than}
</article>`;
  }).join('\n') : '<p class="empty">Không có yêu cầu nào nhắc tạo bảng hay thêm cột.</p>';

  const coLuong = urs.filter((u) => u.luongDuLieu);
  const luongBlock = coLuong.length ? coLuong.map((u) => {
    const ld = u.luongDuLieu;
    const d = ld.dich ?? {};
    const dichMo = [d.syscode && `mã <code>${esc(d.syscode)}</code>`, d.sysid && `controller <code>${esc(d.sysid)}</code>`,
      d.bang && `bảng <code>${esc(d.bang)}</code>`].filter(Boolean).join(' · ');
    return `<article class="flow">
<h3>${esc(u.fcode1 || String(u.stt_rec).trim())} — ${esc(u.noi_dung ?? '')}</h3>
<dl class="flow-dl">
  <dt>Nguồn</dt><dd>${(ld.nguon ?? []).map((n) => `<code>${esc(n)}</code>`).join(' + ') || '—'}</dd>
  <dt>Đích</dt><dd><strong>${esc(d.manHinh ?? '—')}</strong>${dichMo ? ` — ${dichMo}` : ''}</dd>
  ${ld.ghiChu ? `<dt>Ghi chú</dt><dd>${esc(ld.ghiChu)}</dd>` : ''}
</dl>
</article>`;
  }).join('\n') : '';

  const body = [
    canhBaoLich,
    hangHom,
    tomTat,
    section('qua-han', 'Quá hạn', 'Yêu cầu còn ở DD/XN/TH mà hạn giai đoạn đã trôi qua.',
      urTable(quaHan, [colStt, colNoiDung, colGiaiDoan, colTrangThai, colHan, colConLai]), quaHan.length),
    section('sap-toi', 'Sắp tới hạn', `Còn ${h.leadWorkingDays} ngày làm việc hoặc ít hơn, đã trừ T7/CN và ngày lễ.`,
      urTable(sapToi, [colStt, colNoiDung, colGiaiDoan, colTrangThai, colHan, colConLai]), sapToi.length),
    section('chua-chot', 'Giai đoạn chưa tick chốt đã hẹn', '', phaseTable, chuaChot.length),
    section('cong-pm', 'Chờ cổng PM (DD)', 'Kiểm TLKS rồi quyết định XN / TA / KL. Đề xuất bên dưới chưa được thi hành.',
      urTable(congPm, [colStt, colNoiDung, colHan, colTlks, colDeXuat]), congPm.length),
    section('ngoai-tlks', 'Ngoài TLKS, chưa có căn cứ', 'Cần biên bản nghiệm thu, phụ lục hoặc email đính kèm ở cấp dự án. Chưa có thì đề xuất TA và tính thêm giờ công.',
      urTable(ngoaiTlksThieuCanCu, [colStt, colNoiDung, colGiaiDoan, colTrangThai]), ngoaiTlksThieuCanCu.length),
    section('de-xuat-kl', 'Đề xuất KL', 'Mỗi mục phải dẫn được node Capability verdict "khong" làm căn cứ.',
      urTable(deXuatKl, [colStt, colNoiDung, colDeXuat]), deXuatKl.length),
    coLuong.length ? section('luong-du-lieu', 'Luồng dữ liệu — tính năng dùng màn hình có sẵn',
      'Những yêu cầu này KHÔNG tạo bảng mới: chứng từ đích đã tồn tại trên FBO. Cái cần chốt là nguồn lấy ở đâu và ghi vào chứng từ nào.',
      luongBlock, coLuong.length) : '',
    section('ddl', 'Gợi ý tạo bảng / thêm cột', 'Script SQL đầy đủ cho lập trình viên — không tự chạy từ báo cáo này.',
      ddlBlock, coDdl.length),
    section('bieu-do', 'Biểu đồ', '', `
<h3>Hạn theo giai đoạn</h3>
${chartDeadline(phases, today)}
<p class="lead">⚑ = giai đoạn chưa tick chốt đã hẹn.</p>
<h3>Yêu cầu theo giai đoạn và trạng thái</h3>
${chartByPhase(urs, phases)}
<p class="legend"><span class="key tt-dd"></span>DD <span class="key tt-xn"></span>XN <span class="key tt-th"></span>TH</p>
<h3>Trong / ngoài TLKS</h3>
${chartTlks(urs)}`),
  ].filter(Boolean).join('\n\n');

  const title = `Rà soát ${payload.ma_da}${payload.ten_ngan ? ' — ' + payload.ten_ngan : ''} · ${fmtDate(today)}`;
  const metaLine = `Dự án <code>${esc(payload.ma_da)}</code>${payload.ma_pbsp ? ` · phiên bản <code>${esc(payload.ma_pbsp)}</code>` : ''} · phạm vi: LTQL ${esc(payload.pm ?? config.pm.maNv)}, trạng thái DD/XN/TH · vai PM kết thúc ở HT. · <a href="../../_portfolio/${esc(payload.ngay_chay)}.html">← tổng quan mọi dự án</a>`;
  return page(title, metaLine, body);
}

// ---------------------------------------------------------------- dựng: tổng quan nhiều dự án

function projectCard(s, payload) {
  const urgent = s.ganNhat ? `<p class="card-urgent ${s.ganNhat._muc}">${esc(s.ganNhat.fcode1 || s.ganNhat.stt_rec)} — ${s.ganNhat._soNgay < 0 ? `quá ${Math.abs(s.ganNhat._soNgay)} ngày LV` : `còn ${s.ganNhat._soNgay} ngày LV`}</p>`
    : '<p class="card-urgent ok">Không có hạn khẩn cấp</p>';
  return `<a class="pcard ${s.health}" href="../${esc(payload.ma_da)}/review/${esc(payload.ngay_chay)}.html">
  <div class="pcard-head">
    <span class="dot ${s.health}"></span>
    <b>${esc(payload.ma_da)}</b>
    <span class="pcard-health">${HEALTH_LABEL[s.health]}</span>
  </div>
  <p class="pcard-name">${esc(payload.ten_ngan ?? payload.ma_da)}</p>
  <div class="pcard-counts">
    <span class="bad">${s.quaHan.length} quá hạn</span>
    <span class="warn">${s.sapToi.length} sắp tới</span>
    <span>${s.congPm.length} chờ PM</span>
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
  const allQuaHan = items.flatMap(({ payload, summary }) =>
    summary.quaHan.map((u) => ({ ...u, _ma_da: payload.ma_da })));
  const allSapToi = items.flatMap(({ payload, summary }) =>
    summary.sapToi.map((u) => ({ ...u, _ma_da: payload.ma_da })));

  const tongQuaHan = allQuaHan.length, tongSapToi = allSapToi.length;
  const tongCongPm = items.reduce((n, { summary }) => n + summary.congPm.length, 0);
  const soKhanCap = items.filter(({ summary }) => summary.health === 'khan-cap').length;

  const boBoQua = skipped.length ? `<p class="banner">Bỏ qua ${skipped.length} dự án do payload lỗi nặng: ${skipped.map((s) => `<strong>${esc(s.ma_da ?? '?')}</strong> (${esc(s.errors.join('; '))})`).join(', ')}.</p>` : '';

  const canhBaoChatLuong = warned.length ? `<div class="banner">
  <strong>${warned.length} dự án có gợi ý DDL chưa đúng chuẩn</strong> — phần hạn/deadline vẫn đúng và vẫn hiện đầy đủ bên dưới, nhưng script SQL cần sửa trước khi giao lập trình viên:
  <ul>${warned.map((w) => `<li><code>${esc(w.ma_da)}</code> — ${w.errors.map((e) => esc(e)).join('<br>')}</li>`).join('')}</ul>
</div>` : '';

  const cardsRow = `<div class="cards">
  <div class="card ${soKhanCap ? 'bad' : ''}"><b>${soKhanCap}</b><span>dự án khẩn cấp</span></div>
  <div class="card ${tongQuaHan ? 'bad' : ''}"><b>${tongQuaHan}</b><span>yêu cầu quá hạn (toàn danh mục)</span></div>
  <div class="card ${tongSapToi ? 'warn' : ''}"><b>${tongSapToi}</b><span>yêu cầu sắp tới hạn</span></div>
  <div class="card"><b>${tongCongPm}</b><span>chờ cổng PM (DD)</span></div>
  <div class="card"><b>${items.length}</b><span>dự án đang theo dõi</span></div>
</div>`;

  const sorted = [...items].sort((a, b) => {
    const rank = { 'khan-cap': 0, 'can-chu-y': 1, 'on': 2 };
    return rank[a.summary.health] - rank[b.summary.health];
  });
  const grid = `<div class="pgrid">${sorted.map(({ payload, summary }) => projectCard(summary, payload)).join('\n')}</div>`;

  const body = [
    boBoQua,
    canhBaoChatLuong,
    cardsRow,
    section('quan-trong-nhat', 'Danh mục — quá hạn', 'Gộp mọi dự án, ưu tiên xử lý trước.',
      urTable(allQuaHan.sort((a, b) => a._soNgay - b._soNgay), [colDuAn, colStt, colNoiDung, colGiaiDoan, colTrangThai, colHan, colConLai]), tongQuaHan),
    section('sap-toi-toan-danh-muc', 'Danh mục — sắp tới hạn', '',
      urTable(allSapToi.sort((a, b) => a._soNgay - b._soNgay), [colDuAn, colStt, colNoiDung, colGiaiDoan, colTrangThai, colHan, colConLai]), tongSapToi),
    section('theo-du-an', 'Theo dự án', 'Bấm vào thẻ để xem báo cáo chi tiết của dự án đó.', grid),
  ].filter(Boolean).join('\n\n');

  const title = `Tổng quan rà soát PM · ${fmtDate(meta.ngay_chay)}`;
  const metaLine = `LTQL <code>${esc(meta.pm ?? config.pm.maNv)}</code> · ${items.length} dự án${skipped.length ? ` (${skipped.length} bị bỏ qua)` : ''} · không chỉ định dự án cụ thể → xem toàn bộ.`;
  return page(title, metaLine, body);
}

// ---------------------------------------------------------------- CSS — token thiết kế

export const CSS = `
:root{
  --bg:#F8FAFC;--surface:#FFFFFF;--fg:#0F172A;--mut:#64748B;--line:#E2E8F0;--track:#E2E8F0;
  --primary:#1E40AF;
  --bad:#DC2626;--bad-bg:#FEF2F2;
  --warn:#D97706;--warn-bg:#FFFBEB;
  --ok:#059669;--ok-bg:#ECFDF5;
  --dd:#1D4ED8;--xn:#7C3AED;--th:#0D9488;
  --code-bg:#0F172A;--code-fg:#E2E8F0;--code-kw:#7DD3FC;--code-ty:#FCA5A5;--code-cm:#64748B;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#0B1220;--surface:#131B2E;--fg:#E5EAF3;--mut:#94A3B8;--line:#253248;--track:#1E293B;
  --primary:#60A5FA;
  --bad:#F87171;--bad-bg:rgba(248,113,113,.12);
  --warn:#FBBF24;--warn-bg:rgba(251,191,36,.12);
  --ok:#34D399;--ok-bg:rgba(52,211,153,.12);
  --dd:#60A5FA;--xn:#C4B5FD;--th:#5EEAD4;
  --code-bg:#060B16;--code-fg:#E2E8F0;--code-kw:#7DD3FC;--code-ty:#FCA5A5;--code-cm:#64748B;
}}
*{box-sizing:border-box}
body{margin:0;padding:0 20px 60px;background:var(--bg);color:var(--fg);
font:15px/1.6 "Segoe UI",-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif;max-width:1080px;margin-inline:auto}
a{color:var(--primary)}
header{padding:28px 0 12px;border-bottom:2px solid var(--line)}
h1{font-size:24px;margin:0 0 6px;letter-spacing:-.01em}
h2{font-size:19px;margin:0 0 4px;display:flex;align-items:center;gap:10px}
h3{font-size:15px;margin:22px 0 6px;color:var(--mut);font-weight:600}
.meta,.lead{color:var(--mut);font-size:13px;margin:0 0 10px}
section{padding:26px 0;border-bottom:1px solid var(--line)}
.count{font-size:12px;font-weight:700;background:var(--surface);border:1px solid var(--line);
border-radius:99px;padding:1px 9px;color:var(--mut)}
.count.zero{opacity:.45}
.cards{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 4px}
.card{flex:1 1 150px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.card b{display:block;font-size:28px;line-height:1.1;font-variant-numeric:tabular-nums}
.card span{font-size:12px;color:var(--mut)}
.card.bad{background:var(--bad-bg);border-color:var(--bad)} .card.bad b{color:var(--bad)}
.card.warn{background:var(--warn-bg);border-color:var(--warn)} .card.warn b{color:var(--warn)}
.banner{background:var(--warn-bg);border-left:3px solid var(--warn);padding:10px 14px;margin:16px 0;font-size:13px;border-radius:0 6px 6px 0}
table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
th,td{text-align:left;padding:8px 9px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);font-weight:600}
tbody tr:hover{background:var(--surface)}
.mono{font-family:ui-monospace,"Cascadia Code","Fira Code",SFMono-Regular,Consolas,monospace;font-size:12px;white-space:nowrap}
.empty{color:var(--mut);font-size:13px;font-style:italic;margin:8px 0}
.pill{display:inline-block;font-family:ui-monospace,monospace;font-size:11px;font-weight:700;
padding:1px 7px;border-radius:4px;color:#fff}
.tt-dd{background:var(--dd)} .tt-xn{background:var(--xn)} .tt-th{background:var(--th)} .dx{background:var(--mut)}
.ok{color:var(--ok);font-weight:600} .warn{color:var(--warn);font-weight:600}
.qua-han{color:var(--bad);font-weight:700}
code{font-family:ui-monospace,monospace;font-size:.9em;background:var(--surface);padding:1px 5px;border-radius:4px;border:1px solid var(--line)}
.sql{border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-top:6px}
.sql-chip{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
color:var(--mut);background:var(--surface);padding:6px 12px;border-bottom:1px solid var(--line)}
.sql pre{margin:0;background:var(--code-bg);color:var(--code-fg);padding:14px 16px;overflow-x:auto;
font-family:ui-monospace,"Cascadia Code","Fira Code",SFMono-Regular,Consolas,monospace;font-size:12.5px;line-height:1.6}
.sql-kw{color:var(--code-kw);font-weight:600}
.sql-ty{color:var(--code-ty)}
.sql-cm{color:var(--code-cm);font-style:italic}
pre{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:12px;
overflow-x:auto;font-size:12px;line-height:1.5}
.ddl h3{margin-top:18px;color:var(--fg)}
.flow{border:1px solid var(--line);border-left:3px solid var(--dd);border-radius:8px;padding:2px 16px 12px;margin:12px 0;background:var(--surface)}
.flow h3{margin-top:14px;color:var(--fg)}
.flow-dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 14px;margin:8px 0 0;font-size:13px}
.flow-dl dt{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);font-weight:600;padding-top:2px}
.flow-dl dd{margin:0}
.chart{width:100%;height:auto;overflow:visible}
.chart .ax{font-size:11px;fill:var(--mut)}
.chart .val{font-size:11px;fill:var(--mut);font-family:ui-monospace,monospace}
.chart .val.qua-han{fill:var(--bad)} .chart .val.sap-toi{fill:var(--warn)}
.chart .track{fill:var(--track)}
.chart .bar.qua-han{fill:var(--bad);opacity:.35} .chart .bar.sap-toi{fill:var(--warn);opacity:.4}
.chart .bar.con-thoi-gian{fill:var(--ok);opacity:.3}
.chart .dot.qua-han{fill:var(--bad)} .chart .dot.sap-toi{fill:var(--warn)} .chart .dot.con-thoi-gian{fill:var(--ok)}
.chart .today{stroke:var(--mut);stroke-width:1;stroke-dasharray:3 3}
.chart .today-lbl{font-size:10px;fill:var(--mut)}
.chart .seg.tt-dd{fill:var(--dd)} .chart .seg.tt-xn{fill:var(--xn)} .chart .seg.tt-th{fill:var(--th)}
.chart .seg.tlks-in{fill:var(--ok)} .chart .seg.tlks-out{fill:var(--warn)}
.legend{font-size:12px;color:var(--mut)}
.key{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 12px}
.key.tt-dd{background:var(--dd)} .key.tt-xn{background:var(--xn)} .key.tt-th{background:var(--th)}
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-top:12px}
.pcard{display:block;background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--line);
border-radius:10px;padding:14px 16px;text-decoration:none;color:var(--fg);transition:border-color .15s,transform .1s}
.pcard:hover{transform:translateY(-1px)}
.pcard.khan-cap{border-left-color:var(--bad)} .pcard.can-chu-y{border-left-color:var(--warn)} .pcard.on{border-left-color:var(--ok)}
.pcard-head{display:flex;align-items:center;gap:8px;margin-bottom:2px}
.pcard-head b{font-family:ui-monospace,monospace;font-size:14px}
.pcard-health{margin-left:auto;font-size:11px;color:var(--mut)}
.dot{width:9px;height:9px;border-radius:50%;flex:none}
.dot.khan-cap{background:var(--bad)} .dot.can-chu-y{background:var(--warn)} .dot.on{background:var(--ok)}
.pcard-name{font-size:13px;color:var(--mut);margin:2px 0 10px}
.pcard-counts{display:flex;gap:12px;font-size:12px;font-weight:600;margin-bottom:8px}
.card-urgent{font-size:12px;margin:0;padding-top:8px;border-top:1px dashed var(--line)}
.card-urgent.qua-han{color:var(--bad)} .card-urgent.sap-toi{color:var(--warn)} .card-urgent.ok{color:var(--mut)}
footer{padding:22px 0;color:var(--mut);font-size:12px}
`;

// ---------------------------------------------------------------- xây artifact

/**
 * Đọc payload một dự án → trả mô tả file. KHÔNG ghi đĩa.
 * @returns {{artifact: {relPath, content}|null, errors: string[]}}
 */
export function buildReportArtifact(payload, hub = HUB) {
  const errors = validatePayload(payload);
  if (errors.length) return { artifact: null, errors };
  const h = loadHolidays(hub);
  const ngay = String(payload.ngay_chay).slice(0, 10);
  return {
    artifact: {
      relPath: `ledger/${payload.ma_da}/review/${ngay}.html`,
      content: renderReport(payload, h),
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
  const items = [];
  const skipped = [];
  const warned = [];
  for (const proj of payload.projects) {
    const { fatal, quality } = validatePayloadDetailed(proj);
    if (fatal.length) { skipped.push({ ma_da: proj?.ma_da ?? null, errors: fatal }); continue; }
    if (quality.length) warned.push({ ma_da: proj.ma_da, errors: quality });
    items.push({ payload: proj, summary: summarize(proj, h) });
  }
  if (!items.length) {
    return { artifact: null, errors: ['không có dự án nào hợp lệ trong `projects`', ...skipped.flatMap((s) => s.errors)] };
  }

  const ngay = String(payload.ngay_chay).slice(0, 10);
  return {
    artifact: {
      relPath: `ledger/_portfolio/${ngay}.html`,
      content: renderPortfolio(items, skipped, warned, { ngay_chay: ngay, pm: payload.pm }, h),
    },
    errors: [],
  };
}
