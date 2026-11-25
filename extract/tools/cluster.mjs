// Read-only: walk streams in [start,end) of an archive; group consecutive chunks into files (new file = PSIN/RBF0/xml header
// or a gap); report per-file size and distinct vehicle-model hashes referenced.
import fs from 'node:fs'; import zlib from 'node:zlib';
const [commonF, f, sHex, eHex] = process.argv.slice(2), start = parseInt(sHex, 16), end = parseInt(eHex, 16);
const joaat = s => { let h = 0; for (const c of s.toLowerCase()) { h = (h + c.charCodeAt(0)) >>> 0; h = (h + (h << 10)) >>> 0; h ^= h >>> 6; } h = (h + (h << 3)) >>> 0; h ^= h >>> 11; return (h + (h << 15)) >>> 0; };
const inflAll = (b, from, to) => { const out = []; for (let i = from; i < to - 2;) { if (b[i] !== 0x78 || ((b[i] << 8) | b[i + 1]) % 31) { i++; continue; } let r; try { r = zlib.inflateSync(b.subarray(i), { info: true, maxOutputLength: 64 << 20 }); } catch { i++; continue; } out.push([i, r.engine.bytesWritten, r.buffer]); i += Math.max(r.engine.bytesWritten, 1); } return out; };
const cb = fs.readFileSync(commonF); const txt = inflAll(cb, 0, cb.length).map(x => x[2].toString('utf8')).join('');
const keys = [...new Set([...txt.slice(txt.indexOf('<CVehiclePerformanceMaps>'), txt.indexOf('</CVehicleBaseRatingsAndEstimatesMap>')).matchAll(/<Item key="([^"]+)"/g)].map(m => m[1].toLowerCase()))];
const H = new Map(keys.map(k => [joaat(k), k]));
const fd = fs.openSync(f, 'r'), b = Buffer.alloc(end - start + (8 << 20)); fs.readSync(fd, b, 0, b.length, start);
const files = []; let cur = null, prevEnd = -1;
for (const [i, used, o] of inflAll(b, 0, end - start)) {
  const head = o.toString('latin1', 0, 4), isHead = /^(PSIN|RBF0|<\?xm)$/.test(head) || o.subarray(0, 16).every(x => x === 0);
  if (!cur || isHead || (o.length < 65536 && cur.lastFull === false) || i > prevEnd + 64) { cur = { off: start + i, head: isHead ? head.replace(/[^\x20-\x7e]/g, '.') : 'cont?', chunks: 0, bytes: 0, veh: new Set() }; files.push(cur); }
  cur.chunks++; cur.bytes += o.length; cur.lastFull = o.length === 65536;
  for (let j = 0; j + 4 <= o.length; j += 4) { const v = o.readUInt32LE(j); if (H.has(v)) cur.veh.add(H.get(v)); const w = o.readUInt32BE(j); if (H.has(w)) cur.veh.add(H.get(w)); }
  prevEnd = i + used;
}
for (const x of files.filter(x => x.veh.size >= 5)) console.log(`0x${x.off.toString(16)} ${x.head} chunks=${x.chunks} bytes=${x.bytes} distinctVehicles=${x.veh.size} e.g. ${[...x.veh].slice(0, 10).join(',')}`);
console.log('files in range:', files.length, ' with >=5 vehicles:', files.filter(x => x.veh.size >= 5).length);
