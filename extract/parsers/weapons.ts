import { labelsById, line, type ProgressItem } from '../lib/progress';
import { WEAPON_FIELDS, type Weapon } from '../schemas/weapons';
import type { Text } from './vehicles';

export interface ExcludedWeapon {
  id: string;
  reasons: 'no_display_name'[];
  record: Omit<Weapon, 'name'> & { name: string | null };
}

/** Weapon-menu entries → records. PSO weapon data is not touched. */
export function parseWeapons(input: { progress: ProgressItem[]; text: Text; patch: string; today: string }) {
  const { text } = input;
  const records: Weapon[] = [];
  const excluded: ExcludedWeapon[] = [];
  const seen = new Set<string>();
  const labels = labelsById(input.progress, text);
  const items = input.progress.filter((it) => it.path.Categories.id === 'weapons_card').sort((a, b) => a.id.toLowerCase().localeCompare(b.id.toLowerCase()));
  for (const it of items) {
    const id = it.id.toLowerCase();
    if (seen.has(id)) throw new Error(`weapon menu: "${id}" listed twice`);
    seen.add(id);
    const stats: Record<string, number | null> = {};
    for (const f of WEAPON_FIELDS) {
      const l = line(it, f.label);
      if (l && l.value === undefined) throw new Error(`${id}: ${f.label} has no value`);
      if (l && f.bar && l.max !== 10) throw new Error(`${id}: ${f.label} max is ${l.max}, expected 10`);
      stats[f.stat] = l?.value ?? null;
    }
    const name = text(it.label) ?? null;
    const record = {
      id,
      name,
      manufacturer: text(line(it, 'PROG_WEAPONS_MANUFACTURER')?.content) ?? null,
      classId: it.path.Filters.id,
      class: labels.get(it.path.Filters.id) ?? null,
      fireStyle: text(line(it, 'PROG_WEAPONS_FIRING_RATE')?.content) ?? null,
      caliber: text(line(it, 'PROG_WEAPONS_CALIBER')?.content) ?? null,
      category: 'weapon' as const,
      stats,
      patch: input.patch,
      updatedAt: input.today,
    };
    if (name) records.push({ ...record, name });
    else excluded.push({ id, reasons: ['no_display_name'], record });
  }
  return { records, excluded };
}
