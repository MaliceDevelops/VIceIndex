// Read-only: for weapon info-panel RBF0 chunks, show what follows each stat label (literal value vs runtime binding).
import fs from 'node:fs'; import zlib from 'node:zlib';
const [f, ...offs] = process.argv.slice(2), fd = fs.openSync(f, 'r');
for (const offHex of offs) {
  const b = Buffer.alloc(1 << 20); fs.readSync(fd, b, 0, b.length, parseInt(offHex, 16));
  const o = zlib.inflateSync(b, { finishFlush: zlib.constants.Z_SYNC_FLUSH }), s = o.toString('latin1');
  console.log(`\n## chunk @${offHex}`);
  let n = 0;
  for (const m of s.matchAll(/(WEAPONSPEC_\w+|PROG_WEAPONS_(?:DAMAGE|RANGE|FIRING_RATE|ACCURACY|HANDLING|MAGAZINE|CALIBER))\x00/g)) {
    if (n++ > 14) break;
    const at = m.index + m[0].length, seg = o.subarray(at, at + 36);
    const d = seg.length >= 12 && seg[0] === 0xff && seg[1] === 0xff && seg[2] === 0x26 && seg[3] === 0x40 ? ` => float64 ${seg.readDoubleLE(4)}` : '';
    console.log(m[1].padEnd(44), seg.toString('hex').match(/../g).join(' '), '|', seg.toString('latin1').replace(/[^\x20-\x7e]/g, '.'), d);
  }
}
