// Read-only: are text-table keys joaat hashes? Count label hashes found in the text resource at a given offset.
import fs from 'node:fs'; import zlib from 'node:zlib';
const [f, offHex] = process.argv.slice(2);
const joaat = s => { let h = 0; for (const c of s.toLowerCase()) { h = (h + c.charCodeAt(0)) >>> 0; h = (h + (h << 10)) >>> 0; h ^= h >>> 6; } h = (h + (h << 3)) >>> 0; h ^= h >>> 11; return (h + (h << 15)) >>> 0; };
const fd = fs.openSync(f, 'r'), b = Buffer.alloc(24 << 20), n = fs.readSync(fd, b, 0, b.length, parseInt(offHex, 16));
const o = zlib.inflateSync(b.subarray(0, n));
const labels = ['LOCATION_BEANMACHINE_NAME', 'LOCATION_KINGPINBOWLING_NAME', 'LOCATION_STARLETMOTEL_NAME', 'PROG_INT_PROLO_DESC_REPLAY', 'PROG_INT_CHASE_DESC_REPLAY', 'PROG_FT_AMUCO_DESC_REPLAY', 'AIRBUS', 'AIRTUG', 'AMBULANCE', 'BLADE500', 'NOT_A_REAL_LABEL_XYZ', 'ANOTHER_FAKE_LABEL_123'];
for (const l of labels) { const h = joaat(l), le = Buffer.alloc(4); le.writeUInt32LE(h); const be = Buffer.alloc(4); be.writeUInt32BE(h); console.log(l.padEnd(30), h.toString(16).padStart(8, '0'), 'LE:', o.indexOf(le), 'BE:', o.indexOf(be)); }
