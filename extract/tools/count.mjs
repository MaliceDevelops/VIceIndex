// Read-only: inflate all zlib streams of an archive in offset order, join them, and count records in chosen XML roots.
// Assumes large files are stored as consecutive 64KB chunks (observed). usage: node count.mjs <file>
import fs from 'node:fs';
import zlib from 'node:zlib';

const b = fs.readFileSync(process.argv[2]), parts = [];
for (let i = 0; i < b.length - 2;) {
  if (b[i] !== 0x78 || ((b[i] << 8) | b[i + 1]) % 31) { i++; continue; }
  let r; try { r = zlib.inflateSync(b.subarray(i), { info: true }); } catch { i++; continue; }
  parts.push(r.buffer.toString('utf8')); i += Math.max(r.engine.bytesWritten, 1);
}
const all = parts.join('');
const ROOTS = { CVehiclePerformanceMaps: /<Item key="([^"]+)"/g, CVehicleBaseRatingsAndEstimatesMap: /<Item key="([^"]+)"/g, CMissions: /<MissionId>([^<]+)</g,
  CTyreDataSet: /<Item[^>]*>/g, CPedInventoryLoadOutManager: /<Name>([^<]+)</g, CTrainConfigs: /<Item[^>]*>/g, CBaitingInfo: /<Item[^>]*>/g,
  GameShape__Data__LocationNameLoopkup: /<Item[^>]*>/g, CTVPlaylistContainer: /<Item[^>]*>/g, CDamageDataManager: /<Item[^>]*>/g, CTuningFile: /<Item[^>]*>/g };
for (const [root, re] of Object.entries(ROOTS)) {
  let from = 0, k = 0;
  while ((from = all.indexOf(`<${root}>`, from)) !== -1) {
    const end = all.indexOf(`</${root}>`, from), span = all.slice(from, end === -1 ? from + 2e6 : end);
    const m = [...span.matchAll(re)].map(x => x[1] ?? '');
    console.log(`${root}#${k++}: closed=${end !== -1} chars=${span.length} records=${m.length} sample=${JSON.stringify(m.filter(Boolean).slice(0, 8))}`);
    from = end === -1 ? from + 1 : end;
  }
}
const mtop = all.match(/<topSpeed value="([\d.]+)"/g)?.length;
console.log('topSpeed entries total:', mtop);
