/**
 * Thin re-export — the schema itself lives in @memoire/validation so both
 * apps share one definition (§39A.5 invariant 11).
 */
export {
  createTemplateSchema,
  updateTemplateSchema,
  type CreateTemplateDto,
  type UpdateTemplateDto,
} from '@memoire/validation';
