import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { manualSnapshotSchema } from '@memoire/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { VersionsService } from './versions.service';

@Controller()
export class VersionsController {
  constructor(private readonly versionsService: VersionsService) {}

  @Post('pages/:id/versions')
  saveManual(
    @Param('id', ParseUUIDPipe) pageId: string,
    @Body(new ZodValidationPipe(manualSnapshotSchema)) body: { label?: string },
  ) {
    return this.versionsService.saveManual(pageId, body.label ?? null);
  }

  @Get('pages/:id/versions')
  listForPage(@Param('id', ParseUUIDPipe) pageId: string) {
    return this.versionsService.listForPage(pageId);
  }

  @Get('versions/diff')
  diff(@Query('from', ParseUUIDPipe) from: string, @Query('to', ParseUUIDPipe) to: string) {
    return this.versionsService.diff(from, to);
  }

  @Get('versions/:id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.versionsService.getFullContent(id);
  }

  @Post('versions/:id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.versionsService.restore(id);
  }
}
