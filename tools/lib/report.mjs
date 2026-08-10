// report.mjs — dựng báo cáo rà soát thành HTML tự chứa.
//
// TRẢ VỀ {relPath, content}; writer.mjs mới ghi. Không gọi DB, không gọi mạng:
// dữ liệu vào bằng payload JSON do người chạy rà soát chuẩn bị (query_sql →
// scratchpad → lệnh này). Nhờ vậy báo cáo dựng lại được y hệt từ cùng payload.
//
// Biểu đồ là SVG sinh tay — không CDN, không thư viện, mở offline vẫn đúng.

import { loadHolidays, classifyDeadline, isWorkingDay } from './workdays.mjs';
import { HUB } from './assets.mjs';

const TRANG_THAI = {
  DD: { ten: 'Đã duyệt', mau: 'tt-dd' },
  XN: { ten: 'Xác nhận chuyển LT', mau: 'tt-xn' },
  TH: { ten: 'Đang thực hiện', mau: 'tt-th' },
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const fmtDate = (iso) => {
  const s = String(iso ?? '').slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
};

/** Kiểm payload trước khi dựng — thiếu gì báo rõ chỗ đó, không lặng lẽ render rỗng. */
export function validatePayload(p) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['payload không phải object'];
  if (!p.ma_da) errs.push('thiếu `ma_da`');
  if (!p.ngay_chay) errs.push('thiếu `ngay_chay` (YYYY-MM-DD) — ngày chạy rà soát');
  if (!Array.isArray(p.giaiDoan)) errs.push('thiếu mảng `giaiDoan`');
  if (!Array.isArray(p.yeuCau)) errs.push('thiếu mảng `yeuCau`');
  for (const [i, g] of (p.giaiDoan ?? []).entries()) {
    if (!g.giai_doan_da) errs.push(`giaiDoan[${i}] thiếu \`giai_doan_da\``);
    if (!g.ngay_ht) errs.push(`giaiDoan[${i}] thiếu \`ngay_ht\` (hạn hiệu lực = MAX(ngay_ht))`);
  }
  for (const [i, u] of (p.yeuCau ?? []).entries()) {
    if (!u.stt_rec) errs.push(`yeuCau[${i}] thiếu \`stt_rec\``);
    if (!TRANG_THAI[u.trang_thai]) {
      errs.push(`yeuCau[${i}] có trang_thai "${u.trang_thai}" — chỉ rà soát DD, XN, TH`);
    }
  }
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
  if (!urs.length) return '<p class="empty">Không có mục nào. </p>';
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

function section(id, tieuDe, moTa, noiDung, dem) {
  const badge = dem === undefined ? '' : `<span class="count${dem ? '' : ' zero'}">${dem}</span>`;
  return `<section id="${id}">
<h2>${esc(tieuDe)}${badge}</h2>
${moTa ? `<p class="lead">${esc(moTa)}</p>` : ''}
${noiDung}
</section>`;
}

// ---------------------------------------------------------------- dựng

export function renderReport(payload, h) {
  const { today, phases, urs } = enrich(payload, h);

  const quaHan = urs.filter((u) => u._muc === 'qua-han');
  const sapToi = urs.filter((u) => u._muc === 'sap-toi');
  const chuaChot = phases.filter((p) => !p.xac_nhan_da_hen_yn);
  const urChuaChot = urs.filter((u) => u._chotDaHen === false);
  const congPm = urs.filter((u) => u.trang_thai === 'DD');
  const ngoaiTlksThieuCanCu = urs.filter((u) => !u.tlks_yn && !u.canCu);
  const deXuatKl = urs.filter((u) => u.deXuat?.trang_thai === 'KL');
  const coDdl = urs.filter((u) => u.ghiChuDdl);
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

  const ddlBlock = coDdl.length ? coDdl.map((u) => `<article class="ddl">
<h3>${esc(u.fcode1 || String(u.stt_rec).trim())} — ${esc(u.noi_dung ?? '')}</h3>
<pre>${esc(u.ghiChuDdl)}</pre>
</article>`).join('\n') : '<p class="empty">Không có yêu cầu nào nhắc tạo bảng hay thêm cột.</p>';

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
    section('ddl', 'Gợi ý tạo bảng / thêm cột', 'Chỉ là ghi chú cho lập trình viên. Không script nào được chạy từ báo cáo này.',
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

  const tieuDe = `Rà soát ${payload.ma_da}${payload.ten_ngan ? ' — ' + payload.ten_ngan : ''} · ${fmtDate(today)}`;

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tieuDe)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>${esc(tieuDe)}</h1>
  <p class="meta">Dự án <code>${esc(payload.ma_da)}</code>${payload.ma_pbsp ? ` · phiên bản <code>${esc(payload.ma_pbsp)}</code>` : ''} · phạm vi: LTQL ${esc(payload.pm ?? 'PM01')}, trạng thái DD/XN/TH · vai PM kết thúc ở HT.</p>
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

const CSS = `
:root{--bg:#fff;--fg:#1a1a1a;--mut:#666;--line:#e3e3e3;--card:#f7f7f8;
--bad:#c0392b;--warn:#b7791f;--ok:#2f855a;--dd:#2b6cb0;--xn:#6b46c1;--th:#2c7a7b;--track:#ececef}
@media (prefers-color-scheme:dark){:root{--bg:#16171a;--fg:#e8e8ea;--mut:#9a9aa2;--line:#2c2d33;--card:#1e1f24;
--bad:#f0776a;--warn:#e0b050;--ok:#63c48a;--dd:#63a4e0;--xn:#a98ae0;--th:#5fbfbf;--track:#2a2b31}}
*{box-sizing:border-box}
body{margin:0;padding:0 20px 60px;background:var(--bg);color:var(--fg);
font:15px/1.6 -apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial,sans-serif;max-width:1000px;margin-inline:auto}
header{padding:28px 0 12px;border-bottom:2px solid var(--line)}
h1{font-size:24px;margin:0 0 6px}
h2{font-size:19px;margin:0 0 4px;display:flex;align-items:center;gap:10px}
h3{font-size:15px;margin:22px 0 6px;color:var(--mut);font-weight:600}
.meta,.lead{color:var(--mut);font-size:13px;margin:0 0 10px}
section{padding:26px 0;border-bottom:1px solid var(--line)}
.count{font-size:12px;font-weight:700;background:var(--card);border:1px solid var(--line);
border-radius:99px;padding:1px 9px;color:var(--mut)}
.count.zero{opacity:.45}
.cards{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 4px}
.card{flex:1 1 140px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 14px}
.card b{display:block;font-size:26px;line-height:1.1}
.card span{font-size:12px;color:var(--mut)}
.card.bad b{color:var(--bad)} .card.warn b{color:var(--warn)}
.banner{background:var(--card);border-left:3px solid var(--warn);padding:10px 14px;margin:16px 0;font-size:13px;border-radius:0 6px 6px 0}
table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
th,td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);font-weight:600}
tbody tr:hover{background:var(--card)}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;white-space:nowrap}
.empty{color:var(--mut);font-size:13px;font-style:italic;margin:8px 0}
.pill{display:inline-block;font-family:ui-monospace,monospace;font-size:11px;font-weight:700;
padding:1px 7px;border-radius:4px;color:#fff}
.tt-dd{background:var(--dd)} .tt-xn{background:var(--xn)} .tt-th{background:var(--th)} .dx{background:var(--mut)}
.ok{color:var(--ok);font-weight:600} .warn{color:var(--warn);font-weight:600}
.qua-han{color:var(--bad);font-weight:700}
code{font-family:ui-monospace,monospace;font-size:.9em;background:var(--card);padding:1px 5px;border-radius:4px}
pre{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:12px;
overflow-x:auto;font-size:12px;line-height:1.5}
.ddl h3{margin-top:18px;color:var(--fg)}
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
footer{padding:22px 0;color:var(--mut);font-size:12px}
`;

/**
 * Đọc payload → trả mô tả file. KHÔNG ghi đĩa.
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
