// report-kpi.mjs — dashboard KPI bộ phận (LTQL × trạng thái), không liệt kê theo mã UR.
//
// Payload do PM chuẩn bị từ query_sql trên QLDA_APP (aggregate GROUP BY ma_lt1).
// Phần quá hạn cũng gom theo nhân viên (`quaHanLtql`), không theo fcode1.
//
// Thiết kế: Data-Dense Dashboard (ui-ux-pro-max) — Fira Sans/Code, mật độ cao,
// horizontal bar ranking, stacked DD/XN/TH, SVG icon (không emoji), offline-first CSS.

import { esc, fmtDate } from './report.mjs';

export function validateKpiPayload(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return ['payload không phải object'];
  if (p.kind !== 'kpi') errors.push('`kind` phải là "kpi"');
  if (!p.ngay_chay) errors.push('thiếu `ngay_chay` (YYYY-MM-DD)');
  if (!p.scope) errors.push('thiếu `scope` (vd. FSD)');
  if (!Array.isArray(p.ltql) || !p.ltql.length) {
    errors.push('thiếu mảng `ltql` (ít nhất một nhân viên LTQL)');
  }
  for (const [i, r] of (p.ltql ?? []).entries()) {
    if (!r.ma) errors.push(`ltql[${i}] thiếu \`ma\``);
    if (typeof r.dangMo !== 'number') errors.push(`ltql[${i}] thiếu \`dangMo\` (number)`);
  }
  if (!Array.isArray(p.trangThaiMo)) errors.push('thiếu mảng `trangThaiMo`');
  return errors;
}

function pct(num, den) {
  if (!den) return '—';
  return `${Math.round((num / den) * 100)}%`;
}

function pctNum(num, den) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

/** Inline SVG icons (Phosphor-style outline) — no emoji, no CDN. */
const ICO = {
  folder: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-10z"/></svg>`,
  list: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>`,
  alert: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`,
  users: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  check: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M20 6 9 17l-5-5"/></svg>`,
  chart: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M3 3v18h18M7 16v-5M12 16V8M17 16v-9"/></svg>`,
  clock: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.75"/><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M12 7v5l3 2"/></svg>`,
};

const TT_META = {
  DD: { label: 'Đã duyệt', cls: 'tt-dd' },
  XN: { label: 'Xác nhận LT', cls: 'tt-xn' },
  TH: { label: 'Thực hiện', cls: 'tt-th' },
};

function hBar(items, { labelFn, valueFn, maxVal, fillClass = '' }) {
  const max = maxVal || Math.max(...items.map(valueFn), 1);
  return `<div class="hbar" role="list">${items.map((item, i) => {
    const val = valueFn(item);
    const w = max ? ((val / max) * 100).toFixed(1) : '0';
    return `<div class="hbar-row anim" style="--i:${i}" role="listitem">
  <div class="hbar-lbl">${labelFn(item)}</div>
  <div class="hbar-track" aria-hidden="true"><div class="hbar-fill ${fillClass}" style="width:${w}%"></div></div>
  <div class="hbar-val">${val}</div>
</div>`;
  }).join('\n')}</div>`;
}

function stackedDdXnTh(r) {
  const total = Math.max(r.dangMo || 0, 1);
  const dd = r.dd ?? 0;
  const xn = r.xn ?? 0;
  const th = r.th ?? 0;
  return `<div class="stack" title="DD ${dd} · XN ${xn} · TH ${th}" aria-label="DD ${dd}, XN ${xn}, TH ${th}">
  <span class="seg tt-dd" style="flex:${dd || 0.0001}"></span>
  <span class="seg tt-xn" style="flex:${xn || 0.0001}"></span>
  <span class="seg tt-th" style="flex:${th || 0.0001}"></span>
  <span class="seg empty" style="flex:${Math.max(total - dd - xn - th, 0)}"></span>
</div>`;
}

function kpiCard(c, i) {
  const tone = c.tone ? ` tone-${c.tone}` : '';
  const icon = c.tone === 'bad' ? ICO.alert
    : c.tone === 'warn' ? ICO.list
      : c.tone === 'ok' ? ICO.check
        : /LTQL|nhân/i.test(c.label ?? '') ? ICO.users
          : /dự án/i.test(c.label ?? '') ? ICO.folder
            : ICO.chart;
  return `<article class="kpi anim${tone}" style="--i:${i}">
  <div class="kpi-top">${icon}<span class="kpi-label">${esc(c.label)}</span></div>
  <div class="kpi-val">${esc(c.value)}</div>
</article>`;
}

function renderKpi(payload) {
  const scopeLabel = payload.scopeLabel ?? payload.scope;
  const ltql = [...payload.ltql].sort((a, b) => b.dangMo - a.dangMo);
  const maxLtql = ltql[0]?.dangMo ?? 1;
  const trangThai = [...(payload.trangThaiMo ?? [])].sort((a, b) => b.soLuong - a.soLuong);
  const maxTt = trangThai[0]?.soLuong ?? 1;
  const ap = payload.activeProjects ?? {};
  const pctDone = ap.tongUr ? pctNum(ap.hoanTat, ap.tongUr) : null;
  const filterNote = payload.filterNote
    ?? `nbdmda.bp_lt = ${payload.scope} AND nbphyc.bp_lt = ${payload.scope}`;

  const cards = [...(payload.cards ?? [])];
  if (pctDone !== null) cards.push({ label: 'Hoàn tất dự án đang chạy', value: `${pctDone}%`, tone: 'ok' });

  const ttLegend = Object.entries(TT_META).map(([k, v]) =>
    `<span class="legend-item"><span class="dot ${v.cls}"></span><strong>${k}</strong> ${esc(v.label)}</span>`,
  ).join('');

  const ttBars = hBar(trangThai, {
    labelFn: (r) => {
      const m = TT_META[r.ma] ?? { label: r.ma, cls: '' };
      return `<span class="pill ${m.cls}">${esc(r.ma)}</span> <span class="muted">${esc(m.label)}</span>`;
    },
    valueFn: (r) => r.soLuong,
    maxVal: maxTt,
    fillClass: 'fill-primary',
  });

  const ltqlBars = hBar(ltql, {
    labelFn: (r) => `<code>${esc(r.ma)}</code>${r.ten ? ` <span class="muted">${esc(r.ten)}</span>` : ''}`,
    valueFn: (r) => r.dangMo,
    maxVal: maxLtql,
    fillClass: 'fill-primary',
  });

  const ltqlTable = ltql.map((r, i) => `<tr class="anim" style="--i:${i}">
  <td><code>${esc(r.ma)}</code>${r.ten ? ` <span class="muted">${esc(r.ten)}</span>` : ''}</td>
  <td class="num"><strong>${r.dangMo}</strong></td>
  <td class="stack-cell">${stackedDdXnTh(r)}</td>
  <td class="num muted">${r.dd ?? 0}</td>
  <td class="num muted">${r.xn ?? 0}</td>
  <td class="num muted">${r.th ?? 0}</td>
</tr>`).join('\n');

  const quaHanLtql = payload.quaHanLtql ?? [];
  const quaHanBlock = quaHanLtql.length
    ? `<div class="panel danger">
<table>
<thead><tr><th>LTQL</th><th class="num">UR quá hạn</th></tr></thead>
<tbody>${quaHanLtql.map((r) => `<tr>
  <td><code>${esc(r.ma)}</code>${r.ten ? ` <span class="muted">${esc(r.ten)}</span>` : ''}</td>
  <td class="num"><span class="badge bad">${ICO.alert} ${r.so}</span></td>
</tr>`).join('\n')}</tbody>
</table>
</div>`
    : `<p class="empty">${ICO.check} Không có UR quá hạn trong phạm vi.</p>`;

  const duAn = payload.duAn ?? [];
  const duAnRows = duAn.map((r, i) => {
    const p = pctNum(r.xong ?? 0, r.tong ?? 0);
    return `<tr class="anim" style="--i:${i}">
  <td><code>${esc(r.ma_da)}</code></td>
  <td class="num">${r.tong ?? 0}</td>
  <td class="num">${r.xong ?? 0}</td>
  <td class="num"><strong>${r.mo ?? 0}</strong></td>
  <td class="pct-cell">
    <div class="mini-track" aria-hidden="true"><div class="mini-fill" style="width:${p}%"></div></div>
    <span class="num">${pct(r.xong ?? 0, r.tong ?? 0)}</span>
  </td>
</tr>`;
  }).join('\n');

  const title = `KPI · ${scopeLabel}`;
  const body = `
<header class="hero">
  <div class="hero-brand">
    <span class="brand-mark">${ICO.chart}</span>
    <div>
      <p class="eyebrow">FastBusiness · QLDA</p>
      <h1>${esc(title)}</h1>
    </div>
  </div>
  <dl class="hero-meta">
    <div><dt>Ngày</dt><dd>${fmtDate(payload.ngay_chay)}</dd></div>
    <div><dt>Phạm vi</dt><dd><code>${esc(filterNote)}</code></dd></div>
    <div><dt>Trạng thái mở</dt><dd>DD / XN / TH</dd></div>
  </dl>
</header>

<section class="kpi-grid" aria-label="Chỉ số tổng quan">
${cards.map((c, i) => kpiCard(c, i)).join('\n')}
</section>

<div class="layout-2">
  <section class="panel">
    <h2>${ICO.list} UR mở · theo trạng thái</h2>
    <div class="legend">${ttLegend}</div>
    ${ttBars}
  </section>
  <section class="panel">
    <h2>${ICO.clock} Quá hạn · theo LTQL</h2>
    ${quaHanBlock}
  </section>
</div>

<section class="panel">
  <h2>${ICO.users} UR mở · theo LTQL</h2>
  <div class="legend">${ttLegend}<span class="legend-item muted">Cột xếp chồng = tỉ lệ DD/XN/TH trong khối lượng mở</span></div>
  ${ltqlBars}
  <div class="table-wrap">
  <table>
  <thead><tr><th>LTQL</th><th class="num">Mở</th><th>Phân bổ</th><th class="num">DD</th><th class="num">XN</th><th class="num">TH</th></tr></thead>
  <tbody>${ltqlTable}</tbody>
  </table>
  </div>
</section>

${duAn.length ? `<section class="panel">
  <h2>${ICO.folder} Dự án có UR mở <span class="count">${duAn.length}</span></h2>
  <div class="table-wrap">
  <table>
  <thead><tr><th>Dự án</th><th class="num">Tổng</th><th class="num">Hoàn tất</th><th class="num">Mở</th><th>Tiến độ</th></tr></thead>
  <tbody>${duAnRows}</tbody>
  </table>
  </div>
</section>` : ''}

<footer>
  <p>Sinh bởi <code>node tools/4ai.mjs report</code> · nguồn QLDA_APP · thiết kế Data-Dense Dashboard</p>
</footer>`;

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${fmtDate(payload.ngay_chay)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${KPI_CSS}</style>
</head>
<body>
<main class="shell">
${body}
</main>
</body>
</html>`;
}

const KPI_CSS = `
:root{
  --bg:#F8FAFC;--surface:#FFFFFF;--fg:#0F172A;--muted:#475569;--line:#DBEAFE;--track:#E9EEF6;
  --primary:#1E40AF;--primary-soft:#DBEAFE;--secondary:#3B82F6;--accent:#D97706;
  --ok:#059669;--ok-bg:#ECFDF5;--warn:#D97706;--warn-bg:#FFFBEB;--bad:#DC2626;--bad-bg:#FEF2F2;
  --dd:#1D4ED8;--xn:#0F766E;--th:#D97706;
  --space:8px;--radius:8px;
  --font:"Fira Sans","Segoe UI",system-ui,sans-serif;
  --mono:"Fira Code","Cascadia Code",ui-monospace,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#0B1220;--surface:#131B2E;--fg:#E5EAF3;--muted:#94A3B8;--line:#253248;--track:#1E293B;
  --primary:#60A5FA;--primary-soft:rgba(96,165,250,.15);--secondary:#93C5FD;--accent:#FBBF24;
  --ok:#34D399;--ok-bg:rgba(52,211,153,.12);--warn:#FBBF24;--warn-bg:rgba(251,191,36,.12);
  --bad:#F87171;--bad-bg:rgba(248,113,113,.12);
  --dd:#60A5FA;--xn:#5EEAD4;--th:#FBBF24;
}}
*{box-sizing:border-box}
html{color-scheme:light dark}
body{margin:0;background:
  radial-gradient(1200px 400px at 10% -10%, rgba(30,64,175,.08), transparent 55%),
  radial-gradient(900px 320px at 100% 0%, rgba(217,119,6,.06), transparent 50%),
  var(--bg);
color:var(--fg);font:14px/1.45 var(--font)}
.shell{max-width:1180px;margin:0 auto;padding:20px 16px 48px}
.hero{display:flex;flex-wrap:wrap;gap:16px 24px;justify-content:space-between;align-items:flex-end;
padding:18px 0 16px;border-bottom:1px solid var(--line);margin-bottom:16px}
.hero-brand{display:flex;gap:12px;align-items:center}
.brand-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:10px;
background:var(--primary);color:#fff;flex-shrink:0}
.brand-mark .ico{width:22px;height:22px}
.eyebrow{margin:0 0 2px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
h1{margin:0;font-size:clamp(20px,2.4vw,28px);font-weight:700;letter-spacing:-.02em;line-height:1.15}
.hero-meta{display:flex;flex-wrap:wrap;gap:10px 18px;margin:0}
.hero-meta div{margin:0}
.hero-meta dt{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600}
.hero-meta dd{margin:2px 0 0;font-size:12px;font-family:var(--mono)}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:0 0 14px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;
transition:border-color .2s ease, transform .2s ease}
.kpi:hover{border-color:var(--secondary);transform:translateY(-1px)}
.kpi-top{display:flex;align-items:center;gap:6px;color:var(--muted);margin-bottom:6px}
.kpi-label{font-size:11px;font-weight:600;letter-spacing:.02em}
.kpi-val{font-family:var(--mono);font-size:28px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.kpi.tone-warn{background:var(--warn-bg);border-color:color-mix(in srgb,var(--warn) 35%, var(--line))}
.kpi.tone-warn .kpi-val,.kpi.tone-warn .kpi-top{color:var(--warn)}
.kpi.tone-bad{background:var(--bad-bg);border-color:color-mix(in srgb,var(--bad) 35%, var(--line))}
.kpi.tone-bad .kpi-val,.kpi.tone-bad .kpi-top{color:var(--bad)}
.kpi.tone-ok{background:var(--ok-bg);border-color:color-mix(in srgb,var(--ok) 35%, var(--line))}
.kpi.tone-ok .kpi-val,.kpi.tone-ok .kpi-top{color:var(--ok)}
.layout-2{display:grid;grid-template-columns:1.4fr 1fr;gap:10px;margin-bottom:10px}
@media (max-width:860px){.layout-2{grid-template-columns:1fr}}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;margin:0 0 10px}
.panel.danger{border-color:color-mix(in srgb,var(--bad) 40%, var(--line));background:color-mix(in srgb,var(--bad-bg) 55%, var(--surface))}
h2{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:.04em;
text-transform:uppercase;color:var(--muted)}
h2 .ico{width:16px;height:16px;color:var(--primary)}
.count{margin-left:auto;font-size:11px;font-family:var(--mono);font-weight:600;color:var(--muted);
border:1px solid var(--line);border-radius:999px;padding:1px 8px}
.legend{display:flex;flex-wrap:wrap;gap:8px 14px;margin:0 0 10px;font-size:11px;color:var(--muted)}
.legend-item{display:inline-flex;align-items:center;gap:5px}
.legend-item strong{font-family:var(--mono);color:var(--fg)}
.dot{width:8px;height:8px;border-radius:2px;display:inline-block}
.dot.tt-dd,.seg.tt-dd,.pill.tt-dd{background:var(--dd)}
.dot.tt-xn,.seg.tt-xn,.pill.tt-xn{background:var(--xn)}
.dot.tt-th,.seg.tt-th,.pill.tt-th{background:var(--th)}
.hbar{display:flex;flex-direction:column;gap:6px}
.hbar-row{display:grid;grid-template-columns:minmax(110px,160px) 1fr 40px;gap:8px;align-items:center}
.hbar-lbl{font-size:12px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hbar-track{height:12px;background:var(--track);border-radius:3px;overflow:hidden}
.hbar-fill{height:100%;border-radius:3px;background:var(--primary);min-width:2px;
transition:width .35s ease}
.hbar-val{font-family:var(--mono);font-size:12px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums}
.table-wrap{overflow-x:auto;margin-top:12px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700}
tbody tr{transition:background .15s ease}
tbody tr:hover{background:var(--primary-soft)}
.num{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums}
.stack-cell{min-width:120px}
.stack{display:flex;height:10px;border-radius:3px;overflow:hidden;background:var(--track);gap:1px}
.seg{display:block;min-width:0}
.seg.empty{background:transparent}
.pct-cell{display:grid;grid-template-columns:1fr 42px;gap:8px;align-items:center;min-width:140px}
.mini-track{height:8px;background:var(--track);border-radius:3px;overflow:hidden}
.mini-fill{height:100%;background:var(--ok);border-radius:3px}
.pill{display:inline-block;color:#fff;font-family:var(--mono);font-size:10px;font-weight:700;
padding:1px 6px;border-radius:3px;letter-spacing:.02em}
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;
font-size:11px;font-weight:700;font-family:var(--mono)}
.badge.bad{background:var(--bad-bg);color:var(--bad)}
.badge .ico{width:12px;height:12px}
.muted{color:var(--muted)}
.empty{display:flex;align-items:center;gap:6px;margin:0;color:var(--ok);font-size:13px;font-weight:500}
.empty .ico{width:16px;height:16px}
code{font-family:var(--mono);font-size:.92em;background:var(--track);padding:1px 5px;border-radius:3px}
.ico{width:14px;height:14px;flex-shrink:0;display:inline-block;vertical-align:middle}
footer{margin-top:18px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}
footer p{margin:0}
.anim{animation:rise .35s ease both;animation-delay:calc(var(--i,0) * 35ms)}
@keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){
  .anim{animation:none}
  .kpi:hover{transform:none}
  .hbar-fill{transition:none}
}
`;

/** @returns {{artifact: {relPath, content}|null, errors: string[]}} */
export function buildKpiReportArtifact(payload) {
  const errors = validateKpiPayload(payload);
  if (errors.length) return { artifact: null, errors };
  const ngay = String(payload.ngay_chay).slice(0, 10);
  const scope = String(payload.scope).replace(/[^\w-]/g, '') || 'FSD';
  return {
    artifact: {
      relPath: `_${scope}/${ngay}/kpi.html`,
      content: renderKpi(payload),
    },
    errors: [],
  };
}
