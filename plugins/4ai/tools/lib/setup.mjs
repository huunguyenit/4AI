// setup.mjs — khai báo cấu hình cục bộ (danh tính PM + chuỗi kết nối) và chẩn đoán runtime.
//
// VÌ SAO LÀ CLI CHỨ KHÔNG PHẢI MCP TOOL: chuỗi kết nối truyền qua tool argument sẽ nằm lại
// trong context của model và trong transcript phiên chat. Cả `sql.mjs` được viết quanh nguyên
// tắc "chuỗi kết nối không rời khỏi module", `4ai check` thì quét secret lọt vào repo — đưa nó
// qua model là phá chính hàng rào đó. Ở đây người dùng gõ trong terminal của họ, giá trị đi
// thẳng vào file, model chỉ biết ĐÃ KHAI hay CHƯA chứ không bao giờ thấy giá trị.
//
// Mọi thứ in ra màn hình đều là TÊN KHOÁ và TRẠNG THÁI, không bao giờ là giá trị.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { stateFile } from '../../mcp/fbo/lib/index.mjs';
import { licenseStatus } from '../../mcp/fbo/lib/license.mjs';
import { findSqlcmd, nguonKetNoi } from '../../mcp/fbo/lib/sql.mjs';
import { loadQldaConfig, isPmPlaceholder } from '../../src/database/qlda-metadata.mjs';

/** Khoá bí mật được phép khai — tên khoá khớp `databases.*.connectionKey` ở qlda.json. */
export const KHOA_BI_MAT = [
  { key: 'appConnectionString', env: 'QLDA_APP_CONNECTION', mo_ta: 'DB nghiệp vụ QLDA (nbdmda, nbphyc…)' },
  { key: 'sysConnectionString', env: 'QLDA_SYS_CONNECTION', mo_ta: 'DB hệ thống QLDA (userinfo2…)' },
  // Từ lược đồ v3, đồ thị SỐNG trong DB (không còn là chỉ mục dựng lại được từ JSONL) nên
  // đây không còn là tuỳ chọn — thiếu nó thì `graph push` và mọi tra cứu đồ thị đều không chạy.
  { key: 'graphConnectionString', env: 'GRAPH_4AI_CONNECTION', mo_ta: 'DB đồ thị 4AI (bắt buộc — đồ thị sống ở đây)' },
];

/**
 * Định danh hạ tầng nội bộ — KHÔNG phải credential, nhưng cũng KHÔNG được nằm trong repo:
 * `data/qlda.json` đi kèm gói phân phối công khai (Cursor Marketplace), nên tên database và
 * đường dẫn share nội bộ của công ty phải do từng máy tự khai. qlda.json chỉ giữ TOKEN
 * `{Ten}`; qlda-metadata.mjs gán giá trị thật từ đây lúc chạy.
 *
 * Khác KHOA_BI_MAT ở chỗ: không có biến env tương đương, và HIỆN được giá trị lên màn hình
 * (tên DB không phải secret theo nghĩa credential — chỉ là thứ không nên công khai).
 */
export const KHOA_CAU_TRUC = [
  { key: 'qldaDatabaseName', token: '{QldaDatabaseName}', ref: 'databases.qlda.databaseName',
    mo_ta: 'Tên DB nghiệp vụ QLDA (nbdmda, nbphyc…)' },
  { key: 'qldaSysDatabaseName', token: '{QldaSysDatabaseName}', ref: 'databases.qlda.sysDatabaseName',
    mo_ta: 'Tên DB hệ thống QLDA (userinfo2…)' },
  { key: 'qldaProgramPath', token: '{QldaProgramPath}', ref: 'databases.qlda.path',
    mo_ta: 'Đường dẫn program QLDA — dùng để phân biệt QLDA với chương trình khách' },
  { key: 'graph4aiDatabaseName', token: '{Graph4aiDatabaseName}', ref: 'databases.graph4ai.databaseName',
    mo_ta: 'Tên DB đồ thị 4AI (bỏ trống nếu chuỗi kết nối đã khai Initial Catalog)' },
  { key: 'attachmentsFileStoreRoot', token: '{AttachmentsFileStoreRoot}', ref: 'attachments.fileStore.root',
    mo_ta: 'Share chứa file đính kèm (chỉ cần khi đọc tài liệu khảo sát)' },
];

/**
 * Đường dẫn file cấu hình cục bộ. Chạy như plugin thì nằm ở thư mục trạng thái cấp NGƯỜI DÙNG
 * (`%APPDATA%\4ai` trên Windows), không phải `${CLAUDE_PLUGIN_DATA}` — xem `stateRoot()`.
 */
export function duongDanLocal(hub) {
  return stateFile(hub, 'data', 'qlda.local.json');
}

function docLocal(file) {
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) ?? {}; } catch { return {}; }
}

/**
 * Trạng thái cấu hình — CHỈ tên khoá và có/không, không bao giờ kèm giá trị.
 * @returns {{file, coFile, pm, biMat: Array, sqlcmd, node, nguonQlda, qldaPath}}
 */
export function chanDoan(hub) {
  const file = duongDanLocal(hub);
  const local = docLocal(file);
  const cfg = loadQldaConfig(hub);
  const qldaPath = cfg?.databases?.qlda?.path ?? '';
  const pmCfg = cfg?.review?.pm ?? {};

  return {
    file,
    coFile: fs.existsSync(file),
    pm: {
      maNv: isPmPlaceholder(pmCfg.maNv) ? '' : String(pmCfg.maNv).trim(),
      boPhanLt: isPmPlaceholder(pmCfg.boPhanLt) ? '' : String(pmCfg.boPhanLt).trim(),
    },
    biMat: KHOA_BI_MAT.map((k) => ({
      ...k,
      coEnv: Boolean(String(process.env[k.env] ?? '').trim()),
      coLocal: typeof local[k.key] === 'string' && local[k.key].trim() !== '',
    })),
    cauTruc: KHOA_CAU_TRUC.map((k) => ({
      ...k,
      // Giá trị đã gán (qlda.json + overlay local). Còn nguyên token = chưa khai trên máy này.
      giaTri: (() => {
        const v = k.key === 'attachmentsFileStoreRoot'
          ? cfg?.attachments?.fileStore?.root
          : k.ref.split('.').reduce((o, seg) => o?.[seg], cfg);
        return isPmPlaceholder(v) ? '' : String(v).trim();
      })(),
    })),
    sqlcmd: findSqlcmd(),
    node: process.version,
    // Trạng thái giấy phép — chỉ Device ID và tình trạng, không bao giờ kèm chữ ký.
    giayPhep: licenseStatus(hub),
    qldaPath,
    nguonQlda: qldaPath ? { app: nguonKetNoi(qldaPath, 'app'), sys: nguonKetNoi(qldaPath, 'sys') } : null,
  };
}

const dau = (b) => (b ? '✓' : '·');

/** In chẩn đoán ra stdout. Không in giá trị bí mật — chỉ tên khoá và trạng thái. */
export function inChanDoan(d, write = (s) => process.stdout.write(s)) {
  write('\nCấu hình cục bộ\n');
  write(`  Node            ${d.node}\n`);
  write(`  sqlcmd          ${d.sqlcmd ? `✓ ${d.sqlcmd}` : '✗ không tìm thấy — cài ODBC Client SDK, hoặc đặt env FBO_SQLCMD'}\n`);
  write(`  File cấu hình   ${d.file}${d.coFile ? '' : '  (chưa có)'}\n`);

  write('\nDanh tính PM\n');
  write(`  ${dau(Boolean(d.pm.maNv))} maNv          ${d.pm.maNv || '(chưa khai)'}\n`);
  write(`  ${dau(Boolean(d.pm.boPhanLt))} boPhanLt      ${d.pm.boPhanLt || '(chưa khai)'}\n`);

  write('\nĐịnh danh hạ tầng nội bộ  (qlda.json chỉ giữ token — giá trị thật khai ở máy này)\n');
  for (const k of d.cauTruc) {
    write(`  ${dau(Boolean(k.giaTri))} ${k.key.padEnd(25)} ${k.giaTri || '(chưa khai — còn token ' + k.token + ')'}\n`);
  }

  write('\nChuỗi kết nối  (chỉ hiện ĐÃ KHAI hay CHƯA — không bao giờ in giá trị)\n');
  for (const k of d.biMat) {
    const nguon = k.coEnv ? 'env' : k.coLocal ? 'qlda.local.json' : '(chưa khai)';
    write(`  ${dau(k.coEnv || k.coLocal)} ${k.key.padEnd(21)} ${nguon.padEnd(16)} ${k.mo_ta}\n`);
  }

  if (d.nguonQlda) {
    write('\nQLDA đang lấy kết nối từ\n');
    write(`  app             ${d.nguonQlda.app}\n`);
    write(`  sys             ${d.nguonQlda.sys}\n`);
    if (d.nguonQlda.app === 'Web.config' || d.nguonQlda.sys === 'Web.config') {
      write(`  ↳ Web.config nghĩa là phải với tới share ${d.qldaPath} mỗi lần truy vấn.\n`);
      write('    Khai env hoặc qlda.local.json thì không cần share đó nữa.\n');
    }
  }

  const gp = d.giayPhep;
  const chuaCapPhep = !gp.ok && !gp.sourceHub;
  write('\nGiấy phép\n');
  write(`  Device ID       ${gp.deviceId}  (${gp.deviceIdSource})\n`);
  write(`  ${dau(gp.ok || gp.sourceHub)} Trạng thái    ${gp.sourceHub && !gp.ok ? 'chạy từ mã nguồn hub — không cần giấy phép' : `${gp.state} · ${gp.message}`}\n`);
  if (chuaCapPhep) {
    write(`  ↳ Gửi Device ID trên cho Fast Source, nhận file .json rồi:\n`);
    write('    node tools/4ai.mjs license import <đường-dẫn-file.json>\n');
  }

  const thieu = !d.pm.maNv || !d.pm.boPhanLt || !d.sqlcmd || chuaCapPhep;
  write(thieu
    ? '\nCòn thiếu — chạy `node tools/4ai.mjs setup` để khai.\n\n'
    : '\nĐủ để chạy `report` và các tool tra cứu.\n\n');
  return thieu ? 1 : 0;
}

// ---------------------------------------------------------------- hỏi đáp

/**
 * Hỏi một câu, KHÔNG hiện lại thứ người dùng gõ.
 *
 * readline không có sẵn chế độ ẩn nên phải chặn `_writeToOutput` — API nội bộ của Node. Nếu
 * bản Node nào đó bỏ nó đi thì thà BÁO RÕ là sẽ hiện rõ chữ rồi hỏi tiếp, còn hơn âm thầm in
 * chuỗi kết nối ra màn hình (rồi nằm lại trong scrollback và log của terminal).
 */
function hoiAn(rl, cauHoi, write) {
  return new Promise((resolve) => {
    const goc = rl._writeToOutput;
    if (typeof goc !== 'function') {
      write('  (!) Bản Node này không ẩn được ký tự — chữ bạn gõ sẽ hiện rõ trên màn hình.\n');
      rl.question(cauHoi, resolve);
      return;
    }
    rl._writeToOutput = function (s) { if (s.includes(cauHoi)) goc.call(rl, s); };
    rl.question(cauHoi, (a) => {
      rl._writeToOutput = goc;
      rl.output.write('\n');
      resolve(a);
    });
  });
}

const hoi = (rl, cauHoi) => new Promise((resolve) => rl.question(cauHoi, resolve));

/**
 * Trộn giá trị mới vào file cấu hình rồi ghi. Tách khỏi phần hỏi đáp để test được mà không
 * cần terminal thật — và để chỗ quyết định "bỏ trống thì giữ nguyên" chỉ nằm đúng một nơi.
 *
 * @param {{maNv?: string, boPhanLt?: string, biMat?: Object, cauTruc?: Object}} gt - bỏ trống = giữ giá trị cũ
 * @returns {{file: string, daKhai: string[]}} `daKhai` là TÊN KHOÁ, không kèm giá trị
 */
export function ghiLocal(hub, gt = {}) {
  const file = duongDanLocal(hub);
  const cu = docLocal(file);
  const maNv = String(gt.maNv ?? '').trim();
  const boPhanLt = String(gt.boPhanLt ?? '').trim();

  const next = { ...cu };
  if (maNv || boPhanLt) {
    next.pm = { ...cu.pm, ...(maNv ? { maNv } : {}), ...(boPhanLt ? { boPhanLt } : {}) };
  }
  const daKhai = [];
  for (const k of KHOA_BI_MAT) {
    const v = String(gt.biMat?.[k.key] ?? '').trim();
    if (!v) continue;
    next[k.key] = v;
    daKhai.push(k.key);
  }
  for (const k of KHOA_CAU_TRUC) {
    const v = String(gt.cauTruc?.[k.key] ?? '').trim();
    if (!v) continue;
    next[k.key] = v;
    daKhai.push(k.key);
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return { file, daKhai };
}

/**
 * Chạy khai báo tương tác. Bỏ trống một mục = GIỮ NGUYÊN giá trị cũ, không xoá — người dùng
 * chạy lại setup chỉ để sửa một mục thì không được mất ba mục kia.
 */
export async function chaySetup(hub, { write = (s) => process.stdout.write(s) } = {}) {
  const d = chanDoan(hub);
  const file = d.file;

  // Không phải terminal thật thì KHÔNG hỏi: readline trên pipe sẽ dội nguyên input ra màn hình
  // (mất tác dụng che), và không có gì che được chuỗi kết nối trong log của CI. Đường
  // không-tương-tác đã có sẵn và an toàn hơn: biến môi trường.
  if (!process.stdin.isTTY) {
    write('\n`setup` cần chạy trong terminal thật (stdin hiện không phải TTY).\n');
    write(`  Cách khác: khai biến môi trường — ${KHOA_BI_MAT.map((k) => k.env).join(', ')}\n`);
    write(`  Hoặc sửa tay: ${file}\n\n`);
    return 1;
  }

  write('\n4AI — khai báo cấu hình cục bộ\n');
  write(`  Ghi vào: ${file}\n`);
  write('  File này đã gitignore. Bỏ trống một mục = giữ nguyên giá trị đang có.\n');
  write('  Giá trị bạn gõ KHÔNG đi qua model AI — nó vào thẳng file trên máy bạn.\n\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    const maNv = (await hoi(rl, `Mã nhân viên PM${d.pm.maNv ? ` [${d.pm.maNv}]` : ''}: `)).trim();
    const boPhan = (await hoi(rl, `Bộ phận lập trình${d.pm.boPhanLt ? ` [${d.pm.boPhanLt}]` : ''}: `)).trim();

    write('\nChuỗi kết nối — bỏ trống để bỏ qua. Ký tự gõ vào sẽ KHÔNG hiện lên màn hình.\n');
    write('Khai ở đây thì không cần với tới share chứa QLDA nữa.\n');
    const biMat = {};
    for (const k of KHOA_BI_MAT) {
      const daCo = d.biMat.find((x) => x.key === k.key);
      if (daCo?.coEnv) {
        write(`  ${k.key}: đã có ở env ${k.env} — bỏ qua.\n`);
        continue;
      }
      const v = (await hoiAn(rl, `  ${k.key}${daCo?.coLocal ? ' [đã khai]' : ''}: `, write)).trim();
      if (v) biMat[k.key] = v;
    }

    write('\nĐịnh danh hạ tầng nội bộ — bỏ trống để giữ nguyên. Hiện rõ trên màn hình (không\n');
    write('phải credential), nhưng KHÔNG nằm trong repo vì gói plugin là bản phân phối công khai.\n');
    const cauTruc = {};
    for (const k of KHOA_CAU_TRUC) {
      const daCo = d.cauTruc.find((x) => x.key === k.key);
      const nhan = daCo?.giaTri ? ` [${daCo.giaTri}]` : '';
      const v = (await hoi(rl, `  ${k.key}${nhan}: `)).trim();
      if (v) cauTruc[k.key] = v;
    }

    if (maNv && isPmPlaceholder(maNv)) {
      write('\n(!) maNv trông giống token mẫu dạng {Ten} — nhập mã nhân viên thật, không phải placeholder.\n');
    }

    const { file: daGhi } = ghiLocal(hub, { maNv, boPhanLt: boPhan, biMat, cauTruc });
    write(`\nĐã ghi ${daGhi}\n`);
    // In lại trạng thái để người dùng thấy kết quả — vẫn chỉ tên khoá, không giá trị.
    inChanDoan(chanDoan(hub), write);
    return 0;
  } finally {
    rl.close();
  }
}
