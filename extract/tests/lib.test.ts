import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { joaat } from '../lib/joaat';
import { findRoots, parseXml } from '../lib/metaXml';
import { rpf9Streams, rpf9Text } from '../lib/rpf9';
import { asciiRatio, isTextTable, parseTextTable } from '../lib/textTable';

describe('joaat', () => {
  it('matches the public GTA model hash for "adder" and ignores case', () => {
    expect(joaat('adder')).toBe(0xb779a091);
    expect(joaat('ADDER')).toBe(0xb779a091);
  });
});

describe('rpf9Streams', () => {
  const align = (n: number) => Math.ceil(n / 16) * 16;
  function archive(parts: Buffer[]): Buffer {
    const chunks: Buffer[] = [Buffer.alloc(0x40)];
    chunks[0].writeUInt32LE(0x52504639, 0); // "9FPR"
    chunks[0].writeUInt32LE(0x40, 4); // data start
    for (const p of parts) chunks.push(p, Buffer.alloc(align(p.length) - p.length));
    return Buffer.concat(chunks);
  }

  it('finds aligned zlib streams in order and joins them', () => {
    const fake = Buffer.from([0x78, 0x9c, 0xff, 0xff, 0xff, 0xff]); // looks like a zlib header, is not a stream
    const buf = archive([deflateSync('hello '), fake, deflateSync('world')]);
    expect([...rpf9Streams(buf)].map((s) => s.data.toString())).toEqual(['hello ', 'world']);
    expect(rpf9Text(buf)).toBe('hello world');
  });

  it('rejects files that are not RPF9', () => {
    expect(() => [...rpf9Streams(Buffer.alloc(0x40))]).toThrow(/not an RPF9/);
  });
});

describe('parseXml / findRoots', () => {
  it('reads elements, attributes, text, comments and the BOM', () => {
    const root = parseXml('﻿<?xml version="1.0"?>\n<!-- c --><Root><A value="1.5" /><B><C>x &amp; y</C></B></Root>');
    expect(root.tag).toBe('Root');
    expect(root.children[0]).toMatchObject({ tag: 'A', attrs: { value: '1.5' } });
    expect(root.children[1].children[0].text).toBe('x & y');
  });

  it('fails loudly on broken XML', () => {
    expect(() => parseXml('<A><B></A>')).toThrow(/mismatched/);
    expect(() => parseXml('<A><B>')).toThrow(/unclosed/);
    expect(() => parseXml('<A></A><B></B>')).toThrow(/one root/);
  });

  it('finds root spans inside noisy archive text', () => {
    const text = '\u0000junk<X><Y/></X>more\u0001<X></X>';
    expect(findRoots(text, 'X')).toEqual(['<X><Y/></X>', '<X></X>']);
    expect(() => findRoots('<X><Y/>', 'X')).toThrow(/never closed/);
  });
});

/** Smallest valid text table: header, 1 hash-map group, string index, one string page, descriptors. */
function textTable(entries: { label: string; text: string; kind?: number }[], opts: { badOffset?: boolean } = {}): Buffer {
  const HM = 0x60;
  const IDX = HM + 272;
  const PAGE = IDX + entries.length * 16;
  const pageBytes = Buffer.from(entries.map((e) => e.text + '\0').join(''), 'utf8');
  const DESC = PAGE + Math.ceil(pageBytes.length / 16) * 16;
  const buf = Buffer.alloc(DESC + 4 * 16 + 16); // +16: the structure that u64@0x08 points at in real tables
  const ptr = (n: number) => 0x50000000n + BigInt(n);
  buf.writeBigUInt64LE(ptr(DESC), 0x38);
  buf.writeBigUInt64LE(ptr(DESC + 4 * 16), 0x08);
  const desc = [
    [0xa8478889, entries.length * 16, IDX], // string index
    [0x99331089, 0x10, DESC], // unknown, present in the game files
    [0x101, 272, HM], // hash map
    [0x10, pageBytes.length, PAGE], // string page → selector 4
  ];
  desc.forEach(([type, size, at], i) => {
    buf.writeUInt32LE(type, DESC + i * 16);
    buf.writeUInt32LE(size, DESC + i * 16 + 4);
    buf.writeBigUInt64LE(ptr(at), DESC + i * 16 + 8);
  });
  pageBytes.copy(buf, PAGE);
  buf.fill(0x80, HM, HM + 16); // all slots empty
  let off = 0;
  entries.forEach((e, i) => {
    const h = joaat(e.label);
    buf[HM + i] = h & 0x7f;
    buf.writeUInt32LE(h, HM + 16 + i * 16);
    buf.writeBigUInt64LE((BigInt(i) << 24n) | BigInt(e.kind ?? 1), HM + 16 + i * 16 + 8);
    buf.writeBigUInt64LE((BigInt(off + (opts.badOffset ? 1 : 0)) << 20n) | 4n, IDX + i * 16 + 8);
    off += Buffer.byteLength(e.text + '\0');
  });
  return buf;
}

describe('parseTextTable', () => {
  it('maps label hashes to strings', () => {
    const t = parseTextTable(textTable([{ label: 'AIRBUS', text: 'Airport Bus' }, { label: 'X', text: 'Ônibus' }]));
    expect(t.strings.get(joaat('airbus'))).toBe('Airport Bus');
    expect(t.strings.get(joaat('X'))).toBe('Ônibus');
    expect(t.skippedSlots).toBe(0);
    expect(asciiRatio(t.strings)).toBe(0.5);
  });

  it('skips slot kinds it does not understand instead of guessing', () => {
    const t = parseTextTable(textTable([{ label: 'A', text: 'a' }, { label: 'B', text: 'b', kind: 7 }]));
    expect([...t.strings.values()]).toEqual(['a']);
    expect(t.skippedSlots).toBe(1);
  });

  it('fails loudly when an index does not land on a string boundary', () => {
    expect(() => parseTextTable(textTable([{ label: 'A', text: 'abc' }, { label: 'B', text: 'def' }], { badOffset: true }))).toThrow(/boundary/);
  });

  it('does not mistake other buffers for text tables', () => {
    expect(isTextTable(Buffer.alloc(0x200))).toBe(false);
    expect(() => parseTextTable(Buffer.alloc(0x200))).toThrow(/not a text table/);
  });
});
