// ledger-audit.mjs — audit cơ khí cho ledger/: entry Xong phải có dòng CHANGELOG tương ứng,
// biên bản handover phải đủ 4 mục và Rollback không để trống.
//
// Đây là phần của checklist `pm-release-auditor` kiểm được bằng pattern-matching thuần —
// không cần phán đoán ngữ nghĩa. Agent vẫn cần cho phần còn lại: "Khách cần verify" viết
// cụ thể hay chung chung, rollback có thực sự khả thi hay chỉ viết cho có.

import fs from 'node:fs';
import path from 'node:path';
import { readText, toPosix } from './assets.mjs';

const ENTRY_HEADER_RE = /^## (\S+) — (.+)$/;
const FIELD_RE = /^- (Program|Controller|Trạng thái|Ngày mở|Ghi chú): ?(.*)$/;
const REQUIRED_HANDOVER_SECTIONS = ['Thay đổi', 'Rollback', 'Khách cần verify', 'Hỗ trợ cần biết'];

function parseTasksMd(text) {
  const lines = text.split('\n');
  const entries = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i].match(ENTRY_HEADER_RE);
    if (header) {
      if (current) entries.push(current);
      current = { code: header[1], title: header[2], line: i + 1, fields: {} };
      continue;
    }
    if (current) {
      const field = lines[i].match(FIELD_RE);
      if (field) current.fields[field[1]] = field[2].trim();
    }
  }
  if (current) entries.push(current);
  return entries;
}

/** Entry `Xong` có dòng changelog chứa cùng mã khách không (rule pm-ledger-discipline). */
function auditTasksVsChangelog({ hub }) {
  const errors = [];
  const warnings = [];
  const tasksPath = path.join(hub, 'ledger', 'tasks.md');
  if (!fs.existsSync(tasksPath)) return { errors, warnings };

  const entries = parseTasksMd(readText(tasksPath));
  const changelogPath = path.join(hub, 'ledger', 'CHANGELOG.md');
  const changelogLines = fs.existsSync(changelogPath)
    ? readText(changelogPath).split('\n').filter((l) => l.trimStart().startsWith('- '))
    : [];

  for (const e of entries) {
    const trangThai = e.fields['Trạng thái'];
    if (!trangThai) {
      warnings.push({ file: 'ledger/tasks.md', line: e.line,
        message: `entry \`${e.code} — ${e.title}\` thiếu field Trạng thái` });
      continue;
    }
    if (trangThai === 'Xong' && !changelogLines.some((l) => l.includes(e.code))) {
      errors.push({ file: 'ledger/tasks.md', line: e.line,
        message: `entry \`${e.code} — ${e.title}\` ở trạng thái Xong nhưng không thấy dòng tương ứng trong ledger/CHANGELOG.md (rule pm-ledger-discipline)` });
    }
  }
  return { errors, warnings };
}

/** Biên bản handover đủ 4 mục, Rollback không để trống (skill pm-release-handover). */
function auditHandovers({ hub }) {
  const errors = [];
  const warnings = [];
  const dir = path.join(hub, 'ledger', 'handover');
  if (!fs.existsSync(dir)) return { errors, warnings };

  for (const rel of fs.globSync('**/*.md', { cwd: dir })) {
    const abs = path.join(dir, rel);
    const display = `ledger/handover/${toPosix(rel)}`;
    const text = readText(abs);
    const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());

    for (const req of REQUIRED_HANDOVER_SECTIONS) {
      if (!sections.includes(req)) {
        errors.push({ file: display, line: 0, message: `thiếu mục bắt buộc \`## ${req}\`` });
      }
    }
    const rollback = text.match(/^## Rollback\n([\s\S]*?)(?=\n## |\n?$)/m);
    if (rollback && !rollback[1].trim()) {
      errors.push({ file: display, line: 0,
        message: 'mục `## Rollback` để trống — phải ghi rõ, kể cả "không rollback được"' });
    }
  }
  return { errors, warnings };
}

export function auditLedger({ hub }) {
  const a = auditTasksVsChangelog({ hub });
  const b = auditHandovers({ hub });
  return { errors: [...a.errors, ...b.errors], warnings: [...a.warnings, ...b.warnings] };
}
