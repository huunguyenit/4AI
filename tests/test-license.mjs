#!/usr/bin/env node
// test-license.mjs — giấy phép offline: ký, verify, gắn device, hạn, và cổng chặn.
// KHÔNG đụng giấy phép thật trên máy: mọi đường dẫn trỏ vào thư mục tạm qua
// FBO_LICENSE_FILE / FBO_LICENSE_KEYS.
//
// Bài quan trọng nhất ở đây là hai cái "không được xảy ra":
//   · sửa một chữ trong payload mà chữ ký vẫn qua  → giấy phép giả cấp được hàng loạt;
//   · giấy phép hỏng vẫn ghi xuống đĩa            → lần sau người dùng thấy "đã có lic mà
//     vẫn chặn" và không có cách nào lần ra nguyên nhân.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '4ai-license-'));
const keysFile = path.join(tmp, 'license-public-keys.json');
const licFile = path.join(tmp, 'license.json');
process.env.FBO_LICENSE_KEYS = keysFile;
process.env.FBO_LICENSE_FILE = licFile;

const {
  canonicalJson, generateSigningKey, signLicense, verifyLicense, deviceId, normalizeDeviceId,
  saveLicense, licenseStatus, requireLicense, isSourceHub, soNgayConLai,
  PRODUCT, LICENSE_VERSION,
} = await import('../mcp/fbo/lib/license.mjs');

// Hub GIẢ, không có assets/ + targets.json → không được coi là mã nguồn hub, tức là cổng
// giấy phép có hiệu lực (giống hệt tình huống plugin đã cài).
const hubGia = path.join(tmp, 'goi');
fs.mkdirSync(hubGia, { recursive: true });

const k = generateSigningKey('test-a');
fs.writeFileSync(keysFile, JSON.stringify({
  version: 1, keys: [{ kid: k.kid, alg: 'ed25519', publicKey: k.publicKey }],
}, null, 2), 'utf8');
const KEYS = [{ kid: k.kid, alg: 'ed25519', publicKey: k.publicKey }];

const DEV = deviceId();
const payloadMau = (over = {}) => ({
  v: LICENSE_VERSION, product: PRODUCT, kid: k.kid,
  licenseId: 'LIC-TEST-0001', deviceId: DEV, issuedTo: 'Khách Thử',
  issuedAt: '2026-01-01', expiresAt: null, ...over,
});

process.stdout.write('=== 1. CANONICAL JSON — hai bên phải ra cùng chuỗi byte ===\n');
ok('khoá được sắp xếp, không phụ thuộc thứ tự gán',
  canonicalJson({ b: 1, a: 2 }) === canonicalJson({ a: 2, b: 1 }));
ok('không có khoảng trắng thừa', canonicalJson({ a: 1 }) === '{"a":1}');
ok('lồng nhau và mảng vẫn ổn định',
  canonicalJson({ x: [{ b: 1, a: 2 }] }) === '{"x":[{"a":2,"b":1}]}');
ok('field undefined bị bỏ (khớp cách JSON.stringify ghi file)',
  canonicalJson({ a: 1, b: undefined }) === '{"a":1}');

process.stdout.write('\n=== 2. DEVICE ID ===\n');
ok('dạng XXXXX-XXXXX-XXXXX-XXXXX', /^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/.test(DEV), DEV);
ok('ổn định giữa hai lần gọi', deviceId() === DEV);
ok('normalize bỏ khoảng trắng và chèn lại gạch nối',
  normalizeDeviceId(` ${DEV.replace(/-/g, '').toLowerCase()} `) === DEV);

process.stdout.write('\n=== 3. KÝ VÀ VERIFY ===\n');
const licHopLe = signLicense(payloadMau(), k.privateKeyPem);
ok('giấy phép vừa ký thì hợp lệ', verifyLicense(licHopLe, { keys: KEYS, deviceId: DEV }).ok === true);

const sua = JSON.parse(JSON.stringify(licHopLe));
sua.payload.issuedTo = 'Khách Khác';
ok('sửa một chữ trong payload → chữ ký hỏng',
  verifyLicense(sua, { keys: KEYS, deviceId: DEV }).code === 'signature');

const doiHan = JSON.parse(JSON.stringify(licHopLe));
doiHan.payload.expiresAt = '2099-01-01';
ok('nới hạn bằng tay cũng hỏng chữ ký',
  verifyLicense(doiHan, { keys: KEYS, deviceId: DEV }).code === 'signature');

const khoaKhac = generateSigningKey('test-b');
ok('ký bằng khoá lạ → không nhận ra kid',
  verifyLicense(signLicense(payloadMau({ kid: 'test-b' }), khoaKhac.privateKeyPem),
    { keys: KEYS, deviceId: DEV }).code === 'kid');
ok('kid đúng nhưng khoá ký khác → chữ ký sai',
  verifyLicense(signLicense(payloadMau(), khoaKhac.privateKeyPem),
    { keys: KEYS, deviceId: DEV }).code === 'signature');

ok('thiếu signature → báo sai dạng', verifyLicense({ payload: payloadMau() }, { keys: KEYS, deviceId: DEV }).code === 'shape');
ok('sai product → chặn',
  verifyLicense(signLicense(payloadMau({ product: 'khac' }), k.privateKeyPem),
    { keys: KEYS, deviceId: DEV }).code === 'product');
ok('sai version → chặn',
  verifyLicense(signLicense(payloadMau({ v: 99 }), k.privateKeyPem),
    { keys: KEYS, deviceId: DEV }).code === 'version');

process.stdout.write('\n=== 4. GẮN ĐÚNG MÁY ===\n');
const licMayKhac = signLicense(payloadMau({ deviceId: 'AAAAA-BBBBB-CCCCC-DDDDD' }), k.privateKeyPem);
const kqMayKhac = verifyLicense(licMayKhac, { keys: KEYS, deviceId: DEV });
ok('giấy phép của máy khác → code device', kqMayKhac.code === 'device');
ok('thông báo nêu CẢ hai device id để đối chiếu',
  kqMayKhac.message.includes(DEV) && kqMayKhac.message.includes('AAAAA-BBBBB-CCCCC-DDDDD'));
ok('device id lệch cách viết (thường/không gạch) vẫn khớp',
  verifyLicense(signLicense(payloadMau({ deviceId: DEV }), k.privateKeyPem),
    { keys: KEYS, deviceId: DEV.replace(/-/g, '').toLowerCase() }).ok === true);

process.stdout.write('\n=== 5. HẠN ===\n');
const NOW = new Date('2026-06-15T10:00:00');
const hanTruoc = signLicense(payloadMau({ expiresAt: '2026-06-14' }), k.privateKeyPem);
const hanNay = signLicense(payloadMau({ expiresAt: '2026-06-15' }), k.privateKeyPem);
const hanSau = signLicense(payloadMau({ expiresAt: '2026-12-31' }), k.privateKeyPem);
ok('hết hạn hôm qua → chặn', verifyLicense(hanTruoc, { keys: KEYS, deviceId: DEV, now: NOW }).code === 'expired');
ok('hạn ĐÚNG hôm nay vẫn dùng được (bao gồm cả ngày cuối)',
  verifyLicense(hanNay, { keys: KEYS, deviceId: DEV, now: NOW }).ok === true);
ok('còn hạn → ok', verifyLicense(hanSau, { keys: KEYS, deviceId: DEV, now: NOW }).ok === true);
ok('expiresAt null = không thời hạn',
  verifyLicense(licHopLe, { keys: KEYS, deviceId: DEV, now: NOW }).conLai === null);
ok('đếm ngày còn lại', soNgayConLai('2026-06-20', NOW) === 5, String(soNgayConLai('2026-06-20', NOW)));
ok('expiresAt sai định dạng → chặn chứ không bỏ qua',
  verifyLicense(signLicense(payloadMau({ expiresAt: '20/06/2026' }), k.privateKeyPem),
    { keys: KEYS, deviceId: DEV }).code === 'expiresAt');

process.stdout.write('\n=== 6. LƯU: VERIFY TRƯỚC, GHI SAU ===\n');
let neme = null;
try { saveLicense(hubGia, licMayKhac); } catch (e) { neme = e.message; }
ok('giấy phép sai máy → ném lỗi', neme !== null);
ok('và KHÔNG để lại file nào', !fs.existsSync(licFile));
try { saveLicense(hubGia, '{ khong phai json'); } catch (e) { neme = e.message; }
ok('chuỗi không phải JSON → báo rõ là JSON hỏng', /JSON/.test(neme));
ok('vẫn không ghi gì', !fs.existsSync(licFile));

const daLuu = saveLicense(hubGia, JSON.stringify(licHopLe));
ok('nhận chuỗi JSON dán vào (đường của tool license_activate)', fs.existsSync(licFile));
ok('trả về tóm tắt không kèm chữ ký',
  daLuu.license.issuedTo === 'Khách Thử' && daLuu.license.signature === undefined);

process.stdout.write('\n=== 7. TRẠNG THÁI & CỔNG CHẶN ===\n');
const st = licenseStatus(hubGia);
ok('state = hop-le sau khi kích hoạt', st.state === 'hop-le' && st.ok === true);
ok('trạng thái không bao giờ kèm chữ ký hay khoá máy thô',
  !JSON.stringify(st).includes(licHopLe.signature));
ok('requireLicense cho qua', requireLicense(hubGia).ok === true);

fs.rmSync(licFile);
const stChua = licenseStatus(hubGia);
ok('xoá file → chua-kich-hoat', stChua.state === 'chua-kich-hoat' && stChua.ok === false);
let chanLoi = '';
try { requireLicense(hubGia, { what: 'report' }); } catch (e) { chanLoi = e.message; }
ok('requireLicense ném lỗi khi chưa kích hoạt', chanLoi !== '');
ok('lỗi có sẵn Device ID để copy', chanLoi.includes(DEV));
ok('lỗi chỉ đúng hai đường kích hoạt',
  chanLoi.includes('license_activate') && chanLoi.includes('license import'));
ok('lỗi nêu lệnh nào bị chặn', chanLoi.includes('report'));

fs.writeFileSync(licFile, '{ hỏng', 'utf8');
ok('file hỏng → state file-hong, không ném ra ngoài', licenseStatus(hubGia).state === 'file-hong');
fs.rmSync(licFile);

process.stdout.write('\n=== 8. MÃ NGUỒN HUB KHÔNG BỊ CHẶN ===\n');
ok('hub thật (có assets/ + targets.json) được nhận diện', isSourceHub(ROOT) === true);
ok('gói phân phối thì không', isSourceHub(hubGia) === false);
ok('requireLicense bỏ qua khi chạy từ mã nguồn hub', requireLicense(ROOT).sourceHub === true);

process.stdout.write('\n=== 9. GÓI THIẾU PUBLIC KEY ===\n');
// Ghi thẳng file (không qua saveLicense) để dựng đúng tình huống: máy ĐÃ có giấy phép nhưng
// gói bị cài thiếu public key — phải chỉ đúng vào gói, đừng bắt người dùng đi xin lại lic.
fs.writeFileSync(licFile, JSON.stringify(licHopLe, null, 2), 'utf8');
fs.writeFileSync(keysFile, JSON.stringify({ version: 1, keys: [] }), 'utf8');
ok('không có khoá phát hành nào → nói thẳng là gói thiếu, không đổ lỗi cho giấy phép',
  licenseStatus(hubGia).state === 'thieu-public-key');
let luoiLoi = '';
try { saveLicense(hubGia, licHopLe); } catch (e) { luoiLoi = e.message; }
ok('và từ chối lưu', /public key/i.test(luoiLoi));

fs.rmSync(tmp, { recursive: true, force: true });
process.stdout.write(`\n=== TEST KẾT THÚC: ${failures ? `${failures} thất bại` : 'TẤT CẢ PASS (0 thất bại)'} ===\n`);
process.exit(failures ? 1 : 0);
