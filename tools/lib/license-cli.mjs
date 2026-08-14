// license-cli.mjs — mặt dòng lệnh của giấy phép: xem trạng thái, kích hoạt, và (phía Fast
// Source) sinh khoá + cấp giấy phép.
//
// Format giấy phép KHÔNG định nghĩa ở đây — mọi thứ về payload và chữ ký nằm ở
// `mcp/fbo/lib/license.mjs`. File này chỉ lo đường dẫn, đọc/ghi file và in ra màn hình.
//
// Vì sao `issue`/`keygen` nằm chung một CLI với `status`/`import`: gói phân phối chép nguyên
// cây `tools/`, nên hai lệnh này cũng đi theo gói. Vô hại — thứ giữ bí mật là PRIVATE KEY,
// không phải đoạn mã ký. Máy khách không có private key thì `issue` không cấp được gì.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  deviceId, deviceFingerprint, licenseStatus, saveLicense, licensePath,
  publicKeysPath, generateSigningKey, signLicense, normalizeDeviceId,
  PRODUCT, LICENSE_VERSION,
} from '../../mcp/fbo/lib/license.mjs';

const out = (s) => process.stdout.write(s);

/** Thư mục khoá ký của máy phát hành — NGOÀI repo, để không bao giờ lọt vào commit. */
export function thuMucKhoa() {
  return process.env.FBO_LICENSE_KEY_DIR || path.join(os.homedir(), '.4ai', 'keys');
}

function duongDanKhoa(kid) {
  return path.join(thuMucKhoa(), `license-${kid}.pem`);
}

function ngayHomNay() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function congNgay(soNgay) {
  const d = new Date();
  d.setDate(d.getDate() + Number(soNgay));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------------------------------------------------------- status / id

export function cmdStatus(hub) {
  const st = licenseStatus(hub);
  out('\nGiấy phép 4AI\n');
  out(`  Device ID       ${st.deviceId}\n`);
  out(`  Nhận diện máy   ${st.deviceIdSource}\n`);
  out(`  File giấy phép  ${st.file}\n`);
  out(`  Public key      ${st.publicKeysFile}  (${st.soKhoaPhatHanh} khoá)\n`);
  out(`  Trạng thái      ${st.ok ? '✓ ' : '✗ '}${st.state}\n`);

  if (st.license) {
    out('\nGiấy phép đang lưu\n');
    out(`  licenseId       ${st.license.licenseId ?? '-'}\n`);
    out(`  Cấp cho         ${st.license.issuedTo ?? '-'}\n`);
    out(`  Máy được cấp    ${st.license.deviceId ?? '-'}\n`);
    out(`  Ngày cấp        ${st.license.issuedAt ?? '-'}\n`);
    out(`  Hết hạn         ${st.license.expiresAt ?? 'không thời hạn'}\n`);
  }

  out(`\n${st.message}\n`);
  if (st.sourceHub) {
    out('Đang chạy từ mã nguồn hub (có assets/ và targets.json) — không chặn ở đây.\n'
      + 'Giấy phép chỉ cưỡng chế trên GÓI phân phối (plugin đã cài).\n');
  } else if (!st.ok) {
    out(`\nGửi Device ID ${st.deviceId} cho Fast Source, nhận file JSON rồi chạy:\n`);
    out(`  node tools/4ai.mjs license import <đường-dẫn-file.json>\n`);
  }
  out('\n');
  return st.ok || st.sourceHub ? 0 : 1;
}

/** In MỖI Device ID, không kèm gì khác — để copy/dán hoặc pipe sang chỗ khác. */
export function cmdId() {
  out(`${deviceId()}\n`);
  return 0;
}

// ---------------------------------------------------------------- import

export function cmdImport(hub, nguon) {
  if (!nguon) {
    process.stderr.write('cách dùng: license import <đường-dẫn-file.json>  (hoặc `-` để đọc từ stdin)\n');
    return 1;
  }
  let text;
  if (nguon === '-') {
    text = fs.readFileSync(0, 'utf8');
  } else {
    if (!fs.existsSync(nguon)) {
      process.stderr.write(`Không tìm thấy file: ${nguon}\n`);
      return 1;
    }
    text = fs.readFileSync(nguon, 'utf8');
  }

  let kq;
  try {
    kq = saveLicense(hub, text);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    return 1;
  }
  out(`\nĐã kích hoạt.\n`);
  out(`  Cấp cho   ${kq.license.issuedTo}\n`);
  out(`  Máy       ${kq.license.deviceId}\n`);
  out(`  Hết hạn   ${kq.license.expiresAt ?? 'không thời hạn'}${kq.conLai != null ? ` (còn ${kq.conLai} ngày)` : ''}\n`);
  out(`  Lưu tại   ${kq.file}\n\n`);
  return 0;
}

// ---------------------------------------------------------------- keygen (phía phát hành)

export function cmdKeygen(hub, opts = {}) {
  const kid = String(opts.kid || `fs-${new Date().getFullYear()}${String.fromCharCode(97 + new Date().getMonth() % 26)}`).trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(kid)) {
    process.stderr.write('kid chỉ gồm chữ, số, dấu . _ - và bắt đầu bằng chữ/số.\n');
    return 1;
  }
  const file = opts.out ? path.resolve(opts.out) : duongDanKhoa(kid);
  if (fs.existsSync(file)) {
    process.stderr.write(`Đã có khoá tại ${file} — KHÔNG ghi đè (ghi đè là mọi giấy phép đã cấp bằng khoá cũ hết verify được).\n`
      + 'Muốn khoá mới thì đặt --kid khác.\n');
    return 1;
  }

  const k = generateSigningKey(kid);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, k.privateKeyPem, { encoding: 'utf8', mode: 0o600 });

  out(`\nĐã sinh khoá ký ed25519.\n`);
  out(`  kid            ${k.kid}\n`);
  out(`  Private key    ${file}   ← BÍ MẬT. Không commit, không gửi cho khách, sao lưu chỗ an toàn.\n`);
  out(`\nDán mục dưới vào mảng "keys" của ${publicKeysPath(hub)} rồi đóng gói lại plugin:\n\n`);
  out(`${JSON.stringify({ kid: k.kid, alg: 'ed25519', publicKey: k.publicKey }, null, 2)}\n\n`);
  out('Mất private key = không cấp thêm được giấy phép cho khoá này (giấy phép đã cấp vẫn chạy).\n\n');
  return 0;
}

// ---------------------------------------------------------------- issue (phía phát hành)

/**
 * Cấp một giấy phép cho đúng một Device ID.
 *
 * Hạn mặc định 365 ngày chứ không phải vĩnh viễn: cấp nhầm một bản vĩnh viễn thì không thu
 * hồi được (không có máy chủ kiểm tra). Muốn vĩnh viễn phải nói thẳng bằng `--forever`.
 */
export function cmdIssue(hub, opts = {}) {
  const device = normalizeDeviceId(opts.device);
  const issuedTo = String(opts.to ?? '').trim();
  if (!device || !issuedTo) {
    process.stderr.write('cách dùng: license issue --device <DEVICE-ID> --to "<Tên khách>" [--days 365 | --expires YYYY-MM-DD | --forever]\n'
      + '           [--kid <kid>] [--key <đường dẫn .pem>] [--note "..."] [--out <file.json>]\n');
    return 1;
  }
  if (!/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/.test(device)) {
    process.stderr.write(`Device ID không đúng dạng XXXXX-XXXXX-XXXXX-XXXXX: ${device}\n`);
    return 1;
  }

  const kid = String(opts.kid ?? '').trim() || kidDuyNhat(hub);
  if (!kid) {
    process.stderr.write(`Không suy được kid — khai --kid, hoặc thêm khoá vào ${publicKeysPath(hub)}.\n`);
    return 1;
  }
  const keyFile = opts.key ? path.resolve(opts.key) : duongDanKhoa(kid);
  if (!fs.existsSync(keyFile)) {
    process.stderr.write(`Không có private key cho kid \`${kid}\`: ${keyFile}\n`
      + 'Máy này không phải máy phát hành, hoặc chưa chạy `license keygen`.\n');
    return 1;
  }

  let expiresAt;
  if (opts.forever) expiresAt = null;
  else if (opts.expires) {
    expiresAt = String(opts.expires).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
      process.stderr.write(`--expires phải là YYYY-MM-DD: ${expiresAt}\n`);
      return 1;
    }
  } else expiresAt = congNgay(opts.days ? Number(opts.days) : 365);

  const payload = {
    v: LICENSE_VERSION,
    product: PRODUCT,
    kid,
    licenseId: String(opts['license-id'] ?? '').trim()
      || `LIC-${ngayHomNay().replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    deviceId: device,
    issuedTo,
    issuedAt: ngayHomNay(),
    expiresAt,
    ...(opts.note ? { note: String(opts.note) } : {}),
  };

  let lic;
  try {
    lic = signLicense(payload, fs.readFileSync(keyFile, 'utf8'));
  } catch (e) {
    process.stderr.write(`Không ký được: ${e.message}\n`);
    return 1;
  }

  const noiDung = JSON.stringify(lic, null, 2) + '\n';
  if (opts.out) {
    const file = path.resolve(opts.out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, noiDung, 'utf8');
    out(`Đã cấp ${payload.licenseId} cho ${issuedTo} · máy ${device} · hết hạn ${expiresAt ?? 'không thời hạn'}\n`);
    out(`Gửi file này cho khách: ${file}\n`);
  } else {
    out(noiDung);
  }
  return 0;
}

/** Chỉ có đúng một khoá phát hành thì không bắt gõ --kid. */
function kidDuyNhat(hub) {
  try {
    const cfg = JSON.parse(fs.readFileSync(publicKeysPath(hub), 'utf8'));
    const keys = Array.isArray(cfg.keys) ? cfg.keys : [];
    return keys.length === 1 ? keys[0].kid : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------- dispatch

export const LICENSE_USAGE = `4ai license — giấy phép của gói phân phối.

  license                         trạng thái + Device ID của máy này
  license id                      in MỖI Device ID (để gửi cho Fast Source)
  license import <file.json>      kích hoạt giấy phép nhận được (\`-\` = đọc stdin)
  license path                    in đường dẫn file giấy phép trên máy này

  Phía Fast Source (cần private key):
  license keygen [--kid <kid>]    sinh cặp khoá ký, in mục public key để dán vào data/
  license issue --device <ID> --to "<Khách>" [--days N | --expires YYYY-MM-DD | --forever]
                                  ký và in (hoặc --out <file.json>) giấy phép cho đúng máy đó
`;

export function runLicense(hub, sub, rest, opts) {
  switch (sub ?? 'status') {
    case 'status': return cmdStatus(hub);
    case 'id': return cmdId();
    case 'import':
    case 'activate': return cmdImport(hub, rest[0]);
    case 'path': out(`${licensePath(hub)}\n`); return 0;
    case 'keygen': return cmdKeygen(hub, opts);
    case 'issue': return cmdIssue(hub, opts);
    case 'device': out(`${deviceId()}  (${deviceFingerprint().source})\n`); return 0;
    default:
      process.stderr.write(`license: lệnh con không rõ: ${sub}\n\n${LICENSE_USAGE}`);
      return 1;
  }
}
