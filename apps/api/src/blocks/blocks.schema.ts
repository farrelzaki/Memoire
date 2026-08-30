import { z } from 'zod';

/**
 * A single block sent by the editor. `content` is the full Tiptap node JSON
 * (self-contained — it carries the node's own `type`), while the top-level
 * `type` is a denormalized copy used for querying/filtering later.
 */
export const blockSchema = z.object({
  type: z.string().trim().min(1).max(100),
  content: z.unknown().optional(),
});

/** Body of PUT /pages/:id/blocks — replaces the page's blocks transactionally. */
export const syncBlocksSchema = z.object({
  blocks: z.array(blockSchema).max(100_000),
});

export type BlockDto = z.infer<typeof blockSchema>;
export type SyncBlocksDto = z.infer<typeof syncBlocksSchema>;
