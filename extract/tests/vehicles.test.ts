import { describe, expect, it } from 'vitest';
import { joaat } from '../lib/joaat';
import { carryForward, parseVehicles, RDR2_MODEL } from '../parsers/vehicles';
import { Vehicles, type Vehicle } from '../schemas/vehicles';

const PERF = ['topSpeed', 'accelZeroTwenty', 'accelZeroSixty', 'brakingSixtyZero', 'turnRadius', 'maxGforceLateral', 'maxGforceSteering', 'idlePitchAngle', 'buoyancyOffsetZ', 'takeOffSpeed'];
const leaves = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `<${k} value="${v}" />`).join('\n');
const perfItem = (key: string, v: Record<string, string> = {}) =>
  `<Item key="${key}">${leaves(Object.fromEntries(PERF.map((k) => [k, v[k] ?? '1.000000'])))}</Item>`;
const est = (inf = false) => leaves({ fTopSpeed: '30.0', fCornerSpeed: '20.0', fAccelerationTime: inf ? 'inf' : '5.5', fBrakingTime: '2.0', fStandingQuarterTime: '15.0', fStandingQuarterSpeed: '40.0', fAvgLatTraction: '0.9' });
const rat = leaves({ fOverallRating: '50.0', fSpeedRating: '60.0', fHandlingRating: '40.0', fAccelerationRating: '45.0', fBrakesRating: '0.000000' });
const ratingsItem = (key: string) =>
  `<Item key="${key}"><estimatesRoad>${est(true)}</estimatesRoad><estimatesOffroad>${est()}</estimatesOffroad><ratingsRoad>${rat}</ratingsRoad><ratingsOffroad>${rat}</ratingsOffroad><fStrengthRating value="0.55" /></Item>`;
const perfMap = (...items: string[]) => `<CVehiclePerformanceMaps>\n<Map>${items.join('')}</Map>\n</CVehiclePerformanceMaps>`;
const ratingsMap = (...items: string[]) => `<CVehicleBaseRatingsAndEstimatesMap><Map>${items.join('')}</Map></CVehicleBaseRatingsAndEstimatesMap>`;

// Noise between roots mimics the joined archive text.
const ARCHIVE = [
  '\u0000binary\u0001',
  perfMap(perfItem('busx', { topSpeed: '26.5', accelZeroSixty: '0.000000', idlePitchAngle: '0.000000' }), perfItem('plane1'), perfItem('wagon02x')),
  '\u0002',
  perfMap(perfItem('boaty')),
  ratingsMap(ratingsItem('BUSX')),
].join('');
const NAMES = new Map([
  [joaat('busx'), 'Test Bus'],
  [joaat('boaty'), 'Boaty'],
  [joaat('wagon02x'), 'Old Wagon'],
]);
const run = (archiveText = ARCHIVE) => parseVehicles({ archiveText, names: NAMES, patch: '1.0.2.1', today: '2026-11-24' });

describe('parseVehicles', () => {
  it('keeps only named, non-RDR2 vehicles, sorted by id, with a valid schema', () => {
    const { records, excluded } = run();
    expect(records.map((r) => r.id)).toEqual(['boaty', 'busx']);
    expect(excluded.map((e) => [e.id, e.reasons])).toEqual([
      ['plane1', ['no_display_name']],
      ['wagon02x', ['rdr2_leftover']],
    ]);
    expect(() => Vehicles.parse(records)).not.toThrow();
  });

  it('labels unit-bearing stats as unconfirmed/low and ratings as unitless/medium', () => {
    const bus = run().records.find((r) => r.id === 'busx')!;
    expect(bus).toMatchObject({ name: 'Test Bus', category: 'vehicle', patch: '1.0.2.1', updatedAt: '2026-11-24' });
    expect(bus.stats.topSpeed).toEqual({ value: 26.5, unit: 'unconfirmed', confidence: 'low', source: 'file' });
    expect(bus.stats.ratingRoadSpeed).toEqual({ value: 60, unit: null, confidence: 'medium', source: 'file' });
  });

  it('turns "not measured" markers into null but keeps real zeros', () => {
    const s = run().records.find((r) => r.id === 'busx')!.stats;
    expect(s.accelZeroSixty.value).toBeNull(); // 0 where a metric was not measured
    expect(s.estRoadAccelerationTime.value).toBeNull(); // "inf"
    expect(s.estOffroadAccelerationTime.value).toBe(5.5);
    expect(s.idlePitchAngle.value).toBe(0); // offsets/angles: 0 is a value
    expect(s.ratingRoadBrakes.value).toBe(0); // ratings: 0 is a value
  });

  it('merges files case-insensitively and leaves absent data null', () => {
    const { records } = run();
    expect(records.find((r) => r.id === 'busx')!.stats.ratingStrength.value).toBe(0.55); // ratings key was "BUSX"
    expect(records.find((r) => r.id === 'boaty')!.stats.ratingStrength.value).toBeNull();
  });

  it('fails loudly on unexpected shapes', () => {
    expect(() => run(ARCHIVE.replace('<takeOffSpeed', '<newField value="1" /><takeOffSpeed'))).toThrow();
    expect(() => run(ARCHIVE.replace('<takeOffSpeed value="1.000000" />', ''))).toThrow();
    expect(() => run(ARCHIVE + perfMap(perfItem('BOATY')))).toThrow(/more than one file/);
    expect(() => run(ARCHIVE.replace('value="26.5"', 'value="fast"'))).toThrow();
    expect(() => run('no vehicle data here')).toThrow(/no <CVehiclePerformanceMaps>/);
  });
});

describe('RDR2_MODEL', () => {
  it('matches RDR2 naming but not GTA names that share words', () => {
    for (const id of ['stagecoach001x', 'wagon02x', 'policewagon01x', 'chuckwagon000x', 'hotairballoon01']) expect(id).toMatch(RDR2_MODEL);
    for (const id of ['coach', 'dominatorbuggy', 'golfcarthotrod', 'caracara4x4', 'lasso', 'kayak']) expect(id).not.toMatch(RDR2_MODEL);
  });
});

describe('carryForward', () => {
  const rec = (over: Partial<Vehicle> = {}): Vehicle => ({ ...run().records[0], ...over });
  it('keeps first-seen patch and unchanged updatedAt; bumps updatedAt only on change', () => {
    const old = rec({ patch: '1.0.0.0', updatedAt: '2026-01-01' });
    expect(carryForward([old], [rec()])[0]).toMatchObject({ patch: '1.0.0.0', updatedAt: '2026-01-01' });
    expect(carryForward([old], [rec({ name: 'Renamed' })])[0]).toMatchObject({ patch: '1.0.0.0', updatedAt: '2026-11-24' });
    expect(carryForward([], [rec()])[0]).toMatchObject({ patch: '1.0.2.1', updatedAt: '2026-11-24' });
  });
});
