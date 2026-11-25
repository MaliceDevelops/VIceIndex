/** Rockstar's label hash (Jenkins one-at-a-time over the lowercased string). Text-table keys use it. */
export function joaat(s: string): number {
  let h = 0;
  for (const c of s.toLowerCase()) {
    h = (h + c.charCodeAt(0)) >>> 0;
    h = (h + (h << 10)) >>> 0;
    h ^= h >>> 6;
  }
  h = (h + (h << 3)) >>> 0;
  h ^= h >>> 11;
  return (h + (h << 15)) >>> 0;
}
