// encoding.mjs — đọc file nguồn FBO mà KHÔNG phá encoding.
//
// XML controller có thể là UTF-8 (thường có BOM, CRLF) hoặc Windows-1258 legacy.
// Không có bộ dò Windows-1258 đáng tin — nó trùng byte với CP1252. Heuristic thực dụng:
// decode UTF-8 strict trước; lỗi thì mới rơi về windows-1258. Khai báo `encoding=`
// trong XML declaration là gợi ý mạnh nhất và được ưu tiên.

import fs from 'node:fs';

const utf8Strict = new TextDecoder('utf-8', { fatal: true });
const utf8Loose = new TextDecoder('utf-8');
const cp1258 = new TextDecoder('windows-1258');

/**
 * @returns {{text: string, encoding: string, bom: boolean, newline: 'crlf'|'lf'|'mixed'|'none', bytes: number}}
 */
export function readSource(absPath) {
  const buf = fs.readFileSync(absPath);
  return decodeSource(buf);
}

export function decodeSource(buf) {
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const body = bom ? buf.subarray(3) : buf;

  // Gợi ý từ XML declaration — chỉ đọc 200 byte đầu bằng latin1 để không hỏng gì.
  const head = body.subarray(0, 200).toString('latin1');
  const declared = /encoding\s*=\s*["']([\w-]+)["']/i.exec(head)?.[1]?.toLowerCase();

  let text;
  let encoding;
  if (declared && /^(windows-1258|cp1258)$/.test(declared)) {
    text = cp1258.decode(body);
    encoding = 'windows-1258';
  } else {
    try {
      text = utf8Strict.decode(body);
      encoding = 'utf-8';
    } catch {
      text = cp1258.decode(body);
      encoding = 'windows-1258';
    }
  }

  const crlf = text.includes('\r\n');
  const bareLf = /(^|[^\r])\n/.test(text);
  const newline = crlf && bareLf ? 'mixed' : crlf ? 'crlf' : bareLf ? 'lf' : 'none';

  return { text, encoding, bom, newline, bytes: buf.length };
}

/** Bỏ dấu tiếng Việt + lowercase — dùng cho index tìm kiếm và cho query đầu vào. */
export function stripAccents(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
}
