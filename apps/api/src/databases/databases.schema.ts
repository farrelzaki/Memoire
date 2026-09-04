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
  reorderSchema,
  reorderIntoGroupSchema,
  type CreatePropertyDto,
  type UpdatePropertyDto,
  type CreateRowDto,
  type UpdateRowDto,
  type CreateViewDto,
  type UpdateViewDto,
  type MoveViewDto,
  type CreateDatabaseDto,
  type ReorderDto,
  type ReorderIntoGroupDto,
} from '@memoire/validation';
