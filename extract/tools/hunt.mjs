// Read-only: sample slices of an archive, inflate zlib streams, count stream types and hits for
// distinctive vehicle/weapon names (readable string, or joaat hash LE/BE). usage: node hunt.mjs <file> [slices] [sliceMB]
import fs from 'node:fs';
import zlib from 'node:zlib';

const [f, SL = 12, SMB = 48] = process.argv.slice(2);
const joaat = s => { let h = 0; for (const c of s.toLowerCase()) { h = (h + c.charCodeAt(0)) >>> 0; h = (h + (h << 10)) >>> 0; h ^= h >>> 6; } h = (h + (h << 3)) >>> 0; h ^= h >>> 11; return (h + (h << 15)) >>> 0; };
const NAMES = ['CHandlingData', 'CHandlingDataMgr', 'fInitialDriveMaxFlatVel', 'fInitialDriveForce', 'fTractionCurveMax', 'fCollisionDamageMult', 'fWeaponDamageMult', 'nMonetaryValue', 'CWeaponInfo', 'CWeaponInfoBlob', 'TimeBetweenShots', 'HeadShotDamageModifierPlayer', 'DamageFallOffRangeMin', 'CVehicleModelInfo__InitData', 'CVehicleModelInfo__InitDataList', 'vehicleMakeName', 'CVehicleModelInfoVarGlobal', 'CAmmoInfo', 'CStuntJump', 'CPickupData'];
const pats = NAMES.map(n => { const h = joaat(n), le = Buffer.alloc(4), be = Buffer.alloc(4); le.writeUInt32LE(h); be.writeUInt32BE(h); return { n, s: Buffer.from(n), le, be }; });
const fd = fs.openSync(f, 'r'), size = fs.fstatSync(fd).size, sliceB = +SMB << 20;
const types = {}, str = {}, hash = {}, where = {};
let streams = 0, outB = 0;
for (let k = 0; k < +SL; k++) {
  const base = Math.floor((size - sliceB) * (+SL === 1 ? 0 : k / (+SL - 1)));
  const b = Buffer.alloc(Math.min(sliceB + (8 << 20), size - Math.max(0, base))); fs.readSync(fd, b, 0, b.length, Math.max(0, base));
  for (let i = 0; i < Math.min(sliceB, b.length) - 2;) {
    if (b[i] !== 0x78 || ((b[i] << 8) | b[i + 1]) % 31) { i++; continue; }
    let r; try { r = zlib.inflateSync(b.subarray(i), { info: true, maxOutputLength: 64 << 20 }); } catch { i++; continue; }
    const o = r.buffer; if (o.length < 16) { i++; continue; }
    streams++; outB += o.length;
    const h4 = o.toString('latin1', 0, 4), t = /^(PSIN|RBF0|RSC\d|GFX\*|<\?xm)$/.test(h4) ? h4 : (o.subarray(0, 8).every(x => x === 0) ? 'zeros(resource?)' : 'other');
    types[t] = (types[t] || 0) + 1;
    for (const p of pats) {
      if (o.includes(p.s)) { str[p.n] = (str[p.n] || 0) + 1; (where[p.n] ??= []).length < 3 && where[p.n].push(`0x${(base + i).toString(16)}:${t}`); }
      if (o.includes(p.le) || o.includes(p.be)) hash[p.n] = (hash[p.n] || 0) + 1;
    }
    i += Math.max(r.engine.bytesWritten, 1);
  }
}
console.log(JSON.stringify({ file: f.split(/[\\/]/).pop(), sizeGB: +(size / 2 ** 30).toFixed(2), sampledMB: Math.min(Math.floor(size / 1048576), SL * SMB), streams, outMB: Math.round(outB / 2 ** 20), types, readableHits: str, hashHits: hash, where }));
