import fs from 'node:fs';
const css = fs.readFileSync('tools/templates/report/report.css', 'utf8');
const s = fs.readFileSync('tools/lib/report.mjs', 'utf8');
const m = s.match(/export const CSS = `([\s\S]*?)`;/);
if (!m) {
  console.log('no match');
  process.exit(1);
}
const inline = m[1];
console.log({ inline: inline.length, file: css.length, equal: inline === css });
if (inline !== css) {
  let i = 0;
  while (i < Math.min(inline.length, css.length) && inline[i] === css[i]) i++;
  console.log('firstDiff', i, JSON.stringify(inline.slice(i, i + 20)), JSON.stringify(css.slice(i, i + 20)));
  console.log('tailI', JSON.stringify(inline.slice(-30)));
  console.log('tailF', JSON.stringify(css.slice(-30)));
}
console.log('startOk', css.trimStart().startsWith(':root'));
console.log('endOk', css.includes('@media (max-width:520px)'));
