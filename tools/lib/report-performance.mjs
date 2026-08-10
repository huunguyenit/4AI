// report-performance.mjs — dashboard hiệu suất nhân viên theo phòng ban, dựng thành HTML tự chứa.
//
// TRẢ VỀ {relPath, content}; writer.mjs mới ghi. Không gọi DB: dữ liệu vào bằng payload JSON
// do PM chuẩn bị sẵn (query_sql trên QLDA_APP → scratchpad → lệnh này). Payload chỉ chứa dữ liệu
// PHẲNG (một dòng = một nhân viên × một kỳ); mọi pivot, xếp hạng, so sánh phòng ban tính ở đây
// bằng JS — không lặp lại logic PIVOT phức tạp trong T-SQL mỗi lần đổi cách nhìn dữ liệu.
//
// Payload:
//   {
//     kind: "performance",
//     ngay_chay: "YYYY-MM-DD",
//     granularity: "thang" | "tuan",
//     boPhanMinh: "FSD",                 // phòng ban của PM — dùng để highlight và tính hạng
//     duLieu: [
//       { emp: "NV07", dept: "FSD", period: 1, yc: 12, sl: 34 },
//       ...
//     ]
//   }
//
// `period` là số nguyên: 1-12 khi granularity=thang, 1-53 khi granularity=tuan. `yc` = số yêu
// cầu (đếm dòng nbphyc), `sl` = số lượng đầu mục công việc (SUM nbctdaumuc.so_luong) — tùy chọn.
//
// Biểu đồ là SVG sinh tay — không CDN. Dùng lại `esc`, `fmtDate`, `page`, `section`, `CSS` từ
// report.mjs để cùng một hệ thiết kế với báo cáo rà soát UR.

import { esc, fmtDate, page, section } from './report.mjs';

// ---------------------------------------------------------------- validate

export function validatePerformancePayload(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return ['payload không phải object'];
  if (!p.ngay_chay) errors.push('thiếu `ngay_chay` (YYYY-MM-DD)');
  if (!['thang', 'tuan'].includes(p.granularity)) errors.push('`granularity` phải là "thang" hoặc "tuan"');
  if (!Array.isArray(p.duLieu) || !p.duLieu.length) {
    errors.push('thiếu mảng `duLieu` (ít nhất một dòng emp × period)');
    return errors;
  }
  for (const [i, d] of p.duLieu.entries()) {
    const nhan = d.emp ? `duLieu[${i}] (${d.emp})` : `duLieu[${i}]`;
    if (!d.emp) errors.push(`duLieu[${i}] thiếu \`emp\``);
    if (!d.dept) errors.push(`${nhan} thiếu \`dept\``);
    if (!Number.isInteger(d.period)) errors.push(`${nhan} thiếu \`period\` (số nguyên: tháng 1-12 hoặc tuần 1-53)`);
    if (typeof d.yc !== 'number') errors.push(`${nhan} thiếu \`yc\` (number — số yêu cầu)`);
    if (d.sl !== undefined && typeof d.sl !== 'number') errors.push(`${nhan} \`sl\` phải là number nếu có`);
  }
  if (p.boPhanMinh && !p.duLieu.some((d) => d.dept === p.boPhanMinh)) {
    errors.push(`\`boPhanMinh\` = "${p.boPhanMinh}" không xuất hiện trong \`duLieu\` — kiểm tra lại mã phòng`);
  }
  return errors;
}

// ---------------------------------------------------------------- aggregate

function aggregate(payload) {
  const periods = [...new Set(payload.duLieu.map((d) => d.period))].sort((a, b) => a - b);
  const depts = [...new Set(payload.duLieu.map((d) => d.dept))].sort();

  const byEmp = new Map();
  for (const d of payload.duLieu) {
    if (!byEmp.has(d.emp)) {
      byEmp.set(d.emp, { emp: d.emp, dept: d.dept, byPeriod: new Map(), totalYc: 0, totalSl: 0 });
    }
    const e = byEmp.get(d.emp);
    e.byPeriod.set(d.period, { yc: d.yc ?? 0, sl: d.sl ?? 0 });
    e.totalYc += d.yc ?? 0;
    e.totalSl += d.sl ?? 0;
  }
  const employees = [...byEmp.values()].map((e) => ({
    ...e,
    tbYc: e.byPeriod.size ? e.totalYc / e.byPeriod.size : 0,
  }));

  const deptTotals = depts.map((dept) => {
    const emps = employees.filter((e) => e.dept === dept);
    return {
      dept,
      soNv: emps.length,
      totalYc: emps.reduce((s, e) => s + e.totalYc, 0),
      totalSl: emps.reduce((s, e) => s + e.totalSl, 0),
    };
  }).sort((a, b) => b.totalYc - a.totalYc);

  const deptPeriod = new Map();
  for (const d of payload.duLieu) {
    if (!deptPeriod.has(d.dept)) deptPeriod.set(d.dept, new Map());
    const m = deptPeriod.get(d.dept);
    const cur = m.get(d.period) ?? { yc: 0, sl: 0 };
    cur.yc += d.yc ?? 0;
    cur.sl += d.sl ?? 0;
    m.set(d.period, cur);
  }

  const topCompanyByPeriod = new Map();
  for (const period of periods) {
    topCompanyByPeriod.set(period, payload.duLieu
      .filter((d) => d.period === period)
      .sort((a, b) => (b.yc - a.yc) || ((b.sl ?? 0) - (a.sl ?? 0))));
  }

  const topByDeptPeriod = new Map();
  for (const dept of depts) {
    for (const period of periods) {
      topByDeptPeriod.set(`${dept}|${period}`, payload.duLieu
        .filter((d) => d.dept === dept && d.period === period)
        .sort((a, b) => (b.yc - a.yc) || ((b.sl ?? 0) - (a.sl ?? 0))));
    }
  }

  return { periods, depts, employees, deptTotals, deptPeriod, topByDeptPeriod, topCompanyByPeriod };
}

function periodLabel(granularity, period) {
  return granularity === 'tuan' ? `Tuần ${period}` : `Th${period}`;
}

// ---------------------------------------------------------------- biểu đồ

function chartDeptBars(deptTotals, ownDept) {
  if (!deptTotals.length) return '<p class="empty">Không có dữ liệu phòng ban.</p>';
  const rowH = 32, padL = 160, padR = 60, padT = 10, w = 900;
  const h = padT + deptTotals.length * rowH + 10;
  const maxV = Math.max(1, ...deptTotals.map((d) => d.totalYc));
  const scale = (n) => (n / maxV) * (w - padL - padR);
  const rows = deptTotals.map((d, i) => {
    const y = padT + i * rowH;
    const bw = Math.max(scale(d.totalYc), d.totalYc > 0 ? 2 : 0);
    const own = d.dept === ownDept;
    const label = d.dept.length > 18 ? d.dept.slice(0, 17) + '…' : d.dept;
    return `  <text class="ax${own ? ' ax-own' : ''}" x="${padL - 10}" y="${y + 15}" text-anchor="end">${esc(label)}${own ? ' ★' : ''}</text>
  <rect class="track" x="${padL}" y="${y + 4}" width="${w - padL - padR}" height="16" rx="4"/>
  <rect class="bar-dept${own ? ' own' : ''}" x="${padL}" y="${y + 4}" width="${bw.toFixed(1)}" height="16" rx="4"><title>${esc(d.dept)}: ${d.totalYc} YC · ${d.soNv} NV</title></rect>
  <text class="val" x="${(padL + bw + 8).toFixed(1)}" y="${y + 16}">${d.totalYc}</text>`;
  }).join('\n');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="So sánh tổng yêu cầu theo phòng ban">
${rows}
</svg>`;
}

function chartTrend(periods, deptPeriod, ownDept, granularity) {
  if (periods.length < 2) return '<p class="empty">Cần ít nhất 2 kỳ để vẽ xu hướng.</p>';
  const otherDepts = [...deptPeriod.keys()].filter((d) => d !== ownDept);
  const ownSeries = periods.map((p) => deptPeriod.get(ownDept)?.get(p)?.yc ?? 0);
  const avgOtherSeries = periods.map((p) => otherDepts.length
    ? otherDepts.reduce((s, d) => s + (deptPeriod.get(d)?.get(p)?.yc ?? 0), 0) / otherDepts.length
    : 0);

  const w = 900, h = 220, padL = 40, padR = 20, padT = 16, padB = 30;
  const maxV = Math.max(1, ...ownSeries, ...avgOtherSeries);
  const x = (i) => padL + (i / (periods.length - 1)) * (w - padL - padR);
  const y = (v) => padT + (1 - v / maxV) * (h - padT - padB);
  const line = (series) => series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const dots = (series, cls) => series.map((v, i) =>
    `<circle class="dot ${cls}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5"><title>${esc(periodLabel(granularity, periods[i]))}: ${v.toFixed(1)}</title></circle>`).join('');
  const axis = periods.map((p, i) =>
    `<text class="ax" x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="middle">${esc(periodLabel(granularity, p))}</text>`).join('');

  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Xu hướng theo kỳ: phòng bạn so với trung bình các phòng khác">
  <polyline class="trend-line own" points="${line(ownSeries)}"/>
  <polyline class="trend-line other" points="${line(avgOtherSeries)}"/>
  ${dots(ownSeries, 'own')}
  ${dots(avgOtherSeries, 'other')}
  ${axis}
</svg>
<p class="legend"><span class="key key-own"></span>Phòng bạn <span class="key key-other"></span>Trung bình các phòng khác</p>`;
}

// ---------------------------------------------------------------- bảng

function deptSummaryTable(deptTotals, ownDept) {
  const head = '<tr><th>#</th><th>Phòng ban</th><th>Số NV</th><th>Tổng YC</th><th>Tổng SL</th><th>TB YC/NV</th></tr>';
  const body = deptTotals.map((d, i) => `<tr class="${d.dept === ownDept ? 'row-own' : ''}">
  <td class="mono">${i + 1}</td>
  <td>${esc(d.dept)}${d.dept === ownDept ? ' <span class="pill own-pill">phòng bạn</span>' : ''}</td>
  <td class="mono">${d.soNv}</td>
  <td class="mono">${d.totalYc}</td>
  <td class="mono">${d.totalSl}</td>
  <td class="mono">${d.soNv ? (d.totalYc / d.soNv).toFixed(1) : '0.0'}</td>
</tr>`).join('\n');
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function topPivotTable(periods, topMap, granularity, n, { showDept } = {}) {
  if (!periods.length) return '<p class="empty">Không có dữ liệu.</p>';
  const head = `<tr><th>Kỳ</th>${Array.from({ length: n }, (_, i) => `<th>Top ${i + 1}</th>`).join('')}</tr>`;
  const body = periods.map((p) => {
    const rows = (topMap.get(p) ?? []).slice(0, n);
    const cells = Array.from({ length: n }, (_, i) => {
      const r = rows[i];
      if (!r) return '<td class="mut">—</td>';
      const dept = showDept ? ` <span class="mono mut">${esc(r.dept)}</span>` : '';
      return `<td>${esc(r.emp)}${dept}<br><span class="mut mono">${r.yc} YC${r.sl != null ? ` · ${r.sl} SL` : ''}</span></td>`;
    }).join('');
    return `<tr><td class="mono">${esc(periodLabel(granularity, p))}</td>${cells}</tr>`;
  }).join('\n');
  return `<table class="pivot"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function empPivotTable(employees, periods, granularity) {
  if (!employees.length) return '<p class="empty">Không có nhân viên nào trong phòng.</p>';
  const sorted = [...employees].sort((a, b) => b.totalYc - a.totalYc);
  const head = `<tr><th>NV</th>${periods.map((p) => `<th>${esc(periodLabel(granularity, p))}</th>`).join('')}<th>Tổng</th><th>TB</th></tr>`;
  const body = sorted.map((e) => {
    const cells = periods.map((p) => `<td class="mono">${e.byPeriod.has(p) ? e.byPeriod.get(p).yc : '—'}</td>`).join('');
    return `<tr><td class="mono">${esc(e.emp)}</td>${cells}<td class="mono"><b>${e.totalYc}</b></td><td class="mono">${e.tbYc.toFixed(1)}</td></tr>`;
  }).join('\n');
  return `<table class="pivot"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

// ---------------------------------------------------------------- dựng trang

export function renderPerformance(payload) {
  const { periods, depts, employees, deptTotals, deptPeriod, topCompanyByPeriod } = aggregate(payload);
  const ownDept = payload.boPhanMinh ?? null;
  const ownRank = ownDept ? deptTotals.findIndex((d) => d.dept === ownDept) + 1 : 0;
  const ownEmployees = ownDept ? employees.filter((e) => e.dept === ownDept) : [];
  const leader = [...employees].sort((a, b) => b.totalYc - a.totalYc)[0] ?? null;
  const tongYc = deptTotals.reduce((s, d) => s + d.totalYc, 0);
  const tongSl = deptTotals.reduce((s, d) => s + d.totalSl, 0);

  const kpi = `<div class="cards">
  <div class="card"><b>${tongYc}</b><span>tổng yêu cầu đã xử lý</span></div>
  <div class="card"><b>${employees.length}</b><span>nhân viên</span></div>
  <div class="card"><b>${depts.length}</b><span>phòng ban</span></div>
  <div class="card ${ownRank === 1 ? '' : ownRank ? 'warn' : ''}"><b>${ownRank ? `#${ownRank}` : '—'}</b><span>hạng phòng bạn / ${depts.length}</span></div>
  <div class="card"><b>${leader ? esc(leader.emp) : '—'}</b><span>dẫn đầu toàn công ty (${leader ? leader.totalYc : 0} YC)</span></div>
</div>`;

  const ownTop5 = ownDept
    ? Array.from(periods.reduce((m, p) => {
        m.set(p, payload.duLieu.filter((d) => d.dept === ownDept && d.period === p)
          .sort((a, b) => (b.yc - a.yc) || ((b.sl ?? 0) - (a.sl ?? 0))));
        return m;
      }, new Map()))
    : [];
  const ownTopMap = new Map(ownTop5);

  const body = [
    kpi,
    section('so-sanh-phong', 'So sánh phòng ban', 'Tổng yêu cầu đã xử lý trong kỳ báo cáo, sắp xếp giảm dần.',
      deptSummaryTable(deptTotals, ownDept) + chartDeptBars(deptTotals, ownDept), deptTotals.length),
    periods.length > 1 ? section('xu-huong', 'Xu hướng theo kỳ',
      'Phòng bạn so với trung bình các phòng còn lại — dùng để theo dõi việc tăng/giảm khối lượng qua thời gian.',
      chartTrend(periods, deptPeriod, ownDept, payload.granularity)) : '',
    section('top5-cong-ty', 'Top 5 toàn công ty theo kỳ', 'Xếp hạng theo số yêu cầu (YC), lấy số lượng (SL) làm tiêu chí phụ.',
      topPivotTable(periods, topCompanyByPeriod, payload.granularity, 5, { showDept: true })),
    ownDept ? section('chi-tiet-phong-minh', `Chi tiết phòng ${esc(ownDept)}`, 'Số yêu cầu từng nhân viên theo kỳ.',
      empPivotTable(ownEmployees, periods, payload.granularity), ownEmployees.length) : '',
    ownDept ? section('top5-phong-minh', `Top 5 trong phòng ${esc(ownDept)} theo kỳ`, '',
      topPivotTable(periods, ownTopMap, payload.granularity, 5)) : '',
  ].filter(Boolean).join('\n\n');

  const ky = payload.granularity === 'tuan' ? 'tuần' : 'tháng';
  const title = `Hiệu suất công việc theo ${ky} · ${fmtDate(payload.ngay_chay)}`;
  const metaLine = `Kỳ báo cáo: ${periods.map((p) => esc(periodLabel(payload.granularity, p))).join(', ')}${ownDept ? ` · phòng bạn: <code>${esc(ownDept)}</code>` : ''} · nguồn: nbphyc + nbctdaumuc (QLDA_APP)`;
  return page(title, metaLine, body);
}

const PERF_CSS = `
.pivot{font-size:12px}
.pivot th,.pivot td{padding:6px 8px}
.mut{color:var(--mut)}
.row-own{background:var(--ok-bg)}
.own-pill{background:var(--primary);color:#fff;font-size:10px;padding:1px 6px;border-radius:99px;font-weight:700}
.bar-dept{fill:var(--xn)} .bar-dept.own{fill:var(--primary)}
.ax-own{font-weight:700;fill:var(--primary)}
.trend-line{fill:none}
.trend-line.own{stroke:var(--primary);stroke-width:2.5}
.trend-line.other{stroke:var(--mut);stroke-width:2;stroke-dasharray:4 3}
.dot.own{fill:var(--primary)} .dot.other{fill:var(--mut)}
.key-own{background:var(--primary)} .key-other{background:var(--mut)}
`;

// Nhúng CSS bổ sung vào ngay trước </style> mà page() đã dựng — page() luôn phát ra đúng
// một khối <style>${CSS}</style> nên chèn tại đó là an toàn và không cần đổi chữ ký page().
function injectCss(html, extraCss) {
  return html.replace('</style>', `${extraCss}</style>`);
}

// ---------------------------------------------------------------- xây artifact

/**
 * Đọc payload hiệu suất → trả mô tả file. KHÔNG ghi đĩa.
 * @returns {{artifact: {relPath, content}|null, errors: string[]}}
 */
export function buildPerformanceReportArtifact(payload) {
  const errors = validatePerformancePayload(payload);
  if (errors.length) return { artifact: null, errors };
  const ngay = String(payload.ngay_chay).slice(0, 10);
  return {
    artifact: {
      relPath: `ledger/_performance/${payload.granularity}-${ngay}.html`,
      content: injectCss(renderPerformance(payload), PERF_CSS),
    },
    errors: [],
  };
}
