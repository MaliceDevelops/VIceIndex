/**
 * Minimal XML reader for RAGE .meta files: elements, attributes, text, comments, <?xml?>.
 * Covers what the game's machine-written meta XML uses and throws on anything else.
 */
export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([\w:.]+)\s*>|<([\w:.]+)((?:\s+[\w:.]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/y;
const ATTR = /([\w:.]+)\s*=\s*"([^"]*)"/g;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e]);

export function parseXml(src: string): XmlNode {
  const root: XmlNode = { tag: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  TOKEN.lastIndex = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (TOKEN.lastIndex < src.length) {
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(src);
    if (!m) throw new Error(`malformed XML at offset ${at}: ${JSON.stringify(src.slice(at, at + 40))}`);
    const [, close, open, attrSrc, selfClose, text] = m;
    const top = stack[stack.length - 1];
    if (close) {
      if (top.tag !== close) throw new Error(`mismatched </${close}> (open: <${top.tag}>) at offset ${at}`);
      stack.pop();
    } else if (open) {
      const node: XmlNode = { tag: open, attrs: {}, children: [], text: '' };
      for (const [, k, v] of (attrSrc ?? '').matchAll(ATTR)) node.attrs[k] = decode(v);
      top.children.push(node);
      if (!selfClose) stack.push(node);
    } else if (text !== undefined && text.trim()) {
      if (top === root) throw new Error(`text outside root element at offset ${at}`);
      top.text += decode(text.trim());
    }
  }
  if (stack.length !== 1) throw new Error(`unclosed <${stack[stack.length - 1].tag}>`);
  if (root.children.length !== 1) throw new Error(`expected one root element, got ${root.children.length}`);
  return root.children[0];
}

/** Every `<tag>…</tag>` span in a (possibly noisy) joined archive text. Throws if one is not closed. */
export function findRoots(text: string, tag: string): string[] {
  const spans: string[] = [];
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  for (let from = text.indexOf(open); from !== -1; from = text.indexOf(open, from + 1)) {
    const end = text.indexOf(close, from);
    if (end === -1) throw new Error(`<${tag}> at ${from} is never closed`);
    spans.push(text.slice(from, end + close.length));
  }
  return spans;
}
