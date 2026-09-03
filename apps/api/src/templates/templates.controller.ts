import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateTemplateDto, createTemplateSchema } from './templates.schema';
import { TemplatesService } from './templates.service';

@Controller()
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get('databases/:id/templates')
  listForDatabase(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.listForDatabase(id);
  }

  @Post('databases/:id/templates')
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createTemplateSchema)) body: CreateTemplateDto,
  ) {
    return this.templatesService.create({ ...body, databaseId: id });
  }

  @Delete('templates/:id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.delete(id);
  }
}
