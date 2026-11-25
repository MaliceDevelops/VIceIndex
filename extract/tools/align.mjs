// Read-only: check whether every zlib stream in an RPF9 archive starts on a 16-byte boundary. usage: node align.mjs <file.rpf>
import fs from 'node:fs'; import zlib from 'node:zlib';
const b = fs.readFileSync(process.argv[2]); const start = b.readUInt32LE(4); let al = 0, un = 0; const ex = [];
for (let i = start; i < b.length - 2;) { if (b[i] !== 0x78 || ((b[i] << 8) | b[i + 1]) % 31) { i++; continue; } let r; try { r = zlib.inflateSync(b.subarray(i), { info: true, maxOutputLength: 64 << 20 }); } catch { i++; continue; } if (i % 16) { un++; if (ex.length < 5) ex.push([i.toString(16), r.buffer.length]); } else al++; i += Math.max(r.engine.bytesWritten, 1); }
console.log(process.argv[2].split('/').pop(), 'aligned', al, 'unaligned', un, JSON.stringify(ex));
