#!/usr/bin/env node
// test-sql-conn.mjs — QLDA lấy kết nối từ env/qlda.local.json; chương trình KHÁCH vẫn đọc
// Web.config. Không chạm DB, không dùng chuỗi kết nối thật.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nguonKetNoi, redact } from '../mcp/fbo/lib/sql.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QLDA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'qlda.json'), 'utf8')).databases.qlda.path;
const KHACH = String.raw`\\10.0.0.1\CustomerPro\FBI\DEMO1\FBISP2422`;

let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

const envCu = { app: process.env.QLDA_APP_CONNECTION, sys: process.env.QLDA_SYS_CONNECTION };
const donDep = () => {
  if (envCu.app === undefined) delete process.env.QLDA_APP_CONNECTION;
  else process.env.QLDA_APP_CONNECTION = envCu.app;
  if (envCu.sys === undefined) delete process.env.QLDA_SYS_CONNECTION;
  else process.env.QLDA_SYS_CONNECTION = envCu.sys;
};
delete process.env.QLDA_APP_CONNECTION;
delete process.env.QLDA_SYS_CONNECTION;

process.stdout.write('=== chưa khai env: rớt về Web.config (bước cuối resolveOrder) ===\n');
// Máy hiện tại chưa khai gì — hành vi phải y hệt trước khi có tính năng này.
ok('QLDA app -> Web.config', nguonKetNoi(QLDA, 'app') === 'Web.config');
ok('QLDA sys -> Web.config', nguonKetNoi(QLDA, 'sys') === 'Web.config');

process.stdout.write('\n=== khai env: QLDA đi theo env ===\n');
process.env.QLDA_APP_CONNECTION = 'Data Source=X;Initial Catalog=QLDA_APP;Integrated Security=SSPI';
ok('QLDA app -> env', nguonKetNoi(QLDA, 'app') === 'env');
ok('Chưa khai env sys thì leg sys KHÔNG ăn theo leg app',
  nguonKetNoi(QLDA, 'sys') === 'Web.config', nguonKetNoi(QLDA, 'sys'));
process.env.QLDA_SYS_CONNECTION = 'Data Source=X;Initial Catalog=QLDA_SYS;Integrated Security=SSPI';
ok('QLDA sys -> env', nguonKetNoi(QLDA, 'sys') === 'env');

process.stdout.write('\n=== chương trình KHÁCH vẫn phải đọc Web.config ===\n');
// Đây là điểm dễ hỏng nhất: mỗi khách một server/database riêng. Lấy nhầm kết nối QLDA
// nghĩa là chạy câu SQL của khách này trên DB nội bộ công ty.
ok('Program khách -> Web.config dù env QLDA đang khai',
  nguonKetNoi(KHACH, 'app') === 'Web.config');
ok('Program khách leg sys -> Web.config', nguonKetNoi(KHACH, 'sys') === 'Web.config');

process.stdout.write('\n=== so đường dẫn không phân biệt hoa thường / gạch ===\n');
ok('Gạch thừa ở cuối vẫn nhận ra QLDA', nguonKetNoi(QLDA + '\\', 'app') === 'env');
ok('Viết hoa thường khác vẫn nhận ra QLDA', nguonKetNoi(QLDA.toUpperCase(), 'app') === 'env');
ok('Gạch xuôi vẫn nhận ra QLDA', nguonKetNoi(QLDA.replace(/\\/g, '/'), 'app') === 'env');
ok('Đường dẫn rỗng KHÔNG bị nhận nhầm là QLDA', nguonKetNoi('', 'app') === 'Web.config');

process.stdout.write('\n=== không rò rỉ chuỗi kết nối ===\n');
const nguon = [nguonKetNoi(QLDA, 'app'), nguonKetNoi(QLDA, 'sys'), nguonKetNoi(KHACH, 'app')].join(' ');
ok('nguonKetNoi chỉ trả tên nguồn, không trả giá trị',
  !/Data Source|Integrated Security|QLDA_APP|QLDA_SYS/i.test(nguon), nguon);
ok('redact bịt password', redact('Server=a;User Id=sa;Password=p@ss;').includes('Password=***'));
ok('redact bịt user + server',
  redact('Data Source=SRV;User Id=sa;').includes('User Id=***')
  && redact('Data Source=SRV;').includes('Data Source=***'));

donDep();
process.stdout.write(`\n=== TEST KẾT THÚC: ${failures ? `${failures} thất bại` : 'TẤT CẢ PASS (0 thất bại)'} ===\n`);
process.exit(failures ? 1 : 0);
