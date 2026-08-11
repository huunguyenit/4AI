import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const source = execSync('git show 4685e48:tools/lib/report.mjs', { encoding: 'utf8' });
const match = source.match(/export const CSS = `([\s\S]*?)`;/);
if (!match) throw new Error('CSS block not found');

writeFileSync('.superpowers/sdd/base-report.css', match[1]);
const uin = match[1].match(/\.uin\{[^}]+\}/);
console.log('bytes', Buffer.byteLength(match[1]));
console.log('uin:', uin?.[0]);
