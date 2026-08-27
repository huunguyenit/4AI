// qlda-metadata.mjs — nạp cấu hình QLDA từ data/qlda.json, có overlay giá trị máy-cụ-thể
// từ data/qlda.local.json (danh tính PM + định danh hạ tầng nội bộ).
//
// data/qlda.json là NGUỒN DUY NHẤT của tên bảng, tên cột, enum và caveat truy vấn của QLDA.
// KHÔNG hardcode tên cột ở file này: thêm/đổi cột thì sửa qlda.json, module tự nhận.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateFile } from '../../mcp/fbo/lib/index.mjs';

const MODULE_HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_REL = path.join('data', 'qlda.json');
const LOCAL_REL = ['data', 'qlda.local.json'];

/** configPath -> { mtimeMs, json } — nạp lại khi file đổi, không cache vĩnh viễn. */
const configCache = new Map();

/** Token sync-time `{PMName}`/`{PMDept}` — chưa gán từ local thì không dùng làm mã NV. */
export function isPmPlaceholder(value) {
  const s = String(value ?? '').trim();
  return !s || /^\{[A-Za-z0-9_]+\}$/.test(s);
}

/**
 * Đọc `pm` từ qlda.local.json ở STATE ROOT (cấp người dùng) — KHÔNG phải `root` trực tiếp.
 * `stateFile()` trả thư mục người dùng cố định khi chạy dưới dạng plugin, hoặc chính `root`
 * khi chạy dev (hành vi cũ, không đổi). Chạy như plugin mà đọc thẳng `root` (gốc gói cài) sẽ
 * trỏ vào chỗ read-only bị ghi đè mỗi lần update; đọc `${CLAUDE_PLUGIN_DATA}` thì mất theo
 * phiên Cowork — xem docstring `stateRoot()`.
 * @returns {{maNv?: string, boPhanLt?: string}|null}
 */
function loadLocalPm(root) {
  const file = stateFile(root, ...LOCAL_REL);
  if (!fs.existsSync(file)) return null;
  try {
    const local = JSON.parse(fs.readFileSync(file, 'utf8'));
    return local?.pm && typeof local.pm === 'object' ? local.pm : null;
  } catch {
    return null;
  }
}

/** Đọc thẳng data/qlda.local.json ở state root — dùng cho overlay cấu trúc QLDA bên dưới. */
function loadLocalFile(root) {
  const file = stateFile(root, ...LOCAL_REL);
  if (!fs.existsSync(file)) return {};
  try {
    const local = JSON.parse(fs.readFileSync(file, 'utf8'));
    return local && typeof local === 'object' ? local : {};
  } catch {
    return {};
  }
}

/**
 * Gán review.pm từ qlda.local.json khi qlda.json còn placeholder hoặc local có giá trị.
 * Không mutate object trong cache — trả bản shallow-clone phần `review.pm`.
 */
function overlayPmFromLocal(json, root) {
  if (!json) return null;
  const localPm = loadLocalPm(root);
  if (!localPm) return json;

  const base = json.review?.pm && typeof json.review.pm === 'object' ? json.review.pm : {};
  const maNv = !isPmPlaceholder(localPm.maNv) ? String(localPm.maNv).trim()
    : (!isPmPlaceholder(base.maNv) ? String(base.maNv).trim() : base.maNv);
  const boPhanLt = !isPmPlaceholder(localPm.boPhanLt) ? String(localPm.boPhanLt).trim()
    : (!isPmPlaceholder(base.boPhanLt) ? String(base.boPhanLt).trim() : base.boPhanLt);

  return {
    ...json,
    review: {
      ...json.review,
      pm: { ...base, maNv, boPhanLt },
    },
  };
}

/**
 * Gán giá trị cấu trúc QLDA (đường dẫn program, tên database) từ qlda.local.json khi
 * qlda.json còn giữ TOKEN `{...}` — cùng cơ chế với `overlayPmFromLocal`, áp cho các field
 * mà `mcp/fbo/lib/sql.mjs` đọc để định tuyến kết nối. `data/qlda.json` đi kèm gói phân phối
 * công khai nên KHÔNG BAO GIỜ chứa giá trị thật; giá trị thật chỉ nằm ở qlda.local.json
 * (gitignore) hoặc do `4ai setup` ghi vào.
 */
function overlayQldaStructureFromLocal(json, root) {
  if (!json?.databases?.qlda) return json;
  const local = loadLocalFile(root);

  const pick = (tokenValue, localValue) =>
    (!isPmPlaceholder(localValue) ? String(localValue).trim() : tokenValue);

  const qlda = json.databases.qlda;
  const graph4ai = json.databases?.graph4ai;
  const attachments = json.attachments;

  return {
    ...json,
    databases: {
      ...json.databases,
      qlda: {
        ...qlda,
        path: pick(qlda.path, local.qldaProgramPath),
        databaseName: pick(qlda.databaseName, local.qldaDatabaseName),
        sysDatabaseName: pick(qlda.sysDatabaseName, local.qldaSysDatabaseName),
      },
      ...(graph4ai ? {
        graph4ai: { ...graph4ai, databaseName: pick(graph4ai.databaseName, local.graph4aiDatabaseName) },
      } : {}),
    },
    ...(attachments ? {
      attachments: {
        ...attachments,
        fileStore: attachments.fileStore ? {
          ...attachments.fileStore,
          root: pick(attachments.fileStore.root, local.attachmentsFileStoreRoot),
        } : attachments.fileStore,
      },
    } : {}),
  };
}

/**
 * Đọc data/qlda.json. Tìm lần lượt theo hub được truyền vào, gốc module, rồi cwd.
 * Sau khi nạp, gán `review.pm` từ data/qlda.local.json nếu có (token `{PMName}`/`{PMDept}`).
 * @param {string} [hub] - Thư mục gốc hub 4AI
 * @returns {Object|null} Nội dung qlda.json, hoặc null nếu không tìm thấy file
 */
export function loadQldaConfig(hub) {
  for (const root of [hub, MODULE_HUB_ROOT, process.cwd()]) {
    if (!root) continue;
    const file = path.join(root, CONFIG_REL);
    if (!fs.existsSync(file)) continue;

    const { mtimeMs } = fs.statSync(file);
    const hit = configCache.get(file);
    const base = hit && hit.mtimeMs === mtimeMs
      ? hit.json
      : (() => {
          const json = JSON.parse(fs.readFileSync(file, 'utf8'));
          configCache.set(file, { mtimeMs, json });
          return json;
        })();

    // Overlay local mỗi lần gọi (local có thể đổi mà qlda.json không) — không cache bản đã gán.
    return overlayQldaStructureFromLocal(overlayPmFromLocal(base, root), root);
  }
  return null;
}
