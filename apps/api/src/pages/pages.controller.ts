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
  CreatePageDto,
  createPageSchema,
  MovePageDto,
  movePageSchema,
  UpdatePageDto,
  updatePageSchema,
} from './pages.schema';
import { PagesService } from './pages.service';

@Controller('pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  findAll() {
    return this.pagesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pagesService.findOne(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createPageSchema)) body: CreatePageDto) {
    return this.pagesService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePageSchema)) body: UpdatePageDto,
  ) {
    return this.pagesService.update(id, body);
  }

  @Post(':id/archive')
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.pagesService.archive(id);
  }

  @Post(':id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.pagesService.restore(id);
  }

  @Post(':id/move')
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(movePageSchema)) body: MovePageDto,
  ) {
    return this.pagesService.move(id, body.parentPageId, body.position);
  }

  /** Soft delete (§32) — same effect as `archive`, kept for REST completeness. */
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.pagesService.archive(id);
  }
}
