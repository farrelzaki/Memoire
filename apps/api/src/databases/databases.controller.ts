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
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CreatePropertyDto,
  createPropertySchema,
  createRowSchema,
  UpdatePropertyDto,
  updatePropertySchema,
  UpdateRowDto,
  updateRowSchema,
} from './databases.schema';
import { DatabasesService } from './databases.service';

@Controller()
export class DatabasesController {
  constructor(private readonly databasesService: DatabasesService) {}

  @Get('databases/by-page/:pageId')
  getByPage(@Param('pageId', ParseUUIDPipe) pageId: string) {
    return this.databasesService.getByPage(pageId);
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
    @Body(new ZodValidationPipe(createRowSchema)) body: { values?: Record<string, unknown> },
  ) {
    return this.databasesService.createRow(id, body.values);
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
}
