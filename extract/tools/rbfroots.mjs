// Read-only: count RBF0 root struct names (u16 len @10, name @12) in an archive.
import fs from 'node:fs'; import zlib from 'node:zlib';
const f = process.argv[2], CH = 32 << 20, fd = fs.openSync(f, 'r'), size = fs.fstatSync(fd).size, roots = {};
for (let base = 0; base < size; base += CH) {
  const b = Buffer.alloc(Math.min(CH + (8 << 20), size - base)); fs.readSync(fd, b, 0, b.length, base);
  for (let i = 0; i < Math.min(CH, b.length) - 2;) {
    if (b[i] !== 0x78 || ((b[i] << 8) | b[i + 1]) % 31) { i++; continue; }
    let r; try { r = zlib.inflateSync(b.subarray(i), { info: true, maxOutputLength: 64 << 20 }); } catch { i++; continue; }
    const o = r.buffer;
    if (o.length > 12 && o.toString('latin1', 0, 4) === 'RBF0') { const n = o.readUInt16LE(10); const k = o.toString('latin1', 12, 12 + n); roots[k] = (roots[k] || 0) + 1; }
    i += Math.max(r.engine.bytesWritten, 1);
  }
}
console.log(Object.entries(roots).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n'));
