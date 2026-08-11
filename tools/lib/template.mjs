// template.mjs — load file tĩnh dưới tools/templates/report/, thay {{key}}.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates/report',
);

const cache = new Map();

/** @param {string} name tên file trong tools/templates/report/ */
export function loadTemplate(name) {
  if (cache.has(name)) return cache.get(name);
  const abs = path.join(TEMPLATE_DIR, name);
  if (!fs.existsSync(abs)) {
    throw new Error(`template không tồn tại: ${abs}`);
  }
  const text = fs.readFileSync(abs, 'utf8');
  cache.set(name, text);
  return text;
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} [vars]
 */
export function renderTemplate(name, vars = {}) {
  return loadTemplate(name).replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

/** Chỉ dùng trong test. */
export function clearTemplateCache() {
  cache.clear();
}
