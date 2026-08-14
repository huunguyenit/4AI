#!/usr/bin/env node
// test-graph-scope.mjs — lược đồ v3: scope trong khoá node, và SQL sinh ra phải là upsert có
// giới hạn phạm vi. KHÔNG chạm DB: chỉ soi chuỗi SQL emitSql() trả về.
//
// Điều thật sự được canh ở đây: một lần chạy KHÔNG được xoá dữ liệu ngoài phạm vi của nó.
// Đó là khác biệt sống còn giữa "một người dùng" và "nhiều người dùng chung một DB".

import { loadSchema, loadGraph, validateGraph, emitSql } from '../tools/lib/graph.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

const schema = loadSchema(ROOT);

process.stdout.write('=== 1. LƯỢC ĐỒ v3 ===\n');
ok('sourceOfTruth là database, không còn là file',
  schema.sourceOfTruth.kind === 'database', schema.sourceOfTruth.kind);
ok('JSONL còn lại đúng vai hạt giống', Array.isArray(schema.sourceOfTruth.seed?.layout));
ok('Chiến lược nạp là upsert có phạm vi, không phải full reload',
  schema.sql.reloadStrategy.kind === 'upsert-scoped', schema.sql.reloadStrategy.kind);
ok('Node cấu trúc (Menu/Controller/Table) khai scoped',
  ['Menu', 'Controller', 'Table'].every((k) => schema.nodeKinds[k].scoped === true));
ok('ExperienceFact có mặt và scoped', schema.nodeKinds.ExperienceFact?.scoped === true);
ok('ExperienceFact chỉ nhận UR đã làm xong, gồm cả OK và DT',
  ['HT', 'DT', 'OK', 'UP'].every((s) => schema.nodeKinds.ExperienceFact.trangThaiNguonValues.includes(s))
  && !schema.nodeKinds.ExperienceFact.trangThaiNguonValues.includes('DD'),
  schema.nodeKinds.ExperienceFact.trangThaiNguonValues.join(','));
ok('Cột audit khai một chỗ, không lặp trong từng nodeKind',
  schema.sql.auditColumns.items.join(',') === 'scope,capNhatLuc,capNhatBoi');

process.stdout.write('\n=== 2. KHOÁ MANG SCOPE ===\n');
const g = loadGraph(ROOT, schema);
ok('Hạt giống nạp không lỗi', g.errors.length === 0, g.errors.slice(0, 2).map((e) => e.message).join(' | '));
ok('Validate không lỗi', validateGraph(schema, g).length === 0);

const ctrl = [...g.nodes.values()].filter((n) => n.kind === 'Controller');
ok('Controller không khai scope -> mặc định system', ctrl.every((n) => n.scope === 'system'));
ok('Khoá đầy đủ có tiền tố scope', ctrl.every((n) => n._key.startsWith('system|')),
  ctrl[0]?._key);
ok('Khoá tự nhiên vẫn giữ riêng', ctrl.every((n) => !n._keyTuNhien.includes('|')));

// Node không scoped (Status là lookup dùng chung) giữ khoá trần.
const st = [...g.nodes.values()].find((n) => n.kind === 'Status');
ok('Node không scoped giữ khoá trần', st && !st._key.includes('|'), st?._key);

// Cạnh viết theo kiểu cũ (`Controller:CDTran`) vẫn phân giải được — hạt giống không phải sửa tay.
ok('Tham chiếu cạnh không ghi scope vẫn trỏ đúng node',
  g.edges.every((e) => g.nodes.has(e.from) && g.nodes.has(e.to)));

process.stdout.write('\n=== 3. SQL SINH RA — KHÔNG ĐƯỢC ĐỤNG DỮ LIỆU NGOÀI PHẠM VI ===\n');
const sql = emitSql(schema, g, { boi: 'TESTER' });

ok('KHÔNG có DELETE toàn bảng', !/DELETE FROM dbo\.\[node_\w+\];/.test(sql));
ok('Dùng MERGE thay vì INSERT trần', sql.includes('MERGE dbo.[node_Controller]'));
ok('Mọi phép xoá node đều kèm điều kiện scope',
  sql.split('\n').filter((l) => l.startsWith('DELETE t FROM'))
    .every((_, i, arr) => arr.length > 0)
  && (sql.match(/DELETE t FROM/g) ?? []).length === (sql.match(/WHERE t\.\[scope\] IN/g) ?? []).length,
  `${(sql.match(/DELETE t FROM/g) ?? []).length} DELETE / ${(sql.match(/WHERE t\.\[scope\] IN/g) ?? []).length} có scope`);

// Bài kiểm quan trọng nhất: hạt giống chỉ có 3 loại cạnh, KHÔNG được xoá 9 loại còn lại.
const loaiCoTrongHatGiong = [...new Set(g.edges.map((e) => e.type))];
ok('Chỉ xoá loại cạnh có dữ liệu dựng lại trong lần chạy này',
  loaiCoTrongHatGiong.every((t) => sql.includes(`DELETE e FROM dbo.[${t}]`)),
  loaiCoTrongHatGiong.join(','));
ok('KHÔNG xoá loại cạnh mà lần chạy này không có (nếu không sẽ mất dữ liệu tầng dự án)',
  !sql.includes('DELETE e FROM dbo.[BELONGS_TO]')
  && !sql.includes('DELETE e FROM dbo.[HAS_PM_REVIEW]'));

process.stdout.write('\n=== 4. DI TRÚ TỪ LƯỢC ĐỒ CŨ ===\n');
ok('Có bổ sung cột thiếu cho bảng đã tồn tại', sql.includes("IF COL_LENGTH('dbo.node_Controller', 'scope') IS NULL"));
ok('Đổi khoá bằng UPDATE tại chỗ, KHÔNG xoá-rồi-chèn (giữ $node_id để cạnh không đứt)',
  /UPDATE dbo\.\[node_Controller\] SET \[sysid\] = N'system\|' \+ \[sysid\]/.test(sql));
ok('Di trú idempotent nhờ WHERE scope IS NULL',
  (sql.match(/WHERE \[scope\] IS NULL;/g) ?? []).length === Object.keys(schema.nodeKinds).length);

process.stdout.write('\n=== 5. TẤT ĐỊNH + AUDIT ===\n');
ok('Dấu thời gian dùng hàm SQL, không phải giờ máy client (giữ file tất định)',
  sql.includes('SYSUTCDATETIME()') && !/20\d\d-\d\d-\d\dT/.test(sql));
ok('Chạy hai lần cho chuỗi giống hệt', emitSql(schema, g, { boi: 'TESTER' }) === sql);
ok('Ghi người chạy vào cột audit', sql.includes("N'TESTER'"));
ok('Chia lô 1000 dòng để không vượt giới hạn table value constructor của SQL Server',
  sql.includes('CREATE TABLE #src_Status'));

process.stdout.write('\n=== 6. CODEPAGE ĐƯỜNG GHI — TIẾNG VIỆT KHÔNG ĐƯỢC HỎNG ===\n');
// Bug thật đã xảy ra: `graph push` đưa script qua `sqlcmd -i <file>`, mà sqlcmd đọc file theo
// codepage ANSI của máy chứ không phải UTF-8. Thiếu `i:65001` thì "Giấy báo nợ" vào DB thành
// "Giáº¥y bÃ¡o ná»£" — sqlcmd vẫn trả exit 0, hỏng hoàn toàn im lặng. Canh ở mức nguồn vì
// không có DB thì không dựng lại được ca này trong test.
const sqlSrc = fs.readFileSync(path.join(ROOT, 'mcp', 'fbo', 'lib', 'sql.mjs'), 'utf8');
const khoiPush = sqlSrc.slice(sqlSrc.indexOf('export function runGraphScript'));
ok('runGraphScript đặt codepage ĐẦU VÀO 65001 (không chỉ đầu ra)',
  /'-f',\s*'i:65001,o:65001'/.test(khoiPush));
ok('Script nạp được ghi UTF-8 — writer.mjs cưỡng chế, không BOM',
  !emitSql(schema, g, { boi: 'T' }).startsWith('﻿'));

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures ? `${failures} thất bại` : 'TẤT CẢ PASS (0 thất bại)'} ===\n`);
process.exit(failures ? 1 : 0);
