// Extract vehicles: GAME_DIR (read-only) → data/vehicles.json, data/_meta.json, extract/out/_excluded.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rpf9Streams, rpf9Text } from './lib/rpf9';
import { asciiRatio, isTextTable, parseTextTable } from './lib/textTable';
import { carryForward, parseVehicles } from './parsers/vehicles';
import { Vehicles } from './schemas/vehicles';

const repo = fileURLToPath(new URL('..', import.meta.url));
try {
  process.loadEnvFile(join(repo, '.env'));
} catch {
  // no .env: GAME_DIR may come from the shell
}
const gameDir = process.env.GAME_DIR;
if (!gameDir) throw new Error('GAME_DIR is not set (copy .env.example to .env)');
const readGame = (file: string) => readFileSync(join(gameDir, file)); // only ever reads

const patch = readGame('MicrosoftGame.Config').toString('utf8').match(/<Identity\b[^>]*\bVersion="([^"]+)"/)?.[1];
if (!patch) throw new Error('game version not found in MicrosoftGame.Config');

// Display names. Each language has one global text table (~36k labels) plus thousands of small mission tables.
// English is the global table that is almost all ASCII (0.98 vs ≤ 0.86 for every other language).
const tables = [];
for (const s of rpf9Streams(readGame('data.rpf'))) if (isTextTable(s.data)) tables.push({ offset: s.offset, ...parseTextTable(s.data) });
const maxLabels = Math.max(...tables.map((t) => t.strings.size));
const globals = tables
  .filter((t) => t.strings.size >= maxLabels / 2)
  .map((t) => ({ ...t, ascii: asciiRatio(t.strings) }))
  .sort((a, b) => b.ascii - a.ascii);
const [en, runnerUp] = globals;
const describe = () => globals.map((t) => `0x${t.offset.toString(16)}:${t.ascii.toFixed(3)}`).join(' ');
if (!en || !runnerUp || en.ascii < 0.95 || runnerUp.ascii >= 0.95) throw new Error(`cannot identify the English table by content: ${describe()}`);
if (en.skippedSlots) throw new Error(`English table has ${en.skippedSlots} slots of an unknown kind`);

const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
const { records, excluded } = parseVehicles({ archiveText: rpf9Text(readGame('common.rpf')), names: en.strings, patch, today });

const dataFile = join(repo, 'data', 'vehicles.json');
const prev = existsSync(dataFile) ? Vehicles.parse(JSON.parse(readFileSync(dataFile, 'utf8'))) : [];
const vehicles = Vehicles.parse(carryForward(prev, records)); // strict schema also fixes key order

const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
writeFileSync(dataFile, json(vehicles));
mkdirSync(join(repo, 'extract', 'out'), { recursive: true });
writeFileSync(join(repo, 'extract', 'out', '_excluded.json'), json(excluded));
const metaFile = join(repo, 'data', '_meta.json');
const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
writeFileSync(metaFile, json({ gameVersion: patch, extractedAt: today, counts: { ...meta.counts, vehicles: vehicles.length } }));

console.log(`game ${patch} · text tables ${tables.length} (global: ${describe()}) · English @0x${en.offset.toString(16)} ${en.strings.size} labels`);
console.log(`vehicles ${vehicles.length} written · excluded ${excluded.length} (${excluded.map((e) => `${e.id}:${e.reasons.join('+')}`).join(', ')})`);
