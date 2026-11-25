// Read-only: show bytes right after each uiInfoPanel*MeterItem / FloatLabel label in an RBF0 chunk, to see if values are literal.
import fs from 'node:fs'; import zlib from 'node:zlib';
const [f, offHex] = process.argv.slice(2), fd = fs.openSync(f, 'r'), b = Buffer.alloc(1 << 20); fs.readSync(fd, b, 0, b.length, parseInt(offHex, 16));
const o = zlib.inflateSync(b, { finishFlush: zlib.constants.Z_SYNC_FLUSH }), s = o.toString('latin1');
let n = 0;
for (const m of s.matchAll(/(PROG_(?:VEHICLES|WEAPONS)_(?:SPEED|ACCELERATION|ASPHALT_HANDLING|OFFROAD_HANDLING|STRENGTH|TOP_SPEED|DAMAGE|RANGE|FIRING_RATE|ACCURACY))\x00?/g)) {
  if (n++ > 7) break;
  const at = m.index + m[0].length, seg = o.subarray(at, at + 40);
  const floats = []; for (let j = 0; j + 4 <= seg.length; j++) { const v = seg.readFloatLE(j); if (v > 0.001 && v < 1000 && Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-3) floats.push(`+${j}:${+v.toFixed(4)}`); }
  console.log(m[1].padEnd(34), seg.toString('hex').match(/../g).join(' '), '|', seg.toString('latin1').replace(/[^\x20-\x7e]/g, '.'), '| plausible floats:', floats.join(' '));
}
