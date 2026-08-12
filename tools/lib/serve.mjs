// serve.mjs — server tĩnh cục bộ để xem report HTML mà không phải mở file thủ công.
// Zero dependency: chỉ node:http/fs/path/child_process. Chỉ bind 127.0.0.1 — không
// bao giờ nghe trên 0.0.0.0, đây là công cụ xem cho một máy, không phải dịch vụ.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.normalize(path.join(root, decoded));
  const normRoot = path.normalize(root);
  if (target !== normRoot && !target.startsWith(normRoot + path.sep)) return null; // chặn path traversal
  return target;
}

const DATE_FOLDER = /^\d{8}$/;
const ALIAS_TONG = /^\/review\/?$/;
const ALIAS_PROJECT = /^\/review\/([^/]+)\/?$/;

function listReviewDates(reviewDir) {
  return fs.readdirSync(reviewDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && DATE_FOLDER.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
}

/**
 * Rút gọn URL: /review -> ngày gần nhất có _tong/tong.html (hoặc report dự án gần nhất
 * nếu ngày đó chưa từng chạy toàn bộ); /review/<MA_DA> -> report dự án đó ở ngày gần nhất.
 * @returns {string|null} path tuyệt đối (kèm ngày) để redirect, hoặc null nếu không phải alias.
 */
function resolveReviewAlias(root, urlPath) {
  const reviewDir = path.join(root, 'review');
  if (!fs.existsSync(reviewDir)) return null;

  if (ALIAS_TONG.test(urlPath)) {
    const dates = listReviewDates(reviewDir);
    for (const date of dates) {
      if (fs.existsSync(path.join(reviewDir, date, '_tong', 'tong.html'))) {
        return `/review/${date}/_tong/tong.html`;
      }
    }
    for (const date of dates) {
      const dateDir = path.join(reviewDir, date);
      const sub = fs.readdirSync(dateDir, { withFileTypes: true })
        .find((e) => e.isDirectory() && e.name !== '_tong'
          && fs.existsSync(path.join(dateDir, e.name, 'review.html')));
      if (sub) return `/review/${date}/${sub.name}/review.html`;
    }
    return null;
  }

  const m = urlPath.match(ALIAS_PROJECT);
  if (m && !DATE_FOLDER.test(m[1])) {
    const maDa = m[1];
    for (const date of listReviewDates(reviewDir)) {
      if (fs.existsSync(path.join(reviewDir, date, maDa, 'review.html'))) {
        return `/review/${date}/${maDa}/review.html`;
      }
    }
    return null;
  }

  return null;
}

function dirListing(dir, urlPath) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  const rows = entries.map((e) => {
    const href = `${urlPath}${urlPath.endsWith('/') ? '' : '/'}${e.name}${e.isDirectory() ? '/' : ''}`;
    return `<li><a href="${href}">${e.name}${e.isDirectory() ? '/' : ''}</a></li>`;
  }).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>4ai serve — ${urlPath}</title>
<h1>${urlPath}</h1><ul>${rows || '<li>(trống)</li>'}</ul>`;
}

/** @returns {Promise<import('node:http').Server>} */
export function startServer({ root, port = 0 }) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' }).end('405 — chỉ GET');
      return;
    }
    const urlPath = req.url.split('?')[0];
    const alias = resolveReviewAlias(root, urlPath);
    if (alias) { res.writeHead(302, { Location: alias }).end(); return; }

    const target = safeJoin(root, req.url);
    if (!target) { res.writeHead(400).end('400 — bad request'); return; }
    fs.stat(target, (err, stat) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 — không tìm thấy'); return; }
      if (stat.isDirectory()) {
        const indexPath = path.join(target, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          fs.createReadStream(indexPath).pipe(res);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(dirListing(target, req.url.split('?')[0]));
        return;
      }
      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
      fs.createReadStream(target).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/** Mở trình duyệt mặc định — best-effort, không throw nếu máy không có UI. */
export function openBrowser(url) {
  try {
    const platform = process.platform;
    const [cmd, args] = platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
      : platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // không có trình duyệt/không có UI — URL đã in ra terminal, người dùng tự mở.
  }
}
