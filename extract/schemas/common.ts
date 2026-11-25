import { z } from 'zod';

export const Confidence = z.enum(['low', 'medium', 'high']);
export const Source = z.enum(['file', 'derived', 'tested']);

/** One entry of data/<category>.fields.json: how every value of that field should be read. */
export const FieldMeta = z.strictObject({
  file: z.string(),
  unit: z.string().nullable(),
  scale: z.string().optional(),
  confidence: Confidence,
  source: Source,
  note: z.string().optional(),
});
export type FieldMeta = z.infer<typeof FieldMeta>;

/** Per-record exception to a field's metadata (e.g. a value a human measured in-game). Absent unless needed. */
export const Override = z.strictObject({
  unit: z.string().nullable().optional(),
  confidence: Confidence.optional(),
  source: Source.optional(),
  note: z.string().optional(),
});

export const statValues = (names: readonly string[]) => z.strictObject(Object.fromEntries(names.map((s) => [s, z.number().finite().nullable()])));
export const overrides = (names: readonly string[]) => z.partialRecord(z.enum(names as [string, ...string[]]), Override).optional();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
