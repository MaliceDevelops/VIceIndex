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
