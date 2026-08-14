// license.mjs — giấy phép offline cho GÓI PHÂN PHỐI (plugin Claude Code / Cursor).
//
// Mô hình, đúng ba bước:
//   1. Public key đi kèm gói (`data/license-public-keys.json`). Private key KHÔNG bao giờ
//      rời máy phát hành.
//   2. Người dùng đọc Device ID của máy mình (`license status`, hoặc tool `license_status`)
//      rồi gửi cho Fast Source.
//   3. Fast Source ký một JSON gắn đúng Device ID đó; người dùng lưu bằng `license import`
//      hoặc tool `license_activate`. Runtime verify chữ ký + Device ID + hạn mỗi lần gọi.
//
// KHÔNG gọi mạng, không máy chủ kiểm tra: máy khách hàng thường không ra được Internet, và
// một MCP server chặn ở bước khởi động vì chờ HTTP là hỏng nặng hơn cả việc không có lic.
//
// Đây là hàng rào THƯƠNG MẠI, không phải hàng rào an toàn. Runtime là JavaScript đọc được;
// ai sửa file này thì bỏ được kiểm tra. Mục tiêu là "chỉ chạy ở nơi đã được cấp phép" và để
// lại vết rõ ràng khi chạy sai chỗ — không phải chống dịch ngược.
//
// File này là nơi DUY NHẤT định nghĩa format giấy phép. CLI (`tools/lib/license-cli.mjs`) và
// tool MCP (`license_status`/`license_activate`) chỉ gọi vào đây, không tự đọc field.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { stateFile } from './index.mjs';

export const PRODUCT = '4ai';
export const LICENSE_VERSION = 1;

// ---------------------------------------------------------------- device id

// Crockford base32 — bỏ I, L, O, U để người dùng đọc qua điện thoại không nhầm 0/O, 1/I.
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function base32(buf, chars) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
      if (out.length === chars) return out;
    }
  }
  if (bits > 0 && out.length < chars) out += BASE32[(value << (5 - bits)) & 31];
  return out.slice(0, chars);
}

function chay(cmd, args) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 5000, windowsHide: true });
    return r.status === 0 ? String(r.stdout ?? '') : '';
  } catch {
    return '';
  }
}

/**
 * Khoá máy THÔ — định danh ổn định nhất mà HĐH cho biết. Không bao giờ ra khỏi hàm này:
 * `deviceId()` băm nó rồi mới trả ra ngoài, nên Device ID gửi cho Fast Source không lộ
 * MachineGuid / MAC thật của máy khách.
 *
 * Thứ tự ưu tiên chọn theo độ ổn định: định danh cài đặt HĐH (không đổi khi đổi tên máy,
 * cắm thêm card mạng, dựng VPN) > địa chỉ MAC > tên máy.
 */
function khoaMayTho() {
  if (process.platform === 'win32') {
    const out = chay('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64']);
    const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/);
    if (m) return { key: `winguid:${m[1].toLowerCase()}`, source: 'MachineGuid (Windows)' };
  }
  if (process.platform === 'linux') {
    for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      try {
        const v = fs.readFileSync(f, 'utf8').trim();
        if (v) return { key: `machineid:${v.toLowerCase()}`, source: f };
      } catch { /* thử nguồn kế tiếp */ }
    }
  }
  if (process.platform === 'darwin') {
    const out = chay('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']);
    const m = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    if (m) return { key: `iouuid:${m[1].toLowerCase()}`, source: 'IOPlatformUUID (macOS)' };
  }

  // Lùi về MAC: lấy ĐỊA CHỈ NHỎ NHẤT theo thứ tự chữ chứ không lấy "cái đầu tiên" — thứ tự
  // networkInterfaces() đổi theo lần khởi động, lấy phần tử đầu là Device ID nhảy loạn.
  const macs = Object.values(os.networkInterfaces()).flat()
    .filter((n) => n && !n.internal && n.mac && n.mac !== '00:00:00:00:00:00')
    .map((n) => n.mac.toLowerCase())
    .sort();
  if (macs.length) return { key: `mac:${macs[0]}`, source: 'địa chỉ MAC' };

  return { key: `host:${os.hostname().toLowerCase()}|${process.platform}`, source: 'tên máy (kém ổn định)' };
}

let vanTayCache = null;

/** @returns {{id: string, source: string}} — `source` chỉ để chẩn đoán, không đưa vào chữ ký. */
export function deviceFingerprint() {
  if (vanTayCache) return vanTayCache;
  const { key, source } = khoaMayTho();
  const digest = crypto.createHash('sha256').update(`4ai-device-v1|${key}`).digest();
  const raw = base32(digest, 20);
  vanTayCache = { id: raw.replace(/(.{5})(?=.)/g, '$1-'), source };
  return vanTayCache;
}

/** Device ID dạng người đọc được: `XXXXX-XXXXX-XXXXX-XXXXX`. */
export function deviceId() {
  return deviceFingerprint().id;
}

/** Chuẩn hoá Device ID người dùng gõ/dán vào: bỏ khoảng trắng, in hoa, chèn lại dấu gạch. */
export function normalizeDeviceId(v) {
  const s = String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length !== 20) return String(v ?? '').trim().toUpperCase();
  return s.replace(/(.{5})(?=.)/g, '$1-');
}

// ---------------------------------------------------------------- format & chữ ký

/**
 * JSON chuẩn tắc để ký: khoá sắp xếp, không khoảng trắng, bỏ field `undefined`.
 * Bên ký và bên verify phải sinh ra ĐÚNG CÙNG một chuỗi byte, nên đây là hàm riêng chứ
 * không dùng `JSON.stringify` trần (thứ tự khoá phụ thuộc thứ tự gán) hay `stableStringify`
 * của compiler (có indent — đổi một khoảng trắng là chữ ký hỏng).
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

/** Sinh cặp khoá ký (Ed25519). CHỈ chạy ở máy phát hành. */
export function generateSigningKey(kid) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    kid,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

/**
 * Ký một payload → object giấy phép hoàn chỉnh. CHỈ chạy ở máy phát hành.
 * @param {object} payload  đã đủ field; hàm này không tự bịa thêm giá trị mặc định
 * @param {string} privateKeyPem  nội dung PEM pkcs8
 */
export function signLicense(payload, privateKeyPem) {
  const key = crypto.createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error(`Khoá ký phải là ed25519, khoá đưa vào là ${key.asymmetricKeyType}.`);
  }
  const sig = crypto.sign(null, Buffer.from(canonicalJson(payload), 'utf8'), key);
  return { payload, signature: sig.toString('base64') };
}

function today(now) {
  const d = now ?? new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const NGAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Verify thuần tuý — không chạm filesystem, để test được và để CLI/MCP dùng chung một
 * đường phán quyết.
 *
 * @param {object} license   `{payload, signature}`
 * @param {object} p
 * @param {Array}  p.keys    public key đã nạp: `[{kid, alg, publicKey}]`
 * @param {string} p.deviceId  Device ID của máy đang chạy
 * @param {Date}   [p.now]
 * @returns {{ok: true, payload, kid, conLai: number|null} | {ok: false, code: string, message: string, payload?: object}}
 */
export function verifyLicense(license, { keys, deviceId: dev, now } = {}) {
  const xau = (code, message, payload) => ({ ok: false, code, message, ...(payload ? { payload } : {}) });

  if (!license || typeof license !== 'object' || typeof license.signature !== 'string'
      || !license.payload || typeof license.payload !== 'object') {
    return xau('shape', 'File giấy phép không đúng dạng — phải là JSON có `payload` và `signature`.');
  }
  const p = license.payload;
  if (p.v !== LICENSE_VERSION) {
    return xau('version', `Giấy phép phiên bản ${p.v} — bản cài này chỉ đọc được phiên bản ${LICENSE_VERSION}. Cập nhật plugin rồi kích hoạt lại.`, p);
  }
  if (p.product !== PRODUCT) {
    return xau('product', `Giấy phép cấp cho sản phẩm \`${p.product}\`, không phải \`${PRODUCT}\`.`, p);
  }

  const khoa = (keys ?? []).find((k) => k.kid === p.kid);
  if (!khoa) {
    return xau('kid', `Không nhận ra khoá phát hành \`${p.kid}\` — bản cài này cũ hơn giấy phép. Cập nhật plugin lên bản mới rồi kích hoạt lại.`, p);
  }
  if (khoa.alg !== 'ed25519') {
    return xau('alg', `Khoá \`${khoa.kid}\` khai thuật toán \`${khoa.alg}\` — chỉ hỗ trợ ed25519.`, p);
  }

  let hopLe = false;
  try {
    const pub = crypto.createPublicKey({
      key: Buffer.from(khoa.publicKey, 'base64'), format: 'der', type: 'spki',
    });
    hopLe = crypto.verify(null, Buffer.from(canonicalJson(p), 'utf8'), pub, Buffer.from(license.signature, 'base64'));
  } catch (e) {
    return xau('verify', `Không verify được chữ ký: ${e.message}`, p);
  }
  if (!hopLe) {
    return xau('signature', 'Chữ ký không hợp lệ — file đã bị sửa sau khi cấp, hoặc không phải do Fast Source cấp. Xin lại file gốc, đừng sửa tay.', p);
  }

  if (normalizeDeviceId(p.deviceId) !== normalizeDeviceId(dev)) {
    return xau('device',
      `Giấy phép này cấp cho máy khác.\n  Cấp cho:  ${p.deviceId}\n  Máy này:  ${dev}\n  `
      + 'Gửi Device ID của máy này cho Fast Source để xin bản đúng máy.', p);
  }

  if (p.expiresAt != null) {
    if (!NGAY.test(String(p.expiresAt))) {
      return xau('expiresAt', `\`expiresAt\` phải là YYYY-MM-DD hoặc null, đang là "${p.expiresAt}".`, p);
    }
    const homNay = today(now);
    if (homNay > p.expiresAt) {
      return xau('expired', `Giấy phép hết hạn ngày ${p.expiresAt} (hôm nay ${homNay}) — liên hệ Fast Source để gia hạn.`, p);
    }
  }

  return { ok: true, payload: p, kid: p.kid, conLai: soNgayConLai(p.expiresAt, now) };
}

/**
 * Số ngày còn lại tới hạn; `null` = vĩnh viễn. Đếm theo NGÀY LỊCH chứ không theo giờ đồng
 * hồ: hạn 20/06 xem lúc 10h sáng 15/06 phải ra 5 ngày, không phải 6 (làm tròn lên từ 5 ngày
 * 14 tiếng) — người đọc đối chiếu bằng lịch, không bằng máy tính giờ.
 */
export function soNgayConLai(expiresAt, now) {
  if (expiresAt == null) return null;
  const het = Date.parse(`${expiresAt}T00:00:00`);
  const homNay = Date.parse(`${today(now)}T00:00:00`);
  return Math.round((het - homNay) / 86400000);
}

// ---------------------------------------------------------------- đọc/ghi trên đĩa

/** Public key đi kèm GÓI — nằm cạnh code, không phải ở data root. */
export function publicKeysPath(hub) {
  return process.env.FBO_LICENSE_KEYS || path.join(hub, 'data', 'license-public-keys.json');
}

export function loadPublicKeys(hub) {
  const file = publicKeysPath(hub);
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { file, keys: Array.isArray(cfg.keys) ? cfg.keys : [] };
  } catch {
    return { file, keys: [] };
  }
}

/**
 * Nơi lưu giấy phép. Cùng chỗ với `qlda.local.json`: `stateRoot()` — thư mục cấp NGƯỜI DÙNG khi
 * chạy như plugin, không phải `${CLAUDE_PLUGIN_DATA}`. Giấy phép sống lâu hơn một lần cài và
 * lâu hơn một phiên Cowork; để nó trong thư mục phiên là bắt người dùng xin lại giấy phép mỗi
 * lần mở phiên mới.
 */
export function licensePath(hub) {
  return process.env.FBO_LICENSE_FILE || stateFile(hub, 'data', 'license.json');
}

export function readLicenseFile(hub) {
  const file = licensePath(hub);
  if (!fs.existsSync(file)) return { file, exists: false, license: null, parseError: null };
  try {
    return { file, exists: true, license: JSON.parse(fs.readFileSync(file, 'utf8')), parseError: null };
  } catch (e) {
    return { file, exists: true, license: null, parseError: e.message };
  }
}

/**
 * Chạy từ MÃ NGUỒN hub chứ không phải từ gói phân phối?
 *
 * `assets/` và `targets.json` là input của compiler, không bao giờ được đóng vào gói (xem
 * RUNTIME_DIRS ở emit/common.mjs). Có cả hai nghĩa là đang đứng trong repo hub — nơi giấy
 * phép vô nghĩa: người có repo đã có toàn bộ mã nguồn. Hàng rào này dành cho GÓI mang đi.
 */
export function isSourceHub(hub) {
  return fs.existsSync(path.join(hub, 'assets')) && fs.existsSync(path.join(hub, 'targets.json'));
}

/**
 * Trạng thái đầy đủ để in ra hoặc trả về cho model — KHÔNG BAO GIỜ kèm private key hay khoá
 * máy thô.
 */
export function licenseStatus(hub, { now } = {}) {
  const dev = deviceFingerprint();
  const { file, exists, license, parseError } = readLicenseFile(hub);
  const { keys, file: keysFile } = loadPublicKeys(hub);
  const base = {
    deviceId: dev.id,
    deviceIdSource: dev.source,
    file,
    publicKeysFile: keysFile,
    soKhoaPhatHanh: keys.length,
    sourceHub: isSourceHub(hub),
  };

  if (!exists) return { ...base, state: 'chua-kich-hoat', ok: false, message: 'Chưa có file giấy phép trên máy này.' };
  if (parseError) return { ...base, state: 'file-hong', ok: false, message: `File giấy phép không parse được: ${parseError}` };
  if (!keys.length) {
    return { ...base, state: 'thieu-public-key', ok: false,
      message: `Gói này không có public key nào (${keysFile}) — không verify được giấy phép nào. Cài lại bản đóng gói đầy đủ.` };
  }

  const kq = verifyLicense(license, { keys, deviceId: dev.id, now });
  if (!kq.ok) {
    return { ...base, state: kq.code, ok: false, message: kq.message, license: tomTat(kq.payload) };
  }
  return {
    ...base,
    state: 'hop-le',
    ok: true,
    message: kq.conLai == null
      ? 'Giấy phép hợp lệ, không thời hạn.'
      : `Giấy phép hợp lệ, còn ${kq.conLai} ngày (hết hạn ${kq.payload.expiresAt}).`,
    conLai: kq.conLai,
    license: tomTat(kq.payload),
  };
}

/** Phần giấy phép được phép hiển thị — không có chữ ký, không có gì ngoài payload đã cấp. */
function tomTat(p) {
  if (!p) return null;
  return {
    licenseId: p.licenseId,
    issuedTo: p.issuedTo,
    deviceId: p.deviceId,
    issuedAt: p.issuedAt,
    expiresAt: p.expiresAt ?? null,
    kid: p.kid,
    ...(p.note ? { note: p.note } : {}),
  };
}

/**
 * Kích hoạt: verify TRƯỚC rồi mới ghi. Không bao giờ lưu file hỏng — lưu rồi mới báo lỗi thì
 * lần chạy sau người dùng thấy "đã có lic mà vẫn chặn", không hiểu đang hỏng ở đâu.
 *
 * @param {object|string} input  object giấy phép, hoặc chuỗi JSON dán vào
 * @returns {{file: string, license: object, conLai: number|null}}
 */
export function saveLicense(hub, input, { now } = {}) {
  let lic = input;
  if (typeof lic === 'string') {
    try {
      lic = JSON.parse(lic.trim());
    } catch (e) {
      throw new Error(`Nội dung giấy phép không phải JSON hợp lệ: ${e.message}`);
    }
  }
  const { keys, file: keysFile } = loadPublicKeys(hub);
  if (!keys.length) {
    throw new Error(`Gói này không có public key nào (${keysFile}) — không verify được. Cài lại bản đóng gói đầy đủ.`);
  }
  const kq = verifyLicense(lic, { keys, deviceId: deviceId(), now });
  if (!kq.ok) throw new Error(`Không lưu — giấy phép không dùng được trên máy này.\n${kq.message}`);

  const file = licensePath(hub);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(lic, null, 2) + '\n', 'utf8');
  return { file, license: tomTat(kq.payload), conLai: kq.conLai };
}

/**
 * Cổng chặn dùng chung cho MCP tool và CLI. Ném lỗi với ĐÚNG hai thứ người dùng cần: lý do,
 * và các bước gỡ kèm Device ID sẵn để copy.
 */
export function requireLicense(hub, { now, what } = {}) {
  if (isSourceHub(hub)) return { ok: true, sourceHub: true };
  const st = licenseStatus(hub, { now });
  if (st.ok) return st;

  const viec = what ? `\`${what}\` cần giấy phép 4AI. ` : '';
  throw new Error(
    `${viec}${st.message}\n`
    + `  Device ID máy này:  ${st.deviceId}\n`
    + '  Gửi Device ID trên cho Fast Source để nhận file giấy phép (.json), rồi kích hoạt bằng một trong hai cách:\n'
    + '    · tool MCP:  license_activate({ license: "<dán nguyên nội dung file JSON>" })\n'
    + `    · dòng lệnh: node "${path.join(hub, 'tools', '4ai.mjs')}" license import <đường-dẫn-file.json>\n`
    + `  Giấy phép sẽ được lưu tại: ${st.file}`);
}
