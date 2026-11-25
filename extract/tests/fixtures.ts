import type { PanelLine, ProgressItem } from '../lib/progress';

/** Hand-made progress-menu item (no game data). */
export const menuItem = (o: { cat: string; sub: [string, string?]; filter: [string, string?]; id: string; label?: string; lines?: PanelLine[]; specs?: string[] }): ProgressItem => ({
  path: {
    Topics: { id: 't' },
    Categories: { id: o.cat },
    Subcategories: { id: 's' },
    Groups: { id: 'g' },
    Subgroups: { id: o.sub[0], label: o.sub[1] },
    Filters: { id: o.filter[0], label: o.filter[1] },
  },
  id: o.id,
  label: o.label,
  lines: o.lines ?? [],
  statItemIds: o.specs ?? [],
});

/** Text resolver over a plain label → text map (the real one hashes labels with joaat; both are case-insensitive). */
export const textFrom = (m: Record<string, string>) => (label: string | undefined) => (label ? m[label.toUpperCase()] : undefined);
