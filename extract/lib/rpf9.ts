import { inflateSync } from 'node:zlib';

const RPF9_MAGIC = 0x52504639; // bytes "9FPR"

export interface ZStream {
  offset: number;
  data: Buffer;
}

/**
 * Yields every zlib stream in an RPF9 archive's data area, in file order.
 * The TOC is encrypted (DISCOVERY.md §3), so files are found by content instead of by name.
 * Streams start on 16-byte boundaries (checked on every stream of common.rpf and data.rpf).
 * Large files are split into consecutive 64 KB chunks, so concatenating streams in order rebuilds them.
 */
export function* rpf9Streams(archive: Buffer): Generator<ZStream> {
  if (archive.length < 0x30 || archive.readUInt32LE(0) !== RPF9_MAGIC) throw new Error('not an RPF9 archive');
  const dataStart = archive.readUInt32LE(4);
  if (dataStart % 16 || dataStart > archive.length) throw new Error(`unexpected RPF9 data start 0x${dataStart.toString(16)}`);
  let i = dataStart;
  while (i + 2 <= archive.length) {
    if (archive[i] === 0x78 && ((archive[i] << 8) | archive[i + 1]) % 31 === 0) {
      try {
        // `info: true` returns the engine too, which tells us how many input bytes the stream used.
        const r = inflateSync(archive.subarray(i), { info: true, maxOutputLength: 64 << 20 }) as unknown as {
          buffer: Buffer;
          engine: { bytesWritten: number };
        };
        yield { offset: i, data: r.buffer };
        i += Math.ceil(r.engine.bytesWritten / 16) * 16;
        continue;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw e; // real stream, never drop silently
        // otherwise: not a stream; fall through
      }
    }
    i += 16;
  }
}

const CHUNK = 0x10000;
const FILE_MAGIC = /^(RBF0|PSIN|<\?xm|﻿<\?x)/;

/**
 * Rebuilds files from chunk runs. A file continues while its previous chunk was exactly 64 KB,
 * unless the next chunk starts with a known file magic (covers files that are an exact multiple of 64 KB).
 */
export function* rpf9Files(archive: Buffer): Generator<ZStream> {
  let run: ZStream[] = [];
  const flush = () => ({ offset: run[0].offset, data: run.length === 1 ? run[0].data : Buffer.concat(run.map((r) => r.data)) });
  for (const s of rpf9Streams(archive)) {
    const continues = run.length > 0 && run[run.length - 1].data.length === CHUNK && !FILE_MAGIC.test(s.data.toString('latin1', 0, 6));
    if (run.length && !continues) {
      yield flush();
      run = [];
    }
    run.push(s);
  }
  if (run.length) yield flush();
}

/**
 * Offsets of nested RPF9 archives. Their headers are stored uncompressed and 16-byte aligned inside the parent.
 * data.rpf nests one archive per language (data/lang/<language>_final.rpf), so these mark the language sections.
 */
export function nestedArchives(archive: Buffer): number[] {
  const out: number[] = [];
  for (let i = archive.indexOf('9FPR', 16, 'latin1'); i !== -1; i = archive.indexOf('9FPR', i + 1, 'latin1')) {
    if (i % 16 || archive.length - i < 0x30) continue;
    const dataStart = archive.readUInt32LE(i + 4);
    if (dataStart % 16 === 0 && dataStart > 0x30 && i + dataStart <= archive.length) out.push(i);
  }
  return out;
}

/** All streams of an archive joined in order and decoded as UTF-8. Good for locating XML; binary parts become noise. */
export function rpf9Text(archive: Buffer): string {
  return Buffer.concat([...rpf9Streams(archive)].map((s) => s.data)).toString('utf8');
}
