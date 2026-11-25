// Read-only discovery: inflate zlib streams inside an RPF payload in memory, classify contents, look for hint names.
// Nothing is written to disk except stdout. usage: node carve.mjs <file> [maxMB] [startMB]
import fs from 'node:fs';
import zlib from 'node:zlib';

const f = process.argv[2], MAXMB = +(process.argv[3] || 600), STARTMB = +(process.argv[4] || 0), CH = 32 << 20, OVER = 8 << 20;

const joaat = s => { let h = 0; for (const c of s.toLowerCase()) { h = (h + c.charCodeAt(0)) >>> 0; h = (h + (h << 10)) >>> 0; h ^= h >>> 6; } h = (h + (h << 3)) >>> 0; h ^= h >>> 11; return (h + (h << 15)) >>> 0; };
const HINTS = ['CHandlingData', 'handlingName', 'fMass', 'fInitialDragCoeff', 'fDownforceModifier', 'fInitialDriveMaxFlatVel', 'fInitialDriveForce', 'nInitialDriveGears', 'fDriveBiasFront', 'fDriveInertia', 'fBrakeForce', 'fHandBrakeForce', 'fSteeringLock', 'fTractionCurveMax', 'fTractionLossMult', 'fSuspensionForce', 'fAntiRollBarForce', 'fCollisionDamageMult', 'fWeaponDamageMult', 'fPetrolTankVolume', 'nMonetaryValue', 'strModelFlags', 'strHandlingFlags',
  'CVehicleModelInfo__InitData', 'modelName', 'gameName', 'vehicleMakeName', 'vehicleClass', 'CWeaponInfo', 'Damage', 'TimeBetweenShots', 'ClipSize', 'WeaponRange', 'HeadShotDamageModifierPlayer', 'DamageFallOffRangeMin', 'AccuracySpread', 'BulletsInBatch', 'ReloadTime', 'MaxAmmo'];
const hintHash = HINTS.map(n => { const h = joaat(n), le = Buffer.alloc(4), be = Buffer.alloc(4); le.writeUInt32LE(h); be.writeUInt32BE(h); return { n, le, be }; });
const WORDS = /handling|vehicle|weapon|collectible|stunt|wanted|radio|fishing|hunting|stock|mission|property|business|shop|price|cash|reward|gxt|text|lang|american/i;

const fd = fs.openSync(f, 'r'), size = fs.fstatSync(fd).size;
const types = {}, xmlRoots = {}, hintHits = {}, pathStrs = new Set(), wordStrs = new Set();
let streams = 0, inBytes = 0, outBytes = 0;
const lim = Math.min(size, (STARTMB + MAXMB) * 1048576);
for (let base = STARTMB * 1048576; base < lim; base += CH) {
  const b = Buffer.alloc(Math.min(CH + OVER, size - base));
  fs.readSync(fd, b, 0, b.length, base);
  let i = 0;
  while (i < Math.min(CH, b.length) - 2) {
    if (b[i] !== 0x78 || ((b[i] << 8) | b[i + 1]) % 31 !== 0) { i++; continue; }
    let r;
    try { r = zlib.inflateSync(b.subarray(i), { info: true, maxOutputLength: 64 << 20 }); } catch { i++; continue; }
    const out = r.buffer, used = r.engine.bytesWritten;
    if (out.length < 16) { i++; continue; }
    streams++; inBytes += used; outBytes += out.length;
    const head = out.subarray(0, 8).toString('latin1');
    let t = /^[A-Z0-9]{4}/.test(head) ? head.slice(0, 4) : null;
    const txt = out.subarray(0, 512).toString('latin1');
    const xm = txt.match(/<\?xml[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*<([A-Za-z_][\w:.]*)/) || txt.match(/^﻿?\s*<([A-Za-z_][\w:.]*)/);
    if (xm) { t = 'xml'; xmlRoots[xm[1]] = (xmlRoots[xm[1]] || 0) + 1; }
    t ??= 'bin:' + out.subarray(0, 4).toString('hex');
    types[t] = (types[t] || 0) + 1;
    for (const { n, le, be } of hintHash) if (out.includes(le) || out.includes(be) || out.includes(n)) hintHits[n] = (hintHits[n] || 0) + 1;
    const s = out.toString('latin1').match(/[\x20-\x7e]{6,}/g) || [];
    for (const x of s) {
      if (pathStrs.size < 400 && /[\w-]+\.(meta|ymt|xml|ytd|ydr|yft|gxt2|dat|ysc|txt|json|csv|rel|awc|ymap|ytyp)\b/i.test(x)) pathStrs.add(x.slice(0, 120));
      if (wordStrs.size < 300 && WORDS.test(x) && x.length < 100) wordStrs.add(x);
    }
    i += Math.max(used, 1);
  }
}
fs.closeSync(fd);
const top = o => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 40));
console.log(JSON.stringify({ file: f.split(/[\\/]/).slice(-1)[0], size, scannedMB: Math.round((lim - STARTMB * 1048576) / 1048576), streams, inMB: +(inBytes / 1048576).toFixed(1), outMB: +(outBytes / 1048576).toFixed(1), types: top(types), xmlRoots: top(xmlRoots), hintHits, paths: [...pathStrs].slice(0, 80), words: [...wordStrs].slice(0, 120) }, null, 1));
