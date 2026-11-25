import type { RbfNode } from './rbf0';

/*
 * uiProgressDataset (RBF0) = the in-game progress/collection menu.
 * Tree: Topics > Categories > Subcategories > Groups > Subgroups > Filters > Items, each level an <Item> with ID and LabelText.
 * An item's UnlockedInfoPanelPages hold the panel lines the player sees (labels, meters, values).
 */
const LEVELS = ['Topics', 'Categories', 'Subcategories', 'Groups', 'Subgroups', 'Filters'] as const;
export type Level = (typeof LEVELS)[number];

export interface Node {
  id: string;
  label?: string;
}

export interface ProgressItem {
  path: Record<Level, Node>;
  id: string;
  label?: string;
  lines: PanelLine[];
  /** StatId.ItemId values on the panel (e.g. "AKANE_BASE_SPEC"): the game's own key for the underlying spec. */
  statItemIds: string[];
}

export interface PanelLine {
  type: string;
  label: string;
  content?: string;
  value?: number;
  max?: number;
}

export const child = (n: RbfNode, name: string) => n.children.find((c) => c.name === name);
const str = (n: RbfNode, name: string) => {
  const v = child(n, name)?.value;
  return typeof v === 'string' ? v : undefined;
};
const num = (n: RbfNode, name: string) => {
  const v = child(n, name)?.value;
  return typeof v === 'number' ? v : undefined;
};

export function progressItems(root: RbfNode): ProgressItem[] {
  if (root.name !== 'uiProgressDataset') throw new Error(`not a progress dataset: <${root.name}>`);
  const out: ProgressItem[] = [];
  const walk = (n: RbfNode, depth: number, path: Partial<Record<Level, Node>>) => {
    for (const it of child(n, LEVELS[depth])?.children ?? []) {
      const id = str(it, 'ID');
      if (!id) throw new Error(`${LEVELS[depth]} item without ID`);
      const p = { ...path, [LEVELS[depth]]: { id, label: str(it, 'LabelText') } };
      if (depth + 1 < LEVELS.length) walk(it, depth + 1, p);
      else for (const item of child(it, 'Items')?.children ?? []) out.push(toItem(item, p as Record<Level, Node>));
    }
  };
  walk(root, 0, {});
  return out;
}

function toItem(item: RbfNode, path: Record<Level, Node>): ProgressItem {
  const lines: PanelLine[] = [];
  const statItemIds = new Set<string>();
  const scan = (n: RbfNode) => {
    const type = str(n, 'type');
    const label = str(n, 'ItemLabel');
    if (type?.startsWith('uiInfoPanel') && label) lines.push({ type, label, content: str(n, 'ContentLabel'), value: num(n, 'CurrentValue') ?? num(n, 'Value'), max: num(n, 'MaxValue') });
    const sid = child(n, 'StatId');
    const itemId = sid && str(sid, 'ItemId');
    if (itemId) statItemIds.add(itemId);
    n.children.forEach(scan);
  };
  for (const page of child(item, 'UnlockedInfoPanelPages')?.children ?? []) scan(page);
  const id = str(item, 'ID');
  if (!id) throw new Error(`progress item without ID under ${path.Filters.id}`);
  return { path, id, label: str(item, 'LabelText'), lines, statItemIds: [...statItemIds] };
}

/**
 * Label of every Subgroups/Filters id across all datasets. Story-pack datasets reuse ids (e.g. vehicles_cars_muscle)
 * without repeating the label, so labels are looked up by id rather than taken from the item's own path.
 */
export function labelsById(items: ProgressItem[], resolve: (label: string | undefined) => string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const it of items)
    for (const level of ['Subgroups', 'Filters'] as const) {
      const n = it.path[level];
      const text = resolve(n.label);
      if (!text) continue;
      const prev = out.get(n.id);
      if (prev !== undefined && prev !== text) throw new Error(`progress menu: "${n.id}" is labelled both "${prev}" and "${text}"`);
      out.set(n.id, text);
    }
  return out;
}

/** One line by label; throws if the panel shows the same label twice (ambiguous). */
export function line(item: ProgressItem, label: string): PanelLine | undefined {
  const found = item.lines.filter((l) => l.label === label);
  if (found.length > 1) throw new Error(`${item.id}: panel line ${label} appears ${found.length} times`);
  return found[0];
}
