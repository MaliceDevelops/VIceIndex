import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { labelsById, progressItems, type ProgressItem } from '../lib/progress';
import { parseRbf, type RbfNode } from '../lib/rbf0';
import { nestedArchives, rpf9Files } from '../lib/rpf9';
import { cleanText, englishStrings, type FoundTable } from '../lib/textTable';

// ---- tiny RBF0 encoder for fixtures ----
type Spec = { name: string } & ({ kids: Spec[] } | { int: number } | { float: number } | { str: string } | { bool: boolean } | { text: string });
function encodeRbf(root: Spec, wide = true): Buffer {
  const names: string[] = [];
  const out: Buffer[] = [Buffer.from('RBF0'), wide ? Buffer.from([0xfb, 0xff, 1, 0]) : Buffer.alloc(0)];
  const u16 = (n: number) => Buffer.from([n & 0xff, n >> 8]);
  const field = (name: string, type: number) => {
    let i = names.indexOf(name);
    if (i === -1) {
      i = names.push(name) - 1;
      out.push(Buffer.from([i, type]), u16(name.length), Buffer.from(name));
    } else out.push(Buffer.from([i, type]));
  };
  const num = (n: number, float: boolean) => {
    const b = Buffer.alloc(wide ? 8 : 4);
    if (float) wide ? b.writeDoubleLE(n) : b.writeFloatLE(n);
    else wide ? b.writeBigInt64LE(BigInt(n)) : b.writeUInt32LE(n);
    return b;
  };
  const enc = (s: Spec) => {
    if ('kids' in s || 'text' in s) {
      field(s.name, 0x00);
      out.push(Buffer.alloc(6));
      if ('text' in s) {
        const t = Buffer.from(s.text + '\0');
        const len = Buffer.alloc(4);
        len.writeUInt32LE(t.length);
        out.push(Buffer.from([0xfd, 0xff]), len, t);
      } else s.kids.forEach(enc);
      out.push(Buffer.from([0xff, 0xff]));
    } else if ('int' in s) field(s.name, 0x10), out.push(num(s.int, false));
    else if ('float' in s) field(s.name, 0x40), out.push(num(s.float, true));
    else if ('bool' in s) field(s.name, s.bool ? 0x20 : 0x30);
    else field(s.name, 0x60), out.push(u16(s.str.length), Buffer.from(s.str));
  };
  enc(root);
  return Buffer.concat(out);
}

describe('parseRbf', () => {
  const doc: Spec = { name: 'Root', kids: [{ name: 'Count', int: 30 }, { name: 'Bar', float: 2.5 }, { name: 'On', bool: true }, { name: 'type', str: 'uiThing' }, { name: 'Label', text: 'PROG_X' }] };
  for (const wide of [true, false])
    it(`reads ${wide ? '8-byte (FB FF marker)' : '4-byte (no marker)'} values, strings and byte blocks`, () => {
      const { root, length } = parseRbf(encodeRbf(doc, wide));
      expect(root.children.map((c) => [c.name, c.value])).toEqual([['Count', 30], ['Bar', 2.5], ['On', true], ['type', 'uiThing'], ['Label', 'PROG_X']]);
      expect(length).toBe(encodeRbf(doc, wide).length);
    });

  it('fails loudly on unknown types and truncation', () => {
    const bad = encodeRbf({ name: 'R', kids: [{ name: 'X', int: 1 }] });
    bad[bad.indexOf('X') - 3] = 0x70; // the type byte of field X
    expect(() => parseRbf(bad)).toThrow(/unknown field type 0x70/);
    const good = encodeRbf(doc);
    expect(() => parseRbf(good.subarray(0, good.length - 3))).toThrow(/truncated|ended/);
  });
});

describe('rpf9Files / nestedArchives', () => {
  const archive = (streams: Buffer[], nestedAt?: number) => {
    const head = Buffer.alloc(0x40);
    head.writeUInt32LE(0x52504639, 0);
    head.writeUInt32LE(0x40, 4);
    const parts: Buffer[] = [head];
    for (const s of streams) parts.push(s, Buffer.alloc((16 - (s.length % 16)) % 16));
    const buf = Buffer.concat(parts);
    if (nestedAt !== undefined) (buf.write('9FPR', nestedAt, 'latin1'), buf.writeUInt32LE(0x40, nestedAt + 4));
    return buf;
  };
  it('joins 64 KB chunk runs into files, and starts a new file at a known magic', () => {
    const big = Buffer.alloc(0x10000, 'a');
    const files = [...rpf9Files(archive([deflateSync(big), deflateSync('tail'), deflateSync(big), deflateSync('RBF0next')]))];
    expect(files.map((f) => f.data.length)).toEqual([0x10004, 0x10000, 8]);
  });
  it('finds aligned nested RPF9 headers', () => {
    const buf = archive([Buffer.alloc(0x100)], 0x80);
    expect(nestedArchives(buf)).toEqual([0x80]);
  });
});

describe('englishStrings / cleanText', () => {
  const table = (offset: number, entries: [number, string][]): FoundTable => ({ offset, table: { strings: new Map(entries), skippedSlots: 0 } });
  const big = (offset: number, text: string) => table(offset, Array.from({ length: 100 }, (_, i) => [i, `${text}${i}`]));
  it('picks the ASCII global table, merges its section, and reports conflicting labels', () => {
    const tables = [big(0x100, 'Hello '), table(0x180, [[500, 'Mission text'], [1, 'Different']]), big(0x300, 'Olá ')];
    const en = englishStrings(tables, [0x80, 0x200]);
    expect(en.strings.get(500)).toBe('Mission text'); // from a small table in the same section
    expect(en.strings.get(1)).toBe('Hello 1'); // global table wins
    expect([...en.conflicted]).toEqual([1]);
    expect(en.tables).toBe(2);
  });
  it('refuses when English is not clearly identifiable', () => {
    expect(() => englishStrings([big(0x100, 'Hello '), big(0x300, 'Bye ')], [0x80])).toThrow(/English/);
  });
  it('resolves case tokens and rejects unknown ones', () => {
    expect(cleanText('2010~case_lower~S~case_end~ Modern')).toBe('2010s Modern');
    expect(() => cleanText('a ~n~ b')).toThrow(/token/);
  });
});

// ---- progress menu tree fixtures ----
const el = (name: string, ...children: RbfNode[]): RbfNode => ({ name, children });
const v = (name: string, value: string | number): RbfNode => ({ name, children: [], value });
const level = (lvl: string, id: string, label: string | undefined, ...inner: RbfNode[]) =>
  el(lvl, el('Item', v('ID', id), ...(label ? [v('LabelText', label)] : []), ...inner));

describe('progressItems / labelsById', () => {
  const panel = el('UnlockedInfoPanelPages', el('Item', el('ItemSet', el('Item', v('type', 'uiInfoPanelMeterItem'), v('ItemLabel', 'PROG_SPEED'), v('CurrentValue', 4.3), v('MaxValue', 10)), el('Item', v('type', 'uiInfoPanelFloatLabelItem'), v('ItemLabel', 'PROG_TOP'), el('StatId', v('ItemId', 'AKANE_BASE_SPEC'))))));
  const root = el(
    'uiProgressDataset',
    level('Topics', 't', undefined, level('Categories', 'vehicles_card', 'L_CAT', level('Subcategories', 's', undefined, level('Groups', 'g', undefined, level('Subgroups', 'vehicles_cars', 'L_CARS', level('Filters', 'vehicles_cars_coupe', 'L_COUPE', el('Items', el('Item', v('ID', 'akane'), v('LabelText', 'PROG_AKANE'), panel)))))))),
  );
  it('flattens the menu tree into items with their path and panel lines', () => {
    const [it0] = progressItems(root);
    expect(it0.id).toBe('akane');
    expect(it0.path.Filters).toEqual({ id: 'vehicles_cars_coupe', label: 'L_COUPE' });
    expect(it0.lines).toEqual([
      { type: 'uiInfoPanelMeterItem', label: 'PROG_SPEED', content: undefined, value: 4.3, max: 10 },
      { type: 'uiInfoPanelFloatLabelItem', label: 'PROG_TOP', content: undefined, value: undefined, max: undefined },
    ]);
    expect(it0.statItemIds).toEqual(['AKANE_BASE_SPEC']);
  });
  it('labels ids across datasets and rejects contradictory labels', () => {
    const item = (filterLabel?: string): ProgressItem => ({ ...progressItems(root)[0], path: { ...progressItems(root)[0].path, Filters: { id: 'f', label: filterLabel } } });
    const text = (l?: string) => l && l.toLowerCase();
    expect(labelsById([item(undefined), item('L_A')], text).get('f')).toBe('l_a');
    expect(() => labelsById([item('L_A'), item('L_B')], text)).toThrow(/labelled both/);
  });
});
