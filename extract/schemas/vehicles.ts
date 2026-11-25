import { z } from 'zod';
import { isoDate, overrides, statValues, type FieldMeta } from './common';

/*
 * One field table drives parsing, data/vehicles.fields.json and SPOTCHECK.md.
 * `path` is where the raw value lives in the game's XML:
 *   perf    = CVehiclePerformanceMaps/Map/Item
 *   ratings = CVehicleBaseRatingsAndEstimatesMap/Map/Item
 * `unitBearing`: physical quantity whose unit is not confirmed yet → unit "unconfirmed", confidence "low".
 * `zeroMeansMissing`: the file writes 0 where a metric was not measured (e.g. a bus's 0–60), so 0 → null.
 *   Not set where 0 is a real value (offsets, angles, ratings).
 */
export interface FieldDef {
  stat: string;
  path: readonly [source: 'perf' | 'ratings', ...keys: string[]];
  unitBearing: boolean;
  zeroMeansMissing: boolean;
}

const perf = (key: string, zeroMeansMissing = true): FieldDef => ({ stat: key, path: ['perf', key], unitBearing: true, zeroMeansMissing });
const estimate = (surface: 'Road' | 'Offroad', key: string): FieldDef => ({
  stat: `est${surface}${key.slice(1)}`,
  path: ['ratings', `estimates${surface}`, key],
  unitBearing: true,
  zeroMeansMissing: true,
});
const rating = (surface: 'Road' | 'Offroad', key: string): FieldDef => ({
  stat: `rating${surface}${key.slice(1).replace(/Rating$/, '')}`,
  path: ['ratings', `ratings${surface}`, key],
  unitBearing: false,
  zeroMeansMissing: false,
});

const ESTIMATE_KEYS = ['fTopSpeed', 'fCornerSpeed', 'fAccelerationTime', 'fBrakingTime', 'fStandingQuarterTime', 'fStandingQuarterSpeed', 'fAvgLatTraction'] as const;
const RATING_KEYS = ['fOverallRating', 'fSpeedRating', 'fHandlingRating', 'fAccelerationRating', 'fBrakesRating'] as const;
const PERF_KEYS = ['topSpeed', 'accelZeroTwenty', 'accelZeroSixty', 'brakingSixtyZero', 'turnRadius', 'maxGforceLateral', 'maxGforceSteering', 'idlePitchAngle', 'buoyancyOffsetZ', 'takeOffSpeed'] as const;

export const FIELDS: readonly FieldDef[] = [
  ...PERF_KEYS.map((k) => perf(k, k !== 'idlePitchAngle' && k !== 'buoyancyOffsetZ')),
  ...(['Road', 'Offroad'] as const).flatMap((s) => ESTIMATE_KEYS.map((k) => estimate(s, k))),
  ...(['Road', 'Offroad'] as const).flatMap((s) => RATING_KEYS.map((k) => rating(s, k))),
  { stat: 'ratingStrength', path: ['ratings', 'fStrengthRating'], unitBearing: false, zeroMeansMissing: false },
];
export const STAT_NAMES = FIELDS.map((f) => f.stat);

// ---- raw XML item shapes (strict: any new/missing field fails loudly) ----

/** A meta `value` attribute: decimal, or `inf` (the file's marker for "not measured"). */
const metaNumber = z
  .string()
  .regex(/^(-?\d+(\.\d+)?([eE][-+]?\d+)?|-?inf)$/i, 'not a meta number')
  .transform((s) => (/inf/i.test(s) ? Infinity : Number(s)));
const block = <K extends string>(keys: readonly K[]) => z.strictObject(Object.fromEntries(keys.map((k) => [k, metaNumber])) as Record<K, typeof metaNumber>);

export const PerfItem = block(PERF_KEYS);
export const RatingsItem = z.strictObject({
  estimatesRoad: block(ESTIMATE_KEYS),
  estimatesOffroad: block(ESTIMATE_KEYS),
  ratingsRoad: block(RATING_KEYS),
  ratingsOffroad: block(RATING_KEYS),
  fStrengthRating: metaNumber,
});
export type PerfItem = z.infer<typeof PerfItem>;
export type RatingsItem = z.infer<typeof RatingsItem>;

// ---- field metadata (data/vehicles.fields.json): declared once per field ----

export function fieldMeta(f: FieldDef): FieldMeta {
  const root = f.path[0] === 'perf' ? 'CVehiclePerformanceMaps' : 'CVehicleBaseRatingsAndEstimatesMap';
  return {
    file: `common.rpf › ${root} › ${f.path.slice(1).join(' › ')}`,
    unit: f.unitBearing ? 'unconfirmed' : null,
    ...(f.unitBearing ? {} : { scale: 'unknown, relative only' }),
    confidence: f.unitBearing ? 'low' : 'medium',
    source: 'file',
  };
}

/** Where each non-stat attribute comes from (written to the fields file so the site can explain it). */
export const ATTRIBUTES = {
  name: 'file: progress-menu vehicle label (data.rpf › uiProgressDataset), English text table; falls back to the model label',
  shortName: 'file: English text label keyed by the model name',
  manufacturer: 'derived: full name minus the model name, or a manufacturer already derived that way prefixing the full name',
  group: 'file: progress-menu subgroup id (cars, bikes, watercraft, aircraft, service)',
  classId: 'file: progress-menu filter id',
  class: 'file: progress-menu filter label (falls back to the subgroup label when the filter has none)',
  secondaryClass: 'file: vehicle panel "secondary class" line',
  era: 'file: vehicle panel "era" line',
} as const;

// ---- output record: plain values; metadata lives in the fields file ----

export const Vehicle = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  shortName: z.string().min(1).nullable(),
  manufacturer: z.string().min(1).nullable(),
  group: z.string().min(1).nullable(),
  classId: z.string().min(1).nullable(),
  class: z.string().min(1).nullable(),
  secondaryClass: z.string().min(1).nullable(),
  era: z.string().min(1).nullable(),
  category: z.literal('vehicle'),
  stats: statValues(STAT_NAMES),
  overrides: overrides(STAT_NAMES),
  patch: z.string().min(1),
  updatedAt: isoDate,
});
export const Vehicles = z.array(Vehicle);
export type Vehicle = z.infer<typeof Vehicle>;
