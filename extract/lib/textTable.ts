/**
 * Text-table resource (one per language inside data.rpf) → Map<joaat(label), string>.
 *
 * Layout, decoded in Phase 1 and checked on all 13 language tables:
 *   - Pointers are virtual addresses based at 0x50000000.
 *   - u64 @0x38 → descriptor array, which ends where u64 @0x08 points. Each descriptor is 16 bytes:
 *     { u32 type, u32 size, u64 ptr }. Descriptor 0 is the string index; type 0x101 is the hash map;
 *     type 0x10 are string pages.
 *   - Hash map: groups of 272 bytes = 16 control bytes (bit 7 set = empty; else = hash & 0x7f) then
 *     16 slots of { u32 hash, u32 0, u64 value }. value & 0xffffff is the slot kind: 1 = direct index
 *     (value >> 24 = string index). Other kinds exist in some languages (Italian, Russian) and are not
 *     understood yet, so they are counted in `skippedSlots`, not guessed.
 *   - String index: 16-byte entries { u64 0, u64 v }. Descriptor (v & 0xff) - 1 is the page,
 *     v >> 20 is the byte offset in that page, and the string is NUL-terminated UTF-8.
 */
const BASE = 0x50000000n;
const GROUP = 272;

interface Descriptor {
  type: number;
  size: number;
  at: number;
}

function descriptors(buf: Buffer): Descriptor[] | null {
  if (buf.length < 0x50) return null;
  const ptr = (a: number) => {
    const v = buf.readBigUInt64LE(a) - BASE;
    return v >= 0n && v < BigInt(buf.length) ? Number(v) : -1;
  };
  const from = ptr(0x38);
  const to = ptr(0x08);
  if (from < 0 || to <= from || (to - from) % 16 || (to - from) / 16 > 32) return null;
  const out: Descriptor[] = [];
  for (let a = from; a < to; a += 16) {
    const at = ptr(a + 8);
    if (at < 0) return null;
    out.push({ type: buf.readUInt32LE(a), size: buf.readUInt32LE(a + 4), at });
  }
  return out;
}

/** Cheap shape check used to pick text tables out of all the streams in an archive. */
export function isTextTable(buf: Buffer): boolean {
  const d = descriptors(buf);
  if (!d || d.length < 3 || d[0].size % 16) return false;
  const maps = d.filter((x) => x.type === 0x101);
  return maps.length === 1 && maps[0].size % GROUP === 0 && d.some((x) => x.type === 0x10);
}

export interface TextTable {
  strings: Map<number, string>;
  /** Hash slots whose kind is not 1 (not understood yet). */
  skippedSlots: number;
}

export function parseTextTable(buf: Buffer): TextTable {
  const d = descriptors(buf);
  if (!d || !isTextTable(buf)) throw new Error('not a text table');
  const index = d[0];
  const map = d.find((x) => x.type === 0x101)!;
  const count = index.size / 16;
  const fail = (msg: string): never => {
    throw new Error(`text table: ${msg}`);
  };

  const texts: string[] = [];
  for (let i = 0; i < count; i++) {
    const v = buf.readBigUInt64LE(index.at + i * 16 + 8);
    if ((v >> 8n) & 0xfffn) fail(`index ${i} has unexpected bits set (0x${v.toString(16)})`);
    const page = d[Number(v & 0xffn) - 1];
    const rel = Number(v >> 20n);
    if (!page || page.type !== 0x10 || rel >= page.size) fail(`index ${i} points outside a string page`);
    const at = page.at + rel;
    if (rel !== 0 && buf[at - 1] !== 0) fail(`index ${i} does not start at a string boundary`);
    const end = buf.indexOf(0, at);
    if (end === -1 || end > page.at + page.size) fail(`index ${i} string is not terminated inside its page`);
    texts.push(buf.toString('utf8', at, end));
  }

  const strings = new Map<number, string>();
  let skippedSlots = 0;
  for (let g = 0; g < map.size / GROUP; g++) {
    const group = map.at + g * GROUP;
    for (let s = 0; s < 16; s++) {
      const ctrl = buf[group + s];
      if (ctrl & 0x80) continue;
      const slot = group + 16 + s * 16;
      const hash = buf.readUInt32LE(slot);
      if ((hash & 0x7f) !== ctrl) fail(`control byte mismatch in group ${g} slot ${s}`);
      const v = buf.readBigUInt64LE(slot + 8);
      if ((v & 0xffffffn) !== 1n) {
        skippedSlots++;
        continue;
      }
      const idx = Number(v >> 24n);
      if (idx >= count) fail(`slot ${g}/${s} index ${idx} out of range`);
      if (strings.has(hash)) fail(`duplicate label hash 0x${hash.toString(16)}`);
      strings.set(hash, texts[idx]);
    }
  }
  return { strings, skippedSlots };
}

/** Share of strings that are pure ASCII. Used to pick the English table by content (English ≈ 0.98; next best ≈ 0.86). */
export function asciiRatio(strings: Map<number, string>): number {
  let ascii = 0;
  for (const s of strings.values()) if (/^[\x00-\x7e]*$/.test(s)) ascii++;
  return strings.size ? ascii / strings.size : 0;
}

export interface FoundTable {
  offset: number;
  table: TextTable;
}

/**
 * English strings, picked by content:
 * 1. Each language has one global table (≥ half the size of the largest). English is the one that is ≥ 95% ASCII,
 *    and it must be the only such table.
 * 2. Every table in the same language section (nested archive, see rpf9.nestedArchives) is English too.
 *    Merged with the global table first. Labels that map to different strings in different tables are returned in
 *    `conflicted` so callers can refuse to use them.
 */
export function englishStrings(tables: FoundTable[], sectionStarts: number[]) {
  const maxLabels = Math.max(...tables.map((t) => t.table.strings.size));
  const globals = tables
    .filter((t) => t.table.strings.size >= maxLabels / 2)
    .map((t) => ({ ...t, ascii: asciiRatio(t.table.strings) }))
    .sort((a, b) => b.ascii - a.ascii);
  const [en, runnerUp] = globals;
  const describe = globals.map((t) => `0x${t.offset.toString(16)}:${t.ascii.toFixed(3)}`).join(' ');
  if (!en || !runnerUp || en.ascii < 0.95 || runnerUp.ascii >= 0.95) throw new Error(`cannot identify the English table by content: ${describe}`);

  const start = Math.max(-1, ...sectionStarts.filter((s) => s <= en.offset));
  const end = Math.min(Infinity, ...sectionStarts.filter((s) => s > en.offset));
  if (start < 0) throw new Error('English global table is not inside a nested archive');
  const section = [en, ...tables.filter((t) => t !== en && t.offset > start && t.offset < end && t.offset !== en.offset)];
  const skipped = section.reduce((n, t) => n + t.table.skippedSlots, 0);
  if (skipped) throw new Error(`English section has ${skipped} text slots of an unknown kind`);

  const strings = new Map<number, string>();
  const conflicted = new Set<number>();
  for (const t of section)
    for (const [h, s] of t.table.strings) {
      const prev = strings.get(h);
      if (prev === undefined) strings.set(h, s);
      else if (prev !== s) conflicted.add(h);
    }
  return { strings, conflicted, tables: section.length, globalOffset: en.offset, describe };
}

/** Resolves the game's inline case tokens (e.g. "2010~case_lower~S~case_end~" → "2010s"). Throws on other tokens. */
export function cleanText(s: string): string {
  const out = s
    .replace(/~case_lower~([\s\S]*?)~case_end~/g, (_, t: string) => t.toLowerCase())
    .replace(/~case_upper~([\s\S]*?)~case_end~/g, (_, t: string) => t.toUpperCase())
    .trim();
  if (out.includes('~')) throw new Error(`unhandled text token in ${JSON.stringify(s)}`);
  return out;
}
