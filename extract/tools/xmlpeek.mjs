// Read-only: list every XML root in an archive; print the first N lines of those whose root matches a regex.
// usage: node xmlpeek.mjs <file> <rootRegex|-> [lines]
import fs from 'node:fs';
import zlib from 'node:zlib';

const [f, re0 = '-', N = 20] = process.argv.slice(2);
const b = fs.readFileSync(f), roots = {};
for (let i = 0; i < b.length - 2;) {
  if (b[i] !== 0x78 || ((b[i] << 8) | b[i + 1]) % 31) { i++; continue; }
  let r; try { r = zlib.inflateSync(b.subarray(i), { info: true }); } catch { i++; continue; }
  const t = r.buffer.toString('utf8'), m = t.slice(0, 600).match(/<\?xml[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*<([A-Za-z_][\w:.]*)/);
  if (m) {
    roots[m[1]] = (roots[m[1]] || 0) + 1;
    if (re0 !== '-' && new RegExp(re0).test(m[1])) console.log(`\n## ${m[1]} @0x${i.toString(16)} (${t.length} chars)\n` + t.split(/\r?\n/).slice(0, +N).join('\n'));
  }
  i += Math.max(r.engine.bytesWritten, 1);
}
if (re0 === '-') console.log(Object.entries(roots).sort().map(([k, v]) => `${v}\t${k}`).join('\n'));
