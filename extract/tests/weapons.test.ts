import { describe, expect, it } from 'vitest';
import type { PanelLine } from '../lib/progress';
import { parseWeapons } from '../parsers/weapons';
import { Weapons } from '../schemas/weapons';
import { menuItem, textFrom } from './fixtures';

const meter = (label: string, value: number, max = 10): PanelLine => ({ type: 'uiInfoPanelMeterItem', label, value, max });
const labelLine = (label: string, content: string): PanelLine => ({ type: 'uiInfoPanelLabelItem', label, content });
const gun = (id: string, max = 10) =>
  menuItem({ cat: 'weapons_card', sub: ['f'], filter: ['weapons_guns', 'L_GUNS'], id, label: id.toUpperCase(),
    lines: [meter('PROG_WEAPONS_DAMAGE', 2.8, max), meter('PROG_WEAPONS_ACCURACY', 3), meter('PROG_WEAPONS_HANDLING', 9), meter('PROG_WEAPONS_RANGE', 3),
      { type: 'uiInfoPanelFloatLabelItem', label: 'PROG_WEAPONS_MAGAZINE', value: 8 }, labelLine('PROG_WEAPONS_MANUFACTURER', 'MFR_SCORPIO'),
      labelLine('PROG_WEAPONS_FIRING_RATE', 'STYLE_SEMI'), labelLine('PROG_WEAPONS_CALIBER', 'CAL_380')] });
const melee = menuItem({ cat: 'weapons_card', sub: ['f'], filter: ['weapons_melee', 'L_MELEE'], id: 'weaponspec_melee_bat', label: 'WEAPONSPEC_MELEE_BAT' });
const TEXT = textFrom({ WEAPONSPEC_PISTOL: 'Scorpio Nipper .38', WEAPONSPEC_MELEE_BAT: 'Baseball Bat', L_GUNS: 'Guns', L_MELEE: 'Melee', MFR_SCORPIO: 'Scorpio', STYLE_SEMI: 'Semi-Auto', CAL_380: '.380 Cal' });
const run = (progress = [gun('weaponspec_pistol'), melee, gun('weaponspec_unnamed')]) => parseWeapons({ progress, text: TEXT, patch: '1.0.2.1', today: '2026-11-24' });

describe('parseWeapons', () => {
  it('reads the stat bars as plain values, plus magazine and text attributes', () => {
    const { records } = run();
    expect(records.find((r) => r.id === 'weaponspec_pistol')).toEqual({
      id: 'weaponspec_pistol', name: 'Scorpio Nipper .38', manufacturer: 'Scorpio', classId: 'weapons_guns', class: 'Guns', fireStyle: 'Semi-Auto', caliber: '.380 Cal',
      category: 'weapon', stats: { damageBar: 2.8, accuracyBar: 3, handlingBar: 9, rangeBar: 3, magazine: 8 }, patch: '1.0.2.1', updatedAt: '2026-11-24',
    });
    expect(() => Weapons.parse(records)).not.toThrow();
  });

  it('leaves bars null where the menu shows none, and excludes unnamed weapons', () => {
    const { records, excluded } = run();
    expect(records.find((r) => r.id === 'weaponspec_melee_bat')!.stats).toEqual({ damageBar: null, accuracyBar: null, handlingBar: null, rangeBar: null, magazine: null });
    expect(excluded.map((e) => e.id)).toEqual(['weaponspec_unnamed']);
  });

  it('fails loudly if a bar is not out of 10, or a weapon is listed twice', () => {
    expect(() => run([gun('weaponspec_pistol', 5)])).toThrow(/max is 5/);
    expect(() => run([gun('weaponspec_pistol'), gun('weaponspec_pistol')])).toThrow(/listed twice/);
  });
});
