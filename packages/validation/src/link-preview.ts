import { z } from 'zod';

export const linkPreviewRequestSchema = z.object({
  url: z.string().trim().url().max(2048),
});

export type LinkPreviewRequestDto = z.infer<typeof linkPreviewRequestSchema>;
