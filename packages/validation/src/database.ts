import { z } from 'zod';
import { uuid } from './primitives';

/**
 * Property/view type catalogues and per-type config schemas (§20A.3, §21A)
 * land in Sprint 18/20. For now this only carries what Sprint 13 needs:
 * client-generated ids on create (§10B.5 invariant 14).
 */

export const propertyTypes = [
  'title',
  'text',
  'number',
  'select',
  'checkbox',
  'date',
  'url',
] as const;

export const createPropertySchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(100),
  type: z.enum(propertyTypes),
  config: z.record(z.unknown()).optional(),
});

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
