// Extract: GAME_DIR (read-only) → data/*.json and extract/out/_excluded.json (never published).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joaat } from './lib/joaat';
import { progressItems, type ProgressItem } from './lib/progress';
import { isRbf, parseRbf } from './lib/rbf0';
import { nestedArchives, rpf9Files, rpf9Streams, rpf9Text } from './lib/rpf9';
import { cleanText, englishStrings, isTextTable, parseTextTable, type FoundTable } from './lib/textTable';
import { carryForward, FILTER_RULES, parseVehicles, type Text } from './parsers/vehicles';
import { parseWeapons } from './parsers/weapons';
import { ATTRIBUTES, FIELDS, fieldMeta, Vehicles } from './schemas/vehicles';
import { WEAPON_ATTRIBUTES, WEAPON_FIELDS, weaponFieldMeta, Weapons } from './schemas/weapons';

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
const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD

// data.rpf: English text (all tables in the English language section) and the progress-menu datasets.
const data = readGame('data.rpf');
const tables: FoundTable[] = [];
for (const s of rpf9Streams(data)) if (isTextTable(s.data)) tables.push({ offset: s.offset, table: parseTextTable(s.data) });
const en = englishStrings(tables, nestedArchives(data));
const text: Text = (label) => {
  if (!label) return undefined;
  const h = joaat(label);
  if (en.conflicted.has(h)) throw new Error(`text label ${label} has different English strings in different tables`);
  const s = en.strings.get(h);
  return s === undefined ? undefined : cleanText(s) || undefined;
};
const progress: ProgressItem[] = [];
for (const f of rpf9Files(data)) {
  if (!isRbf(f.data)) continue;
  const { root } = parseRbf(f.data);
  if (root.name === 'uiProgressDataset') progress.push(...progressItems(root));
}

// Parse
const v = parseVehicles({ archiveText: rpf9Text(readGame('common.rpf')), progress, text, patch, today });
const w = parseWeapons({ progress, text, patch, today });

// Write
const json = (x: unknown) => JSON.stringify(x, null, 2) + '\n';
const readPrev = <T>(file: string, schema: { parse: (x: unknown) => T }) => (existsSync(file) ? schema.parse(JSON.parse(readFileSync(file, 'utf8'))) : undefined);
const out = (file: string) => join(repo, 'data', file);

const vehicles = Vehicles.parse(carryForward(readPrev(out('vehicles.json'), Vehicles) ?? [], v.records)); // strict schema also fixes key order
const weapons = Weapons.parse(carryForward(readPrev(out('weapons.json'), Weapons) ?? [], w.records));
writeFileSync(out('vehicles.json'), json(vehicles));
writeFileSync(out('vehicles.fields.json'), json({ stats: Object.fromEntries(FIELDS.map((f) => [f.stat, fieldMeta(f)])), attributes: ATTRIBUTES }));
writeFileSync(out('weapons.json'), json(weapons));
writeFileSync(out('weapons.fields.json'), json({ stats: Object.fromEntries(WEAPON_FIELDS.map((f) => [f.stat, weaponFieldMeta(f)])), attributes: WEAPON_ATTRIBUTES }));
writeFileSync(out('_filters.json'), json({ rules: FILTER_RULES, exclude: v.filters }));
const meta = existsSync(out('_meta.json')) ? JSON.parse(readFileSync(out('_meta.json'), 'utf8')) : {};
writeFileSync(out('_meta.json'), json({ gameVersion: patch, extractedAt: today, counts: { ...meta.counts, vehicles: vehicles.length, weapons: weapons.length } }));
mkdirSync(join(repo, 'extract', 'out'), { recursive: true });
writeFileSync(join(repo, 'extract', 'out', '_excluded.json'), json({ vehicles: v.excluded, weapons: w.excluded }));

// Report
const pct = (n: number, d: number) => `${n}/${d} (${Math.round((100 * n) / d)}%)`;
const has = (k: 'class' | 'manufacturer' | 'era' | 'secondaryClass') => vehicles.filter((r) => r[k] !== null).length;
console.log(`game ${patch} · English: ${en.tables} tables, ${en.strings.size} labels, ${en.conflicted.size} conflicted labels (never used)`);
console.log(`vehicles ${vehicles.length} · excluded ${v.excluded.length}: ${v.excluded.map((e) => `${e.id}[${e.reasons}]`).join(', ') || 'none'}`);
console.log(`  full name from menu ${pct(vehicles.filter((r) => r.classId !== null).length, vehicles.length)} · class ${pct(has('class'), vehicles.length)} · manufacturer ${pct(has('manufacturer'), vehicles.length)} · era ${pct(has('era'), vehicles.length)} · secondary class ${pct(has('secondaryClass'), vehicles.length)}`);
console.log(`  not in the vehicle menu: ${vehicles.filter((r) => r.classId === null).map((r) => r.id).join(', ') || 'none'}`);
console.log(`  no manufacturer: ${vehicles.filter((r) => r.manufacturer === null).map((r) => `${r.id} "${r.name}"`).join(', ')}`);
console.log(`weapons ${weapons.length} · excluded ${w.excluded.length} · with bars ${weapons.filter((r) => r.stats.damageBar !== null).length}`);
console.log(`filters ${v.filters.length}: ${Object.keys(FILTER_RULES).map((k) => `${k} ${v.filters.filter((f) => f.rules.includes(k as never)).length}`).join(', ')}`);
