import { z } from 'zod';
import { hexColor, nonEmptyString, uuid } from './primitives';

/**
 * Property type catalogue and per-type config schemas (§20A.2, §20A.3).
 * `relation`/`rollup`/`formula` are Sprint 20 — not in `propertyTypes` yet.
 */
export const propertyTypes = [
  'title',
  'text',
  'number',
  'select',
  'multi_select',
  'status',
  'checkbox',
  'date',
  'url',
  'email',
  'phone',
  'files',
  'created_time',
  'last_edited_time',
  'unique_id',
] as const;

export type PropertyType = (typeof propertyTypes)[number];

const emptyConfigSchema = z.object({}).strict();

const optionSchema = z.object({ id: uuid, name: nonEmptyString, color: hexColor });

const numberConfigSchema = z
  .object({
    format: z.enum(['plain', 'comma', 'percent', 'currency']).default('plain'),
    currency: z.string().length(3).optional(),
    precision: z.number().int().min(0).max(10).optional(),
    display: z.enum(['number', 'bar', 'ring']).default('number'),
  })
  .strict();

const selectConfigSchema = z.object({ options: z.array(optionSchema).default([]) }).strict();

const statusConfigSchema = z
  .object({
    options: z
      .array(optionSchema.extend({ group: z.enum(['todo', 'doing', 'done']) }))
      .default([]),
    defaultOptionId: uuid.optional(),
  })
  .strict();

const dateConfigSchema = z
  .object({
    includeTime: z.boolean().default(false),
    format: z.string().optional(),
    timeFormat: z.string().optional(),
    endDateEnabled: z.boolean().default(false),
    reminder: z
      .object({ offsetMinutes: z.number().int(), timeOfDay: z.string().optional() })
      .nullable()
      .default(null),
  })
  .strict();

const filesConfigSchema = z.object({ maxCount: z.number().int().positive().optional() }).strict();

const uniqueIdConfigSchema = z
  .object({
    prefix: z.string().max(20).optional(),
    // Next value the property will hand out — incremented in the same
    // transaction as row creation (§20A.3), not a display-only counter.
    nextValue: z.number().int().nonnegative().default(1),
  })
  .strict();

/**
 * One schema per property type (§20A.3). Kept as a lookup rather than a
 * `z.discriminatedUnion` on `{id, name, type, config}` — every variant would
 * otherwise repeat `id`/`name` for no benefit, since nothing else about the
 * DTO shape actually varies by type.
 */
export const propertyConfigSchemas: Record<PropertyType, z.ZodType> = {
  title: emptyConfigSchema,
  text: emptyConfigSchema,
  number: numberConfigSchema,
  select: selectConfigSchema,
  multi_select: selectConfigSchema,
  status: statusConfigSchema,
  checkbox: emptyConfigSchema,
  date: dateConfigSchema,
  url: emptyConfigSchema,
  email: emptyConfigSchema,
  phone: emptyConfigSchema,
  files: filesConfigSchema,
  created_time: emptyConfigSchema,
  last_edited_time: emptyConfigSchema,
  unique_id: uniqueIdConfigSchema,
};

function validateConfigForType(
  data: { type: PropertyType; config?: unknown },
  ctx: z.RefinementCtx,
): void {
  const schema = propertyConfigSchemas[data.type];
  const result = schema.safeParse(data.config ?? {});
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ ...issue, path: ['config', ...issue.path] });
    }
  }
}

export const createPropertySchema = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(1).max(100),
    type: z.enum(propertyTypes),
    config: z.record(z.unknown()).optional(),
  })
  .superRefine(validateConfigForType)
  // Re-parse through the per-type schema so defaults (e.g. unique_id's
  // `nextValue: 1`) actually land in the stored config — superRefine only
  // validates, it never rewrites `data`. Safe to `.parse` unguarded here:
  // superRefine already rejected anything this would throw on.
  .transform((data) => ({
    ...data,
    config: propertyConfigSchemas[data.type].parse(data.config ?? {}),
  }));

export const updatePropertySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  config: z.record(z.unknown()).optional(),
});

export const createRowSchema = z.object({
  id: uuid.optional(),
  values: z.record(z.unknown()).optional(),
});

export const updateRowSchema = z.object({
  values: z.record(z.unknown()),
});

export const viewTypes = ['table', 'board', 'calendar', 'gallery'] as const;

export const createViewSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(100),
  type: z.enum(viewTypes),
  config: z.record(z.unknown()).optional(),
});

export const updateViewSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  config: z.record(z.unknown()).optional(),
});

export type CreatePropertyDto = z.infer<typeof createPropertySchema>;
export type UpdatePropertyDto = z.infer<typeof updatePropertySchema>;
export type CreateRowDto = z.infer<typeof createRowSchema>;
export type UpdateRowDto = z.infer<typeof updateRowSchema>;
export type CreateViewDto = z.infer<typeof createViewSchema>;
export type UpdateViewDto = z.infer<typeof updateViewSchema>;
