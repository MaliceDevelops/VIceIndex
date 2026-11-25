import { z } from 'zod';

/*
 * One field table drives parsing, output shape and SPOTCHECK.md.
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

// ---- output record ----

export const Stat = z.strictObject({
  value: z.number().finite().nullable(),
  unit: z.literal('unconfirmed').nullable(),
  confidence: z.enum(['low', 'medium', 'high']),
  source: z.enum(['file', 'derived', 'tested']),
});

export const Vehicle = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  category: z.literal('vehicle'),
  stats: z.strictObject(Object.fromEntries(FIELDS.map((f) => [f.stat, Stat]))),
  patch: z.string().min(1),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const Vehicles = z.array(Vehicle);
export type Stat = z.infer<typeof Stat>;
export type Vehicle = z.infer<typeof Vehicle>;
