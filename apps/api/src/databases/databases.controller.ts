import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AddRelationDto, addRelationSchema, DatabaseQueryRequestDto, databaseQueryRequestSchema } from '@memoire/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DatabaseQueryService } from './database-query.service';
import {
  CreateDatabaseDto,
  createDatabaseSchema,
  CreatePropertyDto,
  createPropertySchema,
  CreateRowDto,
  createRowSchema,
  CreateViewDto,
  createViewSchema,
  MoveViewDto,
  moveViewSchema,
  UpdatePropertyDto,
  updatePropertySchema,
  UpdateRowDto,
  updateRowSchema,
  updateViewSchema,
} from './databases.schema';
import { DatabasesService } from './databases.service';

@Controller()
export class DatabasesController {
  constructor(
    private readonly databasesService: DatabasesService,
    private readonly databaseQueryService: DatabaseQueryService,
  ) {}

  /** Id/name listing for the linked-view picker (§20C.3). */
  @Get('databases')
  listAll() {
    return this.databasesService.listAll();
  }

  @Post('databases')
  create(@Body(new ZodValidationPipe(createDatabaseSchema)) body: CreateDatabaseDto) {
    return this.databasesService.create(body);
  }

  @Get('databases/by-page/:pageId')
  getByPage(@Param('pageId', ParseUUIDPipe) pageId: string) {
    return this.databasesService.getByPage(pageId);
  }

  /** Addresses a database directly, not via its owner page — inline/linked blocks reference a database by id (§20C.3). */
  @Get('databases/:id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.databasesService.getById(id);
  }

  @Get('database-rows/by-page/:pageId')
  findRowByPageId(@Param('pageId', ParseUUIDPipe) pageId: string) {
    return this.databasesService.findRowByPageId(pageId);
  }

  @Post('databases/:id/query')
  query(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(databaseQueryRequestSchema)) body: DatabaseQueryRequestDto,
  ) {
    return this.databaseQueryService.query(id, body);
  }

  @Post('databases/:id/properties')
  createProperty(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createPropertySchema)) body: CreatePropertyDto,
  ) {
    return this.databasesService.createProperty(id, body);
  }

  @Patch('database-properties/:id')
  updateProperty(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePropertySchema)) body: UpdatePropertyDto,
  ) {
    return this.databasesService.updateProperty(id, body);
  }

  @Delete('database-properties/:id')
  deleteProperty(@Param('id', ParseUUIDPipe) id: string) {
    return this.databasesService.deleteProperty(id);
  }

  @Post('databases/:id/rows')
  createRow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createRowSchema)) body: CreateRowDto,
  ) {
    return this.databasesService.createRow(id, body.values, body.id, body.templateId);
  }

  @Patch('database-rows/:id')
  updateRow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRowSchema)) body: UpdateRowDto,
  ) {
    return this.databasesService.updateRow(id, body.values);
  }

  @Delete('database-rows/:id')
  deleteRow(@Param('id', ParseUUIDPipe) id: string) {
    return this.databasesService.deleteRow(id);
  }

  /** Soft delete (§20D.5) — mirrors onto the row's page, if it has one. */
  @Post('database-rows/:id/archive')
  archiveRow(@Param('id', ParseUUIDPipe) id: string) {
    return this.databasesService.archiveRow(id);
  }

  @Post('database-rows/:id/restore')
  restoreRow(@Param('id', ParseUUIDPipe) id: string) {
    return this.databasesService.restoreRow(id);
  }

  @Post('database-rows/:id/relations/:propertyId')
  addRelation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body(new ZodValidationPipe(addRelationSchema)) body: AddRelationDto,
  ) {
    return this.databasesService.addRelation(id, propertyId, body.toRowId);
  }

  @Delete('database-rows/:id/relations/:propertyId/:toRowId')
  removeRelation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('toRowId', ParseUUIDPipe) toRowId: string,
  ) {
    return this.databasesService.removeRelation(id, propertyId, toRowId);
  }

  @Post('databases/:id/views')
  createView(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createViewSchema)) body: CreateViewDto,
  ) {
    return this.databasesService.createView(id, body);
  }

  @Patch('database-views/:id')
  updateView(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateViewSchema)) body: {
      name?: string;
      config?: Record<string, unknown>;
    },
  ) {
    return this.databasesService.updateView(id, body);
  }

  @Delete('database-views/:id')
  deleteView(@Param('id', ParseUUIDPipe) id: string) {
    return this.databasesService.deleteView(id);
  }

  @Post('database-views/:id/duplicate')
  duplicateView(@Param('id', ParseUUIDPipe) id: string) {
    return this.databasesService.duplicateView(id);
  }

  /** Swaps position with the adjacent tab — pointer-drag reordering is Sprint 21. */
  @Post('database-views/:id/move')
  moveView(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moveViewSchema)) body: MoveViewDto,
  ) {
    return this.databasesService.moveView(id, body.direction);
  }
}
