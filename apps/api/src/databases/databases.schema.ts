import { z } from 'zod';

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
  name: z.string().trim().min(1).max(100),
  type: z.enum(propertyTypes),
  config: z.record(z.unknown()).optional(),
});

export const updatePropertySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  config: z.record(z.unknown()).optional(),
});

export const createRowSchema = z.object({
  values: z.record(z.unknown()).optional(),
});

export const updateRowSchema = z.object({
  values: z.record(z.unknown()),
});

export const viewTypes = ['table', 'board', 'calendar', 'gallery'] as const;

export const createViewSchema = z.object({
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
export type UpdateRowDto = z.infer<typeof updateRowSchema>;
