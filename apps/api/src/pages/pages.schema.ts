/**
 * Thin re-export — the schema itself lives in @memoire/validation so both
 * apps share one definition (§39A.5 invariant 11).
 */
export {
  createPageSchema,
  updatePageSchema,
  movePageSchema,
  pageTypes,
  type CreatePageDto,
  type UpdatePageDto,
  type MovePageDto,
} from '@memoire/validation';
