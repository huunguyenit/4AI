#!/usr/bin/env node
// test-sql-conn.mjs — QLDA lấy kết nối CHỈ từ env/qlda.local.json (không còn chốt cuối
// Web.config); chương trình KHÁCH thì ngược lại, luôn đọc Web.config của chính nó và không
// phải khai gì trước. Không chạm DB, không dùng chuỗi kết nối thật.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';


// Trỏ data root vào thư mục tạm TRƯỚC khi nạp sql.mjs: máy dev có thể đã khai chuỗi kết nối
// thật trong data/qlda.local.json, để nguyên thì test đo trạng thái máy chứ không đo code.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '4ai-conn-'));
// Cả HAI gốc: state root là nơi cấu hình thật sự được đọc/ghi, và mặc định của nó là thư mục
// người dùng (%APPDATA%\4ai). Chỉ trỏ FBO_DATA_ROOT thì test ghi đè cấu hình THẬT của máy dev.
process.env.FBO_DATA_ROOT = tmp;
process.env.FBO_STATE_ROOT = tmp;
const { nguonKetNoi, redact } = await import('../mcp/fbo/lib/sql.mjs');

// `data/qlda.json` chỉ giữ TOKEN `{QldaProgramPath}` (gói phân phối công khai không mang
// đường dẫn share nội bộ) — test tự khai đường dẫn giả vào qlda.local.json, đúng như máy
// thật làm qua `4ai setup`. Nhờ vậy test cũng bao luôn nhánh "chưa khai thì không nhận QLDA".
const QLDA = String.raw`\\test-share\FastPro$\QLDA\Src-Onl`;
const KHACH = String.raw`\\test-share\CustomerPro\FBI\DEMO\FBISP2422`;

/** Ghi qlda.local.json cho data root tạm — luôn kèm qldaProgramPath. */
const ghiLocal = (them = {}) => {
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'data', 'qlda.local.json'),
    JSON.stringify({ qldaProgramPath: QLDA, ...them }));
};

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

process.stdout.write('=== chưa khai qldaProgramPath: KHÔNG program nào bị nhận là QLDA ===\n');
// Token chưa được gán = chưa biết QLDA nằm đâu. Phải rớt về Web.config chứ không được khớp
// bừa — khớp nhầm là chạy câu SQL của khách trên DB nội bộ công ty.
ok('Chưa khai -> Web.config', nguonKetNoi(QLDA, 'app') === 'Web.config');

process.stdout.write('\n=== chưa khai kết nối: BÁO chưa khai, KHÔNG rớt về Web.config ===\n');
// Đây là điểm đổi hành vi: QLDA chỉ còn env + qlda.local.json. Rớt về Web.config nghe thì
// tiện, nhưng nó chạy được trên một server KHÁC mà vẫn ra số — hỏng kiểu không ai nhận ra.
ghiLocal();
ok('QLDA app chưa khai -> chưa khai', nguonKetNoi(QLDA, 'app') === 'chưa khai', nguonKetNoi(QLDA, 'app'));
ok('QLDA sys chưa khai -> chưa khai', nguonKetNoi(QLDA, 'sys') === 'chưa khai', nguonKetNoi(QLDA, 'sys'));

process.stdout.write('\n=== khai ở qlda.local.json: đứng sau env, và chỉ cho ĐÚNG leg đã khai ===\n');
ghiLocal({ appConnectionString: 'Data Source=L;Initial Catalog=TEST_APP' });
ok('Có local, chưa có env -> qlda.local.json', nguonKetNoi(QLDA, 'app') === 'qlda.local.json');
ok('Leg sys chưa khai KHÔNG ăn theo leg app', nguonKetNoi(QLDA, 'sys') === 'chưa khai', nguonKetNoi(QLDA, 'sys'));

process.stdout.write('\n=== khai env: env THẮNG local ===\n');
process.env.QLDA_APP_CONNECTION = 'Data Source=X;Initial Catalog=TEST_APP;Integrated Security=SSPI';
ok('QLDA app -> env', nguonKetNoi(QLDA, 'app') === 'env');
ok('Chưa khai env sys thì leg sys vẫn là chưa khai',
  nguonKetNoi(QLDA, 'sys') === 'chưa khai', nguonKetNoi(QLDA, 'sys'));
process.env.QLDA_SYS_CONNECTION = 'Data Source=X;Initial Catalog=TEST_SYS;Integrated Security=SSPI';
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
  !/Data Source|Integrated Security|TEST_APP|TEST_SYS/i.test(nguon), nguon);
ok('redact bịt password', redact('Server=a;User Id=sa;Password=p@ss;').includes('Password=***'));
ok('redact bịt user + server',
  redact('Data Source=SRV;User Id=sa;').includes('User Id=***')
  && redact('Data Source=SRV;').includes('Data Source=***'));

donDep();
fs.rmSync(tmp, { recursive: true, force: true });
process.stdout.write(`\n=== TEST KẾT THÚC: ${failures ? `${failures} thất bại` : 'TẤT CẢ PASS (0 thất bại)'} ===\n`);
process.exit(failures ? 1 : 0);
