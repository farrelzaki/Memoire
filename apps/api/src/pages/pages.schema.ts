import { z } from 'zod';

export const pageTypes = ['document', 'database', 'whiteboard', 'diagram'] as const;

export const createPageSchema = z.object({
  title: z.string().trim().min(1).max(500).default('Untitled'),
  parentPageId: z.string().uuid().nullish(),
  type: z.enum(pageTypes).default('document'),
  icon: z.string().max(255).nullish(),
  coverUrl: z.string().max(2048).nullish(),
});

export const updatePageSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    icon: z.string().max(255).nullish(),
    coverUrl: z.string().max(2048).nullish(),
    isFavorite: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const movePageSchema = z.object({
  parentPageId: z.string().uuid().nullish(),
  position: z.number().int().nonnegative().optional(),
});

export type CreatePageDto = z.infer<typeof createPageSchema>;
export type UpdatePageDto = z.infer<typeof updatePageSchema>;
export type MovePageDto = z.infer<typeof movePageSchema>;
