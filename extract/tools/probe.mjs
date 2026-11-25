// Read-only probe: entropy + printable strings for each container file.
// usage: node probe.mjs <GAME_DIR>
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const SAMPLES = 48, CHUNK = 65536;

function entropy(buf) {
  const c = new Array(256).fill(0);
  for (const b of buf) c[b]++;
  let h = 0;
  for (const n of c) if (n) { const p = n / buf.length; h -= p * Math.log2(p); }
  return h;
}
function strings(buf, min = 8) {
  const out = []; let s = '';
  for (const b of buf) {
    if (b >= 0x20 && b < 0x7f) s += String.fromCharCode(b);
    else { if (s.length >= min) out.push(s); s = ''; }
  }
  if (s.length >= min) out.push(s);
  return out;
}
function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
}

for (const f of walk(root).filter(f => /\.(rpf|ttpf)$/i.test(f)).sort()) {
  const fd = fs.openSync(f, 'r');
  const size = fs.fstatSync(fd).size;
  const read = (off, len) => { const b = Buffer.alloc(Math.min(len, size - off)); fs.readSync(fd, b, 0, b.length, off); return b; };
  const toc = read(0x30, 16384);
  const ents = [];
  const strs = new Set();
  for (let i = 0; i < SAMPLES; i++) {
    const off = Math.floor((size - CHUNK) * i / (SAMPLES - 1));
    const b = read(Math.max(0, off), CHUNK);
    ents.push(entropy(b));
    for (const s of strings(b)) strs.add(s);
  }
  fs.closeSync(fd);
  const hi = ents.filter(e => e > 7.9).length;
  const lo = ents.filter(e => e < 6).length;
  const rel = path.relative(root, f);
  console.log(`\n### ${rel}  size=${size}`);
  console.log(`toc16k entropy=${entropy(toc).toFixed(3)} toc strings=${JSON.stringify(strings(toc).slice(0, 12))}`);
  console.log(`samples: >7.9=${hi}/${SAMPLES}  <6.0=${lo}/${SAMPLES}  min=${Math.min(...ents).toFixed(2)} max=${Math.max(...ents).toFixed(2)}`);
  console.log(`sample strings (${strs.size} unique, first 15): ${JSON.stringify([...strs].filter(s => /[a-z]{4}/i.test(s)).slice(0, 15))}`);
}
