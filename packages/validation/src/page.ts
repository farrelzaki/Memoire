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

/**
 * Not filtered/sorted/related, so it lives as one JSONB blob rather than
 * dedicated columns (§57 Decision 3). The client always sends the full
 * object — the server overwrites `pages.settings` wholesale, it never merges
 * partial updates server-side (§10B.5 invariant 3 is about coalescing
 * partial *nested* objects, which this avoids by staying flat).
 */
export const pageSettingsSchema = z.object({
  fullWidth: z.boolean().optional(),
  smallText: z.boolean().optional(),
  font: z.enum(['default', 'serif', 'mono']).optional(),
  locked: z.boolean().optional(),
  coverPosition: z.object({ y: z.number().min(0).max(100) }).optional(),
});

export const updatePageSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    icon: iconString,
    coverUrl: z.string().max(2048).nullish(),
    isFavorite: z.boolean().optional(),
    settings: pageSettingsSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

/**
 * `POST /pages/:id/move` body (§19A.4, Sprint 22). Like database rows/views,
 * the client sends sibling **ids**, never a raw position — the server
 * re-derives the fractional midpoint via `fractionalPosition`. Either edge
 * may be `null` for "at the start"/"at the end"; omitting both appends.
 */
export const movePageSchema = z.object({
  parentPageId: uuid.nullish(),
  beforeId: uuid.nullish(),
  afterId: uuid.nullish(),
});

export type CreatePageDto = z.infer<typeof createPageSchema>;
export type UpdatePageDto = z.infer<typeof updatePageSchema>;
export type MovePageDto = z.infer<typeof movePageSchema>;
export type PageSettingsDto = z.infer<typeof pageSettingsSchema>;
