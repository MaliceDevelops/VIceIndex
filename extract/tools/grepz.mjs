// Read-only: inflate zlib streams in a file and print lines matching a regex. usage: node grepz.mjs <file> <regex> [maxMB] [startMB] [maxLines]
import fs from 'node:fs';
import zlib from 'node:zlib';

const [f, re0, maxMB = 600, startMB = 0, maxLines = 400] = process.argv.slice(2);
const re = new RegExp(re0, 'i'), CH = 32 << 20, OVER = 8 << 20;
const fd = fs.openSync(f, 'r'), size = fs.fstatSync(fd).size, lim = Math.min(size, (+startMB + +maxMB) * 1048576);
let n = 0;
for (let base = +startMB * 1048576; base < lim && n < maxLines; base += CH) {
  const b = Buffer.alloc(Math.min(CH + OVER, size - base));
  fs.readSync(fd, b, 0, b.length, base);
  for (let i = 0; i < Math.min(CH, b.length) - 2 && n < maxLines;) {
    if (b[i] !== 0x78 || ((b[i] << 8) | b[i + 1]) % 31) { i++; continue; }
    let r; try { r = zlib.inflateSync(b.subarray(i), { info: true, maxOutputLength: 64 << 20 }); } catch { i++; continue; }
    const seen = new Set();
    for (const line of (r.buffer.toString('latin1').match(/[\x20-\x7e\t]{4,}/g) || [])) {
      const l = line.trim();
      if (re.test(l) && !seen.has(l) && n < maxLines) { seen.add(l); n++; console.log(`0x${(base + i).toString(16)}\t${l.slice(0, 220)}`); }
    }
    i += Math.max(r.engine.bytesWritten, 1);
  }
}
fs.closeSync(fd);
