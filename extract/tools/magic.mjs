// Read-only: scan an archive's payload for known signatures; verify zlib/zstd candidates by decompressing.
// usage: node magic.mjs <file> [maxChunks]
import fs from 'node:fs';
import zlib from 'node:zlib';

const f = process.argv[2], MAXC = +(process.argv[3] || 64), CH = 16 << 20;
const MAGICS = {
  zlib_da: Buffer.from([0x78, 0xda]), zlib_9c: Buffer.from([0x78, 0x9c]), zlib_01: Buffer.from([0x78, 0x01]),
  zstd: Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), RPF9: Buffer.from('9FPR'), RSC7: Buffer.from('RSC7'), RSC8: Buffer.from('RSC8'),
  RSC9: Buffer.from('RSC9'), PSIN: Buffer.from('PSIN'), PSCH: Buffer.from('PSCH'), RBF0: Buffer.from('RBF0'), GXT2: Buffer.from('2TXG'),
  xml: Buffer.from('<?xml'), RDS5: Buffer.from('RDS5'), DDS: Buffer.from('DDS |'), RIFF: Buffer.from('RIFF'), BIK: Buffer.from('KB2'),
};
const fd = fs.openSync(f, 'r'), size = fs.fstatSync(fd).size;
const nCh = Math.ceil(size / CH), step = Math.max(1, Math.floor(nCh / MAXC));
const hits = {}, ok = { zlib: 0, zstd: 0 }, okSamples = [];
const dataStart = (() => { const b = Buffer.alloc(8); fs.readSync(fd, b, 0, 8, 0); return b.readUInt32LE(4); })();
for (let c = 0; c < nCh; c += step) {
  const off = c * CH, b = Buffer.alloc(Math.min(CH, size - off));
  fs.readSync(fd, b, 0, b.length, off);
  for (const [k, m] of Object.entries(MAGICS)) {
    let i = b.indexOf(m, c === 0 ? dataStart : 0);
    while (i !== -1) {
      hits[k] = (hits[k] || 0) + 1;
      if (k.startsWith('zlib') && ok.zlib < 2000) {
        try { const o = zlib.inflateSync(b.subarray(i, i + 65536), { finishFlush: zlib.constants.Z_SYNC_FLUSH }); if (o.length > 32) { ok.zlib++; if (okSamples.length < 4) okSamples.push([off + i, o.subarray(0, 48).toString('latin1').replace(/[^\x20-\x7e]/g, '.')]); } } catch {}
      }
      if (k === 'zstd' && ok.zstd < 200) {
        try { const o = zlib.zstdDecompressSync?.(b.subarray(i, i + 262144)); if (o?.length) ok.zstd++; } catch {}
      }
      i = b.indexOf(m, i + 1);
    }
  }
}
fs.closeSync(fd);
console.log(JSON.stringify({ file: f.split(/[\\/]/).slice(-1)[0], size, scannedMB: Math.round(Math.ceil(nCh / step) * CH / 1048576), hits, validDecompress: ok, zlibSamples: okSamples }));
