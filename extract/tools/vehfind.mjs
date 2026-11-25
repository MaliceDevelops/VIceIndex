// Read-only: find streams that reference many vehicle model names (as joaat hash LE/BE, or as string).
// Model names come from CVehiclePerformanceMaps keys in common.rpf. usage: node vehfind.mjs <common.rpf> <target> [slices] [sliceMB]
import fs from 'node:fs';
import zlib from 'node:zlib';

const [commonF, f, SL = 1, SMB = 2000] = process.argv.slice(2);
const joaat = s => { let h = 0; for (const c of s.toLowerCase()) { h = (h + c.charCodeAt(0)) >>> 0; h = (h + (h << 10)) >>> 0; h ^= h >>> 6; } h = (h + (h << 3)) >>> 0; h ^= h >>> 11; return (h + (h << 15)) >>> 0; };
function* streams(buf, from = 0, to = buf.length) {
  for (let i = from; i < to - 2;) {
    if (buf[i] !== 0x78 || ((buf[i] << 8) | buf[i + 1]) % 31) { i++; continue; }
    let r; try { r = zlib.inflateSync(buf.subarray(i), { info: true, maxOutputLength: 64 << 20 }); } catch { i++; continue; }
    yield [i, r.buffer]; i += Math.max(r.engine.bytesWritten, 1);
  }
}
const cb = fs.readFileSync(commonF); let txt = '';
for (const [, o] of streams(cb)) txt += o.toString('utf8');
const s0 = txt.indexOf('<CVehiclePerformanceMaps>'), keys = [...new Set([...txt.slice(s0, txt.indexOf('</CVehicleBaseRatingsAndEstimatesMap>')).matchAll(/<Item key="([^"]+)"/g)].map(m => m[1].toLowerCase()))];
const pats = keys.map(k => { const h = joaat(k), le = Buffer.alloc(4), be = Buffer.alloc(4); le.writeUInt32LE(h); be.writeUInt32BE(h); return { k, le, be, s: Buffer.from(k) }; });
console.log(`vehicle keys: ${keys.length}`);
const fd = fs.openSync(f, 'r'), size = fs.fstatSync(fd).size, sliceB = Math.min(+SMB * 1048576, size);
const hits = [];
for (let k = 0; k < +SL; k++) {
  const base = +SL === 1 ? 0 : Math.floor((size - sliceB) * k / (+SL - 1));
  const b = Buffer.alloc(Math.min(sliceB + (8 << 20), size - base)); fs.readSync(fd, b, 0, b.length, base);
  for (const [i, o] of streams(b, 0, Math.min(sliceB, b.length))) {
    let nh = 0, ns = 0;
    for (const p of pats) { if (o.includes(p.le) || o.includes(p.be)) nh++; if (o.includes(p.s)) ns++; }
    if (nh >= 15 || ns >= 15) hits.push({ off: '0x' + (base + i).toString(16), head: o.toString('latin1', 0, 4).replace(/[^\x20-\x7e]/g, '.'), out: o.length, hashMatches: nh, stringMatches: ns, strs: (o.toString('latin1').match(/[A-Za-z_][\w]{5,}/g) || []).slice(0, 12) });
  }
}
console.log(JSON.stringify({ file: f.split(/[\\/]/).pop(), hits: hits.length }));
for (const h of hits.slice(0, 40)) console.log(JSON.stringify(h));
