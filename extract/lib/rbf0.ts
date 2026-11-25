/**
 * RBF0: self-describing binary tree (UI data, tunables) found in data.rpf.
 *
 * "RBF0", an optional FB FF u16 marker (FB FF 01 00 in 1,260 of 1,263 files), then tokens. With the marker, integers
 * and floats are 8 bytes; without it (the older layout, 3 files) they are 4 bytes.
 *   FF FF                      close the current element
 *   FD FF u32 len, bytes       raw bytes inside the current element (here: NUL-terminated text)
 *   idx type [u16 len, name]   a field; when idx == number of names seen so far, its name follows inline
 *     type 0x00  element: 6 bytes (u16, u16, u16 = number of attribute fields that follow), then children
 *     type 0x10  integer (u64 / u32 LE)
 *     type 0x20 / 0x30  true / false
 *     type 0x40  float (float64 / float32)
 *     type 0x60  u16 len + ASCII string
 * Unknown types throw: no guessing. Decoded in Phase 2 from data.rpf; see DISCOVERY.md.
 */
export interface RbfNode {
  name: string;
  children: RbfNode[];
  value?: number | boolean | string;
}

const HEADER = 'RBF0';

export function isRbf(buf: Buffer): boolean {
  return buf.length >= 8 && buf.toString('latin1', 0, 4) === HEADER;
}

/** Parses one RBF0 document. Returns the root element and how many bytes it used (chunk joins can leave a tail). */
export function parseRbf(buf: Buffer): { root: RbfNode; length: number } {
  if (!isRbf(buf)) throw new Error('not RBF0');
  const names: string[] = [];
  const stack: RbfNode[] = [];
  let root: RbfNode | undefined;
  const wide = buf[4] === 0xfb && buf[5] === 0xff;
  const size = wide ? 8 : 4;
  let p = wide ? 8 : 4;
  const fail = (msg: string): never => {
    throw new Error(`RBF0 @${p}: ${msg}`);
  };
  const need = (n: number) => p + n <= buf.length || fail('truncated');

  while (p < buf.length) {
    need(2);
    const idx = buf[p];
    const type = buf[p + 1];
    p += 2;
    const top = stack[stack.length - 1];
    if (idx === 0xff) {
      if (type !== 0xff) fail(`bad close token ff ${type.toString(16)}`);
      if (!stack.pop()) fail('close without open element');
      if (!stack.length) return { root: root!, length: p };
      continue;
    }
    if (idx === 0xfd) {
      if (type !== 0xff) fail(`bad bytes token fd ${type.toString(16)}`);
      need(4);
      const len = buf.readUInt32LE(p);
      need(4 + len);
      const raw = buf.subarray(p + 4, p + 4 + len);
      const end = raw.indexOf(0);
      (top ?? fail('bytes outside element')).value = raw.toString('utf8', 0, end === -1 ? raw.length : end);
      p += 4 + len;
      continue;
    }
    if (idx === names.length) {
      need(2);
      const len = buf.readUInt16LE(p);
      need(2 + len);
      names.push(buf.toString('latin1', p + 2, p + 2 + len));
      p += 2 + len;
    } else if (idx > names.length) fail(`field index ${idx} skips ahead of ${names.length} known names`);
    const node: RbfNode = { name: names[idx], children: [] };
    switch (type) {
      case 0x00:
        need(6);
        p += 6;
        if (top) top.children.push(node);
        else if (root) fail('second root element');
        else root = node;
        stack.push(node);
        continue;
      case 0x10:
        need(size);
        node.value = wide ? Number(buf.readBigInt64LE(p)) : buf.readUInt32LE(p);
        p += size;
        break;
      case 0x20:
        node.value = true;
        break;
      case 0x30:
        node.value = false;
        break;
      case 0x40:
        need(size);
        node.value = wide ? buf.readDoubleLE(p) : buf.readFloatLE(p);
        p += size;
        break;
      case 0x60: {
        need(2);
        const len = buf.readUInt16LE(p);
        need(2 + len);
        node.value = buf.toString('latin1', p + 2, p + 2 + len);
        p += 2 + len;
        break;
      }
      default:
        fail(`unknown field type 0x${type.toString(16)} for "${names[idx]}"`);
    }
    (top ?? fail('value outside element')).children.push(node);
  }
  return fail('document ended before its root element closed');
}
