import { z } from 'zod';
import { isoDate, overrides, statValues, type FieldMeta } from './common';

/*
 * Weapon values come from the in-game weapon menu (data.rpf › uiProgressDataset › weapons).
 * The four bars are what the menu draws (CurrentValue out of MaxValue 10). They are display ratings, NOT damage,
 * accuracy, handling or range values, and are named "...Bar" so nobody reads them as such.
 */
export const WEAPON_FIELDS = [
  { stat: 'damageBar', label: 'PROG_WEAPONS_DAMAGE', bar: true },
  { stat: 'accuracyBar', label: 'PROG_WEAPONS_ACCURACY', bar: true },
  { stat: 'handlingBar', label: 'PROG_WEAPONS_HANDLING', bar: true },
  { stat: 'rangeBar', label: 'PROG_WEAPONS_RANGE', bar: true },
  { stat: 'magazine', label: 'PROG_WEAPONS_MAGAZINE', bar: false },
] as const;
export const WEAPON_STATS = WEAPON_FIELDS.map((f) => f.stat);

export function weaponFieldMeta(f: (typeof WEAPON_FIELDS)[number]): FieldMeta {
  const file = `data.rpf › uiProgressDataset › weapon panel › ${f.label}`;
  return f.bar
    ? { file, unit: 'in-game bar (0–10)', confidence: 'high', source: 'file', note: 'Length of the bar the weapon menu draws. A relative rating, not a measured stat.' }
    : { file, unit: 'rounds', confidence: 'medium', source: 'file', note: 'Number the weapon menu shows as "Magazine". Unit read from the label, not measured.' };
}

export const WEAPON_ATTRIBUTES = {
  name: 'file: weapon menu label, English text table',
  manufacturer: 'file: weapon panel "manufacturer" line',
  classId: 'file: weapon menu filter id',
  class: 'file: weapon menu filter label (Guns, Melee, Explosives, Variants)',
  fireStyle: 'file: weapon panel "firing rate" line (a style label, not a rate)',
  caliber: 'file: weapon panel "caliber" line',
} as const;

export const Weapon = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  manufacturer: z.string().min(1).nullable(),
  classId: z.string().min(1),
  class: z.string().min(1).nullable(),
  fireStyle: z.string().min(1).nullable(),
  caliber: z.string().min(1).nullable(),
  category: z.literal('weapon'),
  stats: statValues(WEAPON_STATS),
  overrides: overrides(WEAPON_STATS),
  patch: z.string().min(1),
  updatedAt: isoDate,
});
export const Weapons = z.array(Weapon);
export type Weapon = z.infer<typeof Weapon>;
