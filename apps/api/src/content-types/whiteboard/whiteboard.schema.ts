import { z } from 'zod';

export const updateCanvasSchema = z.object({
  elements: z.array(z.unknown()).optional(),
  viewport: z.record(z.unknown()).optional(),
});

export type UpdateCanvasDto = z.infer<typeof updateCanvasSchema>;
