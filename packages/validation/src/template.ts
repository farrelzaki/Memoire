import { z } from 'zod';
import { uuid } from './primitives';

/**
 * Row templates (§20D) — pre-filled `database_rows.values` a new row can be
 * seeded from. Scoped to one database via `databaseId`; page templates would
 * reuse the same `templates` table with `databaseId` left null, not a
 * separate table (see `apps/api/src/db/schema.ts`).
 */
// `databaseId` comes from the URL (`POST /databases/:id/templates`), not the
// body — a body-supplied id here would just be redundant with the route.
export const createTemplateSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(100),
  icon: z.string().max(255).nullish(),
  content: z.record(z.unknown()),
});

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  icon: z.string().max(255).nullish(),
  content: z.record(z.unknown()).optional(),
});

export type CreateTemplateDto = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateDto = z.infer<typeof updateTemplateSchema>;
