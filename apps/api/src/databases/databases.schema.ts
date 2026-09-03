/**
 * Thin re-export — the schema itself lives in @memoire/validation so both
 * apps share one definition (§39A.5 invariant 11).
 */
export {
  propertyTypes,
  createPropertySchema,
  updatePropertySchema,
  createRowSchema,
  updateRowSchema,
  viewTypes,
  createViewSchema,
  updateViewSchema,
  moveViewSchema,
  createDatabaseSchema,
  type CreatePropertyDto,
  type UpdatePropertyDto,
  type CreateRowDto,
  type UpdateRowDto,
  type CreateViewDto,
  type UpdateViewDto,
  type MoveViewDto,
  type CreateDatabaseDto,
} from '@memoire/validation';
