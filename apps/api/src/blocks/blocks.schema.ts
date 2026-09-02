/**
 * Thin re-export — the schema itself lives in @memoire/validation so both
 * apps share one definition (§39A.5 invariant 11).
 */
export {
  blockPayloadSchema,
  replaceBlocksSchema,
  type BlockPayloadDto,
  type ReplaceBlocksDto,
} from '@memoire/validation';
