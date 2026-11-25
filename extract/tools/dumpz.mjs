// Read-only: inflate the zlib stream at <offset> and hex-dump its start; list 4CC-looking section tags.
// usage: node dumpz.mjs <file> <offsetHex> [nBytes]   |  node dumpz.mjs <file> find:<4CC> [count] [maxMB]
import fs from 'node:fs';
import zlib from 'node:zlib';

const [f, a, n = 256, maxMB = 480] = process.argv.slice(2);
const fd = fs.openSync(f, 'r');
const inflateAt = off => { const b = Buffer.alloc(24 << 20); const got = fs.readSync(fd, b, 0, b.length, off); return zlib.inflateSync(b.subarray(0, got), { maxOutputLength: 64 << 20 }); };
const hex = (b, len) => { for (let i = 0; i < Math.min(len, b.length); i += 16) { const r = b.subarray(i, i + 16); console.log(i.toString(16).padStart(6, '0'), r.toString('hex').match(/../g).join(' ').padEnd(48), r.toString('latin1').replace(/[^\x20-\x7e]/g, '.')); } };
const tags = b => { const t = {}; for (let i = 0; i + 8 <= b.length; i++) { const s = b.toString('latin1', i, i + 4); if (/^(PSIN|PMAP|PSCH|PSIG|STRF|STRS|STRE|CHKS|RBF0|2TXG)$/.test(s)) t[s] = (t[s] || []).concat(i); } return t; };
if (a.startsWith('find:')) {
  const want = a.slice(5), CH = 32 << 20, size = fs.fstatSync(fd).size; let found = 0;
  for (let base = 0; base < Math.min(size, maxMB * 1048576) && found < +n; base += CH) {
    const b = Buffer.alloc(Math.min(CH + (8 << 20), size - base)); fs.readSync(fd, b, 0, b.length, base);
    for (let i = 0; i < Math.min(CH, b.length) - 2 && found < +n; i++) {
      if (b[i] !== 0x78 || ((b[i] << 8) | b[i + 1]) % 31) continue;
      let o; try { o = zlib.inflateSync(b.subarray(i), { maxOutputLength: 64 << 20 }); } catch { continue; }
      if (o.toString('latin1', 0, 4) !== want) continue;
      found++; console.log(`\n## stream @0x${(base + i).toString(16)} out=${o.length} tags=${JSON.stringify(tags(o))}`); hex(o, 160);
      console.log('strings:', JSON.stringify((o.toString('latin1').match(/[\x20-\x7e]{5,}/g) || []).slice(0, 40)));
    }
  }
} else { const o = inflateAt(parseInt(a, 16)); console.log(`out=${o.length} tags=${JSON.stringify(tags(o))}`); hex(o, +n); }
fs.closeSync(fd);
