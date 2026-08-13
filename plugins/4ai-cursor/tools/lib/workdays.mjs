// workdays.mjs — đếm ngày làm việc theo data/holidays-vn.json.
//
// Luật đếm nằm ở đây, KHÔNG nằm trong đầu người chạy báo cáo: đưa cùng một cặp
// (hôm nay, hạn) vào luôn ra cùng một con số.

import fs from 'node:fs';
import path from 'node:path';
import { HUB } from './assets.mjs';

const HOLIDAYS_REL = path.join('data', 'holidays-vn.json');
const DAY_MS = 86400000;

export function loadHolidays(hub = HUB) {
  const abs = path.join(hub, HOLIDAYS_REL);
  if (!fs.existsSync(abs)) throw new Error(`không tìm thấy ${HOLIDAYS_REL}`);
  const cfg = JSON.parse(fs.readFileSync(abs, 'utf8'));

  const off = new Set();       // ngày nghỉ (lễ, nghỉ bù, hoán đổi)
  const makeup = new Set();    // ngày đi làm bù, thường rơi T7
  const unconfirmed = new Set();
  for (const [year, y] of Object.entries(cfg.years)) {
    for (const d of y.days) {
      off.add(d.date);
      if (!y.confirmed || d.canXacNhan) unconfirmed.add(d.date);
    }
    for (const d of y.makeupWorkdays ?? []) makeup.add(d.date);
    if (!y.confirmed) unconfirmed.add(`year:${year}`);
  }
  return {
    cfg,
    off,
    makeup,
    unconfirmed,
    workingWeekdays: new Set(cfg.workWeek.workingWeekdays),
    countMakeup: !!cfg.countMakeupWorkdays,
    leadWorkingDays: cfg.warning.leadWorkingDays,
    coveredYears: new Set(Object.keys(cfg.years)),
  };
}

/** "2026-08-10" → Date UTC, tránh lệch múi giờ khi cộng ngày. */
function toUtc(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) throw new Error(`ngày không hợp lệ: ${iso}`);
  return new Date(Date.UTC(y, m - 1, d));
}

const isoOf = (dt) => dt.toISOString().slice(0, 10);

/** 1=Thứ Hai … 7=Chủ nhật (khớp cách khai workingWeekdays). */
const weekdayOf = (dt) => dt.getUTCDay() === 0 ? 7 : dt.getUTCDay();

export function isWorkingDay(h, iso) {
  if (h.makeup.has(iso)) return h.countMakeup;
  if (h.off.has(iso)) return false;
  return h.workingWeekdays.has(weekdayOf(toUtc(iso)));
}

/**
 * Số ngày làm việc từ `fromIso` (tính cả hôm đó) đến TRƯỚC `toIso`.
 * Hạn rơi đúng hôm nay → 0. Hạn đã qua → số âm (số ngày làm việc đã trôi qua hạn).
 *
 * Ví dụ: hạn Thứ Hai, hôm nay Thứ Tư tuần trước → 3 (T4, T5, T6).
 */
export function workingDaysUntil(h, fromIso, toIso) {
  const from = toUtc(fromIso);
  const to = toUtc(toIso);
  if (from.getTime() === to.getTime()) return 0;

  const overdue = to < from;
  const [a, b] = overdue ? [to, from] : [from, to];
  let n = 0;
  for (let t = a.getTime(); t < b.getTime(); t += DAY_MS) {
    if (isWorkingDay(h, isoOf(new Date(t)))) n++;
  }
  return overdue ? -n : n;
}

/**
 * Xếp mức cảnh báo cho một hạn.
 * @returns {{muc: 'qua-han'|'sap-toi'|'con-thoi-gian', soNgay: number, lichChuaChot: boolean}}
 */
export function classifyDeadline(h, todayIso, deadlineIso) {
  const soNgay = workingDaysUntil(h, todayIso, deadlineIso);
  const year = String(deadlineIso).slice(0, 4);
  const lichChuaChot = h.unconfirmed.has(`year:${year}`) || !h.coveredYears.has(year);
  const muc = soNgay < 0 ? 'qua-han'
    : soNgay <= h.leadWorkingDays ? 'sap-toi'
    : 'con-thoi-gian';
  return { muc, soNgay, lichChuaChot };
}
