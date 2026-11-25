import { describe, expect, it } from 'vitest';
import { carryForward, manufacturerByDiff, manufacturerByPrefix, parseVehicles, RDR2_MODEL } from '../parsers/vehicles';
import { Vehicles, type Vehicle } from '../schemas/vehicles';
import { menuItem, textFrom } from './fixtures';

const PERF = ['topSpeed', 'accelZeroTwenty', 'accelZeroSixty', 'brakingSixtyZero', 'turnRadius', 'maxGforceLateral', 'maxGforceSteering', 'idlePitchAngle', 'buoyancyOffsetZ', 'takeOffSpeed'];
const leaves = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `<${k} value="${v}" />`).join('\n');
// takeOffSpeed defaults to 0 like the real files (non-zero means it flies)
const perfItem = (key: string, v: Record<string, string> = {}) =>
  `<Item key="${key}">${leaves(Object.fromEntries(PERF.map((k) => [k, v[k] ?? (k === 'takeOffSpeed' ? '0.000000' : '1.000000')])))}</Item>`;
const est = (quarter: string, inf = false) =>
  leaves({ fTopSpeed: '30.0', fCornerSpeed: '20.0', fAccelerationTime: inf ? 'inf' : '5.5', fBrakingTime: '2.0', fStandingQuarterTime: quarter, fStandingQuarterSpeed: '40.0', fAvgLatTraction: '0.9' });
const rat = (brakes: string) => leaves({ fOverallRating: '50.0', fSpeedRating: '60.0', fHandlingRating: '40.0', fAccelerationRating: '45.0', fBrakesRating: brakes });
const ratingsItem = (key: string, quarter = '15.0', brakes = '10.000000') =>
  `<Item key="${key}"><estimatesRoad>${est(quarter, true)}</estimatesRoad><estimatesOffroad>${est(quarter)}</estimatesOffroad><ratingsRoad>${rat(brakes)}</ratingsRoad><ratingsOffroad>${rat('300.0')}</ratingsOffroad><fStrengthRating value="0.55" /></Item>`;
const perfMap = (...items: string[]) => `<CVehiclePerformanceMaps>\n<Map>${items.join('')}</Map>\n</CVehiclePerformanceMaps>`;
const ratingsMap = (...items: string[]) => `<CVehicleBaseRatingsAndEstimatesMap><Map>${items.join('')}</Map></CVehicleBaseRatingsAndEstimatesMap>`;

// Noise between roots mimics the joined archive text.
const ARCHIVE = [
  '\u0000binary\u0001',
  perfMap(perfItem('busx', { topSpeed: '26.5', accelZeroSixty: '0.000000', idlePitchAngle: '0.000000' }), perfItem('plane1', { takeOffSpeed: '40.0' }), perfItem('wagon02x'), perfItem('ghost')),
  '\u0002',
  perfMap(perfItem('boaty')),
  ratingsMap(ratingsItem('BUSX', '15.0', '10.000000'), ratingsItem('boaty', '2092.5', '400.0'), ratingsItem('plane1', '16.0', '380.0')),
].join('');

const TEXT = textFrom({
  BUSX: 'Test Bus',
  BOATY: 'Boaty',
  WAGON02X: 'Old Wagon',
  DUSTER: 'Duster',
  PROG_VEHICLES_BUSX: "Whiffler Test Bus",
  PROG_VEHICLES_PL1: 'Lapwing Plane One',
  PROG_VEHICLES_DUSTER: 'Lapwing Duster',
  L_SERVICE: 'Service',
  L_TRANSPORT: 'Transport Vehicles',
  L_AIRCRAFT: 'Aircraft',
  PROG_VEHICLES_SECONDARY_CLASS_VAL_PASS: 'Passenger',
  PROG_VEHICLES_SECONDARY_CLASS_VAL_PLANE: 'Plane',
  PROG_VEHICLES_ERA_2000_MODERN: '2000s Modern',
});
const line = (label: string, content: string) => ({ type: 'uiInfoPanelLabelItem', label, content });
const PROGRESS = [
  menuItem({ cat: 'vehicles_card', sub: ['vehicles_service', 'L_SERVICE'], filter: ['vehicles_service_transport', 'L_TRANSPORT'], id: 'busx', label: 'PROG_VEHICLES_BUSX', specs: ['BUSX_BASE_SPEC'],
    lines: [line('PROG_VEHICLES_SECONDARY_CLASS', 'PROG_VEHICLES_SECONDARY_CLASS_VAL_PASS'), line('PROG_VEHICLES_ERA', 'PROG_VEHICLES_ERA_2000_MODERN')] }),
  // the menu's own id is shortened; the base spec names the model
  menuItem({ cat: 'vehicles_card', sub: ['vehicles_aircraft', 'L_AIRCRAFT'], filter: ['vehicles_aircraft_items'], id: 'pl1', label: 'PROG_VEHICLES_PL1', specs: ['PLANE1_BASE_SPEC'],
    lines: [line('PROG_VEHICLES_SECONDARY_CLASS', 'PROG_VEHICLES_SECONDARY_CLASS_VAL_PLANE')] }),
  menuItem({ cat: 'vehicles_card', sub: ['vehicles_aircraft', 'L_AIRCRAFT'], filter: ['vehicles_aircraft_items'], id: 'duster', label: 'PROG_VEHICLES_DUSTER', specs: ['DUSTER_BASE_SPEC'] }),
  // preset variants are not models
  menuItem({ cat: 'vehicles_card', sub: ['vehicles_unique'], filter: ['vehicles_unique_x'], id: 'vehiclepreset_busx_gold', label: 'PROG_VEHICLES_BUSX' }),
];
const run = (archiveText = ARCHIVE, progress = PROGRESS) => parseVehicles({ archiveText, progress, text: TEXT, patch: '1.0.2.1', today: '2026-11-24' });
const byId = (id: string) => run().records.find((r) => r.id === id)!;

describe('parseVehicles', () => {
  it('publishes named, non-RDR2 vehicles sorted by id; excludes the rest with reasons', () => {
    const { records, excluded } = run();
    expect(records.map((r) => r.id)).toEqual(['boaty', 'busx', 'plane1']);
    expect(excluded.map((e) => [e.id, e.reasons])).toEqual([
      ['ghost', ['no_display_name']],
      ['wagon02x', ['rdr2_leftover']],
    ]);
    expect(() => Vehicles.parse(records)).not.toThrow();
  });

  it('joins the progress menu: full name, manufacturer, class, secondary class, era', () => {
    expect(byId('busx')).toMatchObject({ name: 'Whiffler Test Bus', shortName: 'Test Bus', manufacturer: 'Whiffler', group: 'service', classId: 'vehicles_service_transport', class: 'Transport Vehicles', secondaryClass: 'Passenger', era: '2000s Modern' });
    // named only by the menu; manufacturer from a prefix already derived elsewhere ("Lapwing Duster" − "Duster"); class falls back to the subgroup label
    expect(byId('plane1')).toMatchObject({ name: 'Lapwing Plane One', shortName: null, manufacturer: 'Lapwing', group: 'aircraft', class: 'Aircraft', secondaryClass: 'Plane' });
    expect(byId('boaty')).toMatchObject({ name: 'Boaty', manufacturer: null, class: null, era: null });
  });

  it('keeps plain values; "not measured" markers become null, real zeros stay', () => {
    const s = byId('busx').stats;
    expect(s.topSpeed).toBe(26.5);
    expect(s.accelZeroSixty).toBeNull(); // 0 where a metric was not measured
    expect(s.estRoadAccelerationTime).toBeNull(); // "inf"
    expect(s.idlePitchAngle).toBe(0);
    expect(byId('boaty').stats.ratingStrength).toBe(0.55);
    expect(byId('busx').overrides).toBeUndefined();
  });

  it('flags floor values, implausible estimates and type-inapplicable stats for the site to skip', () => {
    const f = run().filters.map((e) => `${e.id}.${e.stat}:${e.rules.join('+')}`);
    expect(f).toContain('busx.ratingRoadBrakes:floor_value');
    expect(f).toContain('boaty.estRoadStandingQuarterTime:implausible_estimate');
    expect(f).toContain('plane1.brakingSixtyZero:type_inapplicable');
    expect(f).toContain('plane1.estRoadStandingQuarterTime:type_inapplicable');
    expect(f.filter((x) => x.startsWith('busx.') && x.includes('type_inapplicable'))).toEqual([]);
  });

  it('fails loudly on unexpected shapes', () => {
    expect(() => run(ARCHIVE.replace('<takeOffSpeed', '<newField value="1" /><takeOffSpeed'))).toThrow();
    expect(() => run(ARCHIVE.replace('<takeOffSpeed value="0.000000" />', ''))).toThrow();
    expect(() => run(ARCHIVE + perfMap(perfItem('BOATY')))).toThrow(/more than one file/);
    expect(() => run(ARCHIVE.replace('value="26.5"', 'value="fast"'))).toThrow();
    expect(() => run('no vehicle data here')).toThrow(/no <CVehiclePerformanceMaps>/);
    expect(() => run(ARCHIVE, [...PROGRESS, PROGRESS[0]])).toThrow(/listed twice/);
  });
});

describe('manufacturer derivation', () => {
  it('subtracts the model name, ignoring the year prefix', () => {
    expect(manufacturerByDiff("'93 Dundreary Arcturus", "'93 Arcturus")).toBe('Dundreary');
    expect(manufacturerByDiff('Übermacht APOC', 'APOC')).toBe('Übermacht');
    expect(manufacturerByDiff('Dump', 'Dump')).toBeNull();
    expect(manufacturerByDiff('Calder CB69', 'Calder')).toBeNull(); // model name is a prefix: ambiguous
  });
  it('uses only manufacturers already derived, longest match first', () => {
    expect(manufacturerByPrefix("'67 Bravado Swamp Blaster", ['Bravado', 'Brav'])).toBe('Bravado');
    expect(manufacturerByPrefix('Stanley Furrow TC 2350', ['Bravado'])).toBeNull();
  });
});

describe('RDR2_MODEL', () => {
  it('matches RDR2 naming but not GTA names that share words', () => {
    for (const id of ['stagecoach001x', 'wagon02x', 'policewagon01x', 'chuckwagon000x', 'hotairballoon01']) expect(id).toMatch(RDR2_MODEL);
    for (const id of ['coach', 'dominatorbuggy', 'golfcarthotrod', 'caracara4x4', 'lasso', 'kayak']) expect(id).not.toMatch(RDR2_MODEL);
  });
});

describe('carryForward', () => {
  const rec = (over: Partial<Vehicle> = {}): Vehicle => ({ ...byId('busx'), ...over });
  it('keeps first-seen patch, unchanged updatedAt and human overrides; bumps updatedAt only on change', () => {
    const old = rec({ patch: '1.0.0.0', updatedAt: '2026-01-01' });
    expect(carryForward([old], [rec()])[0]).toMatchObject({ patch: '1.0.0.0', updatedAt: '2026-01-01' });
    expect(carryForward([old], [rec({ name: 'Renamed' })])[0]).toMatchObject({ patch: '1.0.0.0', updatedAt: '2026-11-24' });
    expect(carryForward([], [rec()])[0]).toMatchObject({ patch: '1.0.2.1', updatedAt: '2026-11-24' });
    const tested = rec({ overrides: { topSpeed: { source: 'tested', unit: 'km/h', confidence: 'high' } } });
    expect(carryForward([tested], [rec()])[0].overrides).toEqual(tested.overrides);
  });
});
