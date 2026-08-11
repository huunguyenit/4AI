import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const source = execSync('git show 4685e48:tools/lib/report.mjs', { encoding: 'utf8' });
const match = source.match(/export const CSS = `([\s\S]*?)`;/);
if (!match) throw new Error('CSS block not found');
const base = match[1];
const file = readFileSync('tools/templates/report/report.css', 'utf8');
const equal = base === file;
console.log('equal-to-base:', equal);
if (!equal) {
  console.log('base bytes:', Buffer.byteLength(base));
  console.log('file bytes:', Buffer.byteLength(file));
  process.exit(1);
}
