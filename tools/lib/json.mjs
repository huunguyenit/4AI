// json.mjs — merge sâu và serialize JSON ổn định (key sorted, indent 2).
// Chạy lại phải ra file giống hệt từng byte — điều kiện để manifest hash có nghĩa.

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Merge sâu: giá trị của `patch` thắng; object lồng nhau merge đệ quy; mảng thay nguyên. */
export function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

function sortValue(v) {
  if (Array.isArray(v)) return v.map(sortValue);
  if (isPlainObject(v)) {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortValue(v[k]);
    return out;
  }
  return v;
}

/** JSON ổn định: key sorted mọi cấp, indent 2, trailing newline do writer thêm. */
export function stableStringify(obj) {
  return JSON.stringify(sortValue(obj), null, 2);
}

/** Dạng canonical để hash một subtree (không phụ thuộc thứ tự key). */
export function canonical(obj) {
  return JSON.stringify(sortValue(obj));
}

/** Lấy giá trị theo đường dẫn "a.b.c". */
export function getPath(obj, dotted) {
  let cur = obj;
  for (const part of dotted.split('.')) {
    if (!isPlainObject(cur) || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** Gán giá trị theo đường dẫn "a.b.c", tạo object trung gian nếu thiếu. */
export function setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(cur[parts[i]])) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

/** Xoá key theo đường dẫn; trả về true nếu có gì đó bị xoá. */
export function deletePath(obj, dotted) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(cur[parts[i]])) return false;
    cur = cur[parts[i]];
  }
  const leaf = parts[parts.length - 1];
  if (!(leaf in cur)) return false;
  delete cur[leaf];
  return true;
}
