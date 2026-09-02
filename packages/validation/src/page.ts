import { z } from 'zod';
import { iconString, uuid } from './primitives';

export const pageTypes = ['document', 'database', 'whiteboard', 'diagram'] as const;

/**
 * `id` is optional so the server still works with older/other callers, but
 * every first-party client always supplies it (§10B.5 invariant 14) —
 * generating the id up front means the offline path and the online path are
 * byte-identical, with no temp-id remapping.
 */
export const createPageSchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1).max(500).default('Untitled'),
  parentPageId: uuid.nullish(),
  type: z.enum(pageTypes).default('document'),
  icon: iconString,
  coverUrl: z.string().max(2048).nullish(),
});

export const updatePageSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    icon: iconString,
    coverUrl: z.string().max(2048).nullish(),
    isFavorite: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const movePageSchema = z.object({
  parentPageId: uuid.nullish(),
  position: z.number().int().nonnegative().optional(),
});

export type CreatePageDto = z.infer<typeof createPageSchema>;
export type UpdatePageDto = z.infer<typeof updatePageSchema>;
export type MovePageDto = z.infer<typeof movePageSchema>;
