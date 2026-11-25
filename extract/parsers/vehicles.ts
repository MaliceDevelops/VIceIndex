import { joaat } from '../lib/joaat';
import { findRoots, parseXml, type XmlNode } from '../lib/metaXml';
import { FIELDS, PerfItem, RatingsItem, type Stat, type Vehicle } from '../schemas/vehicles';

export interface RawVehicle {
  perf?: PerfItem;
  ratings?: RatingsItem;
}

export interface Excluded {
  id: string;
  reasons: ('no_display_name' | 'rdr2_leftover')[];
  record: Omit<Vehicle, 'name'> & { name: string | null };
}

/*
 * RDR2 model naming: a 2–3 digit suffix plus "x" (stagecoach001x, wagon02x, policewagon01x), or names
 * that only exist there. Generic words (canoe, skiff, coach2) are left out on purpose: GTA 6 could use them.
 * Heuristic, confidence low. Matches none of the 286 vehicles in v1.0.2.1.
 */
export const RDR2_MODEL = /^(\w+\d{2,3}x|chuckwagon\w*|utilliwag|gatchuck\w*|keelboat|pirogue\w*|horseboat|hotairballoon\d*|handcart|ship_\w+|\w+_cannon|gatling_gun\w*)$/;

/** <Root><Map><Item key="…">…</Item>…</Map></Root> → key → plain object of `value` attributes (nested blocks become objects). */
function readMap(root: XmlNode): Map<string, unknown> {
  const maps = root.children;
  if (maps.length !== 1 || maps[0].tag !== 'Map') throw new Error(`<${root.tag}>: expected a single <Map>`);
  const out = new Map<string, unknown>();
  for (const item of maps[0].children) {
    const key = item.attrs.key;
    if (item.tag !== 'Item' || !key) throw new Error(`<${root.tag}>: expected <Item key="…">, got <${item.tag}>`);
    if (out.has(key)) throw new Error(`<${root.tag}>: duplicate key "${key}"`);
    out.set(key, toObject(item));
  }
  return out;
}

function toObject(node: XmlNode): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const c of node.children) {
    if (c.tag in o) throw new Error(`<${node.tag}>: repeated <${c.tag}>`);
    o[c.tag] = c.children.length ? toObject(c) : c.attrs.value;
  }
  return o;
}

/** Raw per-vehicle values from every CVehiclePerformanceMaps / CVehicleBaseRatingsAndEstimatesMap in the text. Keys lowercased. */
export function readRawVehicles(archiveText: string): Map<string, RawVehicle> {
  const raw = new Map<string, RawVehicle>();
  const add = (root: string, kind: keyof RawVehicle, schema: typeof PerfItem | typeof RatingsItem) => {
    const spans = findRoots(archiveText, root);
    if (!spans.length) throw new Error(`no <${root}> found`);
    for (const span of spans) {
      for (const [key, obj] of readMap(parseXml(span))) {
        const id = key.toLowerCase();
        const entry = raw.get(id) ?? {};
        if (entry[kind]) throw new Error(`${root}: "${id}" appears in more than one file`);
        const parsed = schema.safeParse(obj);
        if (!parsed.success) throw new Error(`${root} "${key}": ${parsed.error.message}`);
        (entry as Record<string, unknown>)[kind] = parsed.data;
        raw.set(id, entry);
      }
    }
  };
  add('CVehiclePerformanceMaps', 'perf', PerfItem);
  add('CVehicleBaseRatingsAndEstimatesMap', 'ratings', RatingsItem);
  return raw;
}

export function rawValue(v: RawVehicle, path: readonly string[]): number | undefined {
  let cur: unknown = v[path[0] as keyof RawVehicle];
  for (const k of path.slice(1)) cur = (cur as Record<string, unknown> | undefined)?.[k];
  return cur as number | undefined;
}

function toStat(raw: number | undefined, f: (typeof FIELDS)[number]): Stat {
  const missing = raw === undefined || !Number.isFinite(raw) || (f.zeroMeansMissing && raw === 0);
  return {
    value: missing ? null : raw!,
    unit: f.unitBearing ? 'unconfirmed' : null,
    confidence: f.unitBearing ? 'low' : 'medium',
    source: 'file',
  };
}

export function parseVehicles(input: { archiveText: string; names: Map<number, string>; patch: string; today: string }) {
  const records: Vehicle[] = [];
  const excluded: Excluded[] = [];
  const raw = readRawVehicles(input.archiveText);
  for (const id of [...raw.keys()].sort()) {
    const v = raw.get(id)!;
    const name = input.names.get(joaat(id))?.trim() || null;
    const record = {
      id,
      name,
      category: 'vehicle' as const,
      stats: Object.fromEntries(FIELDS.map((f) => [f.stat, toStat(rawValue(v, f.path), f)])),
      patch: input.patch,
      updatedAt: input.today,
    };
    const reasons: Excluded['reasons'] = [];
    if (!name) reasons.push('no_display_name');
    if (RDR2_MODEL.test(id)) reasons.push('rdr2_leftover');
    if (reasons.length) excluded.push({ id, reasons, record });
    else records.push({ ...record, name: name! });
  }
  return { records, excluded };
}

/**
 * Keep `patch` (game version first seen) from the previous run, and keep `updatedAt` unless the record changed,
 * so re-running on the same game build leaves data/vehicles.json byte-identical.
 */
export function carryForward(prev: Vehicle[], next: Vehicle[]): Vehicle[] {
  const old = new Map(prev.map((r) => [r.id, r]));
  const body = (r: Vehicle) => JSON.stringify({ ...r, patch: '', updatedAt: '' });
  return next.map((r) => {
    const o = old.get(r.id);
    if (!o) return r;
    return { ...r, patch: o.patch, updatedAt: body(o) === body(r) ? o.updatedAt : r.updatedAt };
  });
}
