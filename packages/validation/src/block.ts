import { z } from 'zod';
import { uuid } from './primitives';

/**
 * A Tiptap/ProseMirror node, self-contained JSON. Recursive because a node's
 * `content` is itself a list of nodes (§11E — nested blocks stay in JSON,
 * never normalized into rows).
 */
export type TiptapNodeDto = {
  type?: string;
  text?: string;
  content?: TiptapNodeDto[];
  attrs?: Record<string, unknown> & { blockId?: string };
  marks?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export const tiptapNodeSchema: z.ZodType<TiptapNodeDto> = z.lazy(() =>
  z
    .object({
      type: z.string().optional(),
      text: z.string().optional(),
      content: z.array(tiptapNodeSchema).optional(),
      attrs: z.record(z.unknown()).optional(),
      marks: z.array(z.record(z.unknown())).optional(),
    })
    .passthrough(),
);

/**
 * A single top-level block sent by the editor (§11E.3). `id` is the stable
 * blockId minted by the BlockId Tiptap extension — the server upserts by it
 * rather than regenerating identity on every save.
 */
export const blockPayloadSchema = z.object({
  id: uuid,
  type: z.string().trim().min(1).max(100),
  content: tiptapNodeSchema.optional(),
});

/** Body of PUT /pages/:id/blocks — upserts by id, deletes anything missing from the list (§11E.3). */
export const replaceBlocksSchema = z.object({
  blocks: z.array(blockPayloadSchema).max(100_000),
});

export type BlockPayloadDto = z.infer<typeof blockPayloadSchema>;
export type ReplaceBlocksDto = z.infer<typeof replaceBlocksSchema>;
