import { findRoots, parseXml, type XmlNode } from '../lib/metaXml';
import { labelsById, line, type ProgressItem } from '../lib/progress';
import { FIELDS, PerfItem, RatingsItem, type Vehicle } from '../schemas/vehicles';

/** Resolves a text label to cleaned English (undefined when the label is missing or has no text). */
export type Text = (label: string | undefined) => string | undefined;

export interface RawVehicle {
  perf?: PerfItem;
  ratings?: RatingsItem;
}

export interface Excluded {
  id: string;
  reasons: ('no_display_name' | 'rdr2_leftover')[];
  record: Omit<Vehicle, 'name'> & { name: string | null };
}

export interface FilterEntry {
  dataset: 'vehicles';
  id: string;
  stat: string;
  rules: (keyof typeof FILTER_RULES)[];
}

export const FILTER_RULES = {
  floor_value: 'Rating exactly 10, the lowest value the file uses for that field (nothing below it). Appears on vehicles the game did not really rate.',
  implausible_estimate: 'Estimate more than 10x the median of that field across all vehicles (e.g. bicycle quarter-mile ≈ 2092).',
  type_inapplicable: 'Land-driving stat on a watercraft or aircraft: braking 60-0, road/off-road estimates, road/off-road ratings.',
} as const;

/*
 * RDR2 model naming: a 2–3 digit suffix plus "x" (stagecoach001x, wagon02x, policewagon01x), or names
 * that only exist there. Generic words (canoe, skiff, coach2) are left out on purpose: GTA 6 could use them.
 * Heuristic, confidence low. Matches none of the 286 vehicles in v1.0.2.1.
 */
export const RDR2_MODEL = /^(\w+\d{2,3}x|chuckwagon\w*|utilliwag|gatchuck\w*|keelboat|pirogue\w*|horseboat|hotairballoon\d*|handcart|ship_\w+|\w+_cannon|gatling_gun\w*)$/;

// ---------- performance/ratings XML (common.rpf) ----------

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

const toValue = (raw: number | undefined, f: (typeof FIELDS)[number]) =>
  raw === undefined || !Number.isFinite(raw) || (f.zeroMeansMissing && raw === 0) ? null : raw;

// ---------- progress-menu panels (data.rpf, RBF0) ----------

export interface VehiclePanel {
  fullName?: string;
  group: string;
  classId: string;
  class?: string;
  secondaryKey?: string;
  secondaryClass?: string;
  era?: string;
}

/**
 * Vehicle entries of the progress menu, keyed by model name. "Standout" entries are preset variants, not models, so they
 * are skipped. The panel's StatId "<MODEL>_BASE_SPEC" names the model (the panel's own ID is sometimes shortened).
 */
export function vehiclePanels(items: ProgressItem[], text: Text): Map<string, VehiclePanel> {
  const out = new Map<string, VehiclePanel>();
  const labels = labelsById(items, text);
  for (const it of items) {
    if (it.path.Categories.id !== 'vehicles_card' || it.path.Subgroups.id === 'vehicles_unique') continue;
    const specs = [...new Set(it.statItemIds.filter((s) => /_base_spec$/i.test(s)).map((s) => s.toLowerCase()))];
    if (specs.length > 1) throw new Error(`vehicle panel ${it.id}: several base specs ${specs.join(', ')}`);
    const key = (specs[0]?.replace(/_base_spec$/, '') ?? it.id).toLowerCase();
    if (out.has(key)) throw new Error(`vehicle panel: model "${key}" listed twice`);
    const secondaryKey = line(it, 'PROG_VEHICLES_SECONDARY_CLASS')?.content;
    const secondaryClass = text(secondaryKey);
    out.set(key, {
      fullName: text(it.label),
      group: it.path.Subgroups.id.replace(/^vehicles_/, ''),
      classId: it.path.Filters.id,
      class: labels.get(it.path.Filters.id) ?? labels.get(it.path.Subgroups.id),
      secondaryKey,
      secondaryClass: secondaryClass && secondaryClass !== 'None' ? secondaryClass : undefined,
      era: text(line(it, 'PROG_VEHICLES_ERA')?.content),
    });
  }
  return out;
}

const stripYear = (s: string) => s.replace(/^'\d{2}\s+/, '').trim();

/** "'93 Dundreary Arcturus" minus "'93 Arcturus" → "Dundreary". Null when the full name doesn't end with the model name. */
export function manufacturerByDiff(full: string, short: string | undefined): string | null {
  if (!short) return null;
  const f = stripYear(full);
  const m = stripYear(short);
  return f !== m && f.endsWith(' ' + m) ? f.slice(0, -m.length - 1).trim() || null : null;
}

/** Longest already-derived manufacturer that starts the full name ("Bravado Swamp Blaster" → "Bravado"). */
export function manufacturerByPrefix(full: string, known: Iterable<string>): string | null {
  const f = stripYear(full);
  let best: string | null = null;
  for (const m of known) if (f.startsWith(m + ' ') && (!best || m.length > best.length)) best = m;
  return best;
}

// ---------- records ----------

const AIRCRAFT = /_VAL_(HELI|PLANE|JET)$/;
const WATERCRAFT = /_VAL_(RIVERB|PERSW|SPEEDB|YACHT|POWERB|WORKB|WATER)$/;
const LAND_ONLY = /^(brakingSixtyZero|est(Road|Offroad)\w+|rating(Road|Offroad)\w+)$/;

export function parseVehicles(input: { archiveText: string; progress: ProgressItem[]; text: Text; patch: string; today: string }) {
  const { text } = input;
  const raw = readRawVehicles(input.archiveText);
  const panels = vehiclePanels(input.progress, text);
  const known = new Set<string>();
  for (const [key, p] of panels) {
    const m = p.fullName && manufacturerByDiff(p.fullName, text(key));
    if (m) known.add(m);
  }

  const records: Vehicle[] = [];
  const excluded: Excluded[] = [];
  const kind = new Map<string, 'aircraft' | 'watercraft'>();
  for (const id of [...raw.keys()].sort()) {
    const v = raw.get(id)!;
    const p = panels.get(id);
    const shortName = text(id) ?? null;
    const name = p?.fullName ?? shortName;
    const record = {
      id,
      name,
      shortName,
      manufacturer: p?.fullName ? (manufacturerByDiff(p.fullName, shortName ?? undefined) ?? manufacturerByPrefix(p.fullName, known)) : null,
      group: p?.group ?? null,
      classId: p?.classId ?? null,
      class: p?.class ?? null,
      secondaryClass: p?.secondaryClass ?? null,
      era: p?.era ?? null,
      category: 'vehicle' as const,
      stats: Object.fromEntries(FIELDS.map((f) => [f.stat, toValue(rawValue(v, f.path), f)])),
      patch: input.patch,
      updatedAt: input.today,
    };
    if (p?.group === 'aircraft' || AIRCRAFT.test(p?.secondaryKey ?? '') || record.stats.takeOffSpeed !== null) kind.set(id, 'aircraft');
    else if (p?.group === 'watercraft' || WATERCRAFT.test(p?.secondaryKey ?? '')) kind.set(id, 'watercraft');
    const reasons: Excluded['reasons'] = [];
    if (!name) reasons.push('no_display_name');
    if (RDR2_MODEL.test(id)) reasons.push('rdr2_leftover');
    if (reasons.length) excluded.push({ id, reasons, record });
    else records.push({ ...record, name: name! });
  }
  return { records, excluded, filters: vehicleFilters(records, kind) };
}

/** Values the site keeps but leaves out of rankings. Data-driven: each rule is re-checked on every extraction. */
export function vehicleFilters(records: Vehicle[], kind: Map<string, 'aircraft' | 'watercraft'>): FilterEntry[] {
  const out = new Map<string, FilterEntry>();
  const flag = (id: string, stat: string, rule: keyof typeof FILTER_RULES) => {
    const k = `${id}\u0000${stat}`;
    const e = out.get(k) ?? { dataset: 'vehicles' as const, id, stat, rules: [] };
    if (!e.rules.includes(rule)) e.rules.push(rule);
    out.set(k, e);
  };
  for (const f of FIELDS) {
    const vals = records.map((r) => r.stats[f.stat]).filter((x): x is number => x !== null);
    if (!vals.length) continue;
    const sorted = [...vals].sort((a, b) => a - b);
    if (f.stat.startsWith('rating') && f.stat !== 'ratingStrength' && sorted[0] === 10)
      for (const r of records) if (r.stats[f.stat] === 10) flag(r.id, f.stat, 'floor_value');
    if (f.stat.startsWith('est')) {
      const median = sorted[sorted.length >> 1];
      for (const r of records) if ((r.stats[f.stat] ?? 0) > 10 * median) flag(r.id, f.stat, 'implausible_estimate');
    }
    if (LAND_ONLY.test(f.stat)) for (const r of records) if (kind.has(r.id) && r.stats[f.stat] !== null) flag(r.id, f.stat, 'type_inapplicable');
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id) || a.stat.localeCompare(b.stat));
}

/**
 * Keep `patch` (game version first seen) and any per-record `overrides` from the previous run, and keep `updatedAt`
 * unless the record changed, so re-running on the same game build leaves the file byte-identical.
 */
export function carryForward<T extends { id: string; patch: string; updatedAt: string; overrides?: unknown }>(prev: T[], next: T[]): T[] {
  const old = new Map(prev.map((r) => [r.id, r]));
  const body = (r: T) => JSON.stringify({ ...r, patch: '', updatedAt: '' });
  return next.map((r) => {
    const o = old.get(r.id);
    if (!o) return r;
    const merged = o.overrides && !r.overrides ? { ...r, overrides: o.overrides } : r;
    return { ...merged, patch: o.patch, updatedAt: body(o) === body(merged) ? o.updatedAt : r.updatedAt };
  });
}
