import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ImportService, type UploadedFile as ImportUploadedFile } from './import.service';

const MAX_IMPORT_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB — a .zip of many .md files plus this app's own memoire.json restore

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_IMPORT_SIZE_BYTES } }))
  preview(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('kind') kind: 'markdown' | 'memoire-json' | 'csv' | 'notion-zip' | undefined,
  ) {
    if (!file) throw new BadRequestException('file is required');
    if (kind !== 'markdown' && kind !== 'memoire-json' && kind !== 'csv' && kind !== 'notion-zip') {
      throw new BadRequestException('kind must be "markdown", "memoire-json", "csv", or "notion-zip"');
    }
    const uploaded: ImportUploadedFile = {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };
    return this.importService.preview(uploaded, kind);
  }

  @Patch(':stagingId')
  updateColumnTypes(
    @Param('stagingId', ParseUUIDPipe) stagingId: string,
    @Body('columnTypes') columnTypes: Record<number, string> | undefined,
  ) {
    if (!columnTypes) throw new BadRequestException('columnTypes is required');
    return this.importService.updateColumnTypes(stagingId, columnTypes);
  }

  @Post(':stagingId/confirm')
  confirm(@Param('stagingId', ParseUUIDPipe) stagingId: string) {
    return this.importService.confirm(stagingId);
  }

  @Delete(':stagingId')
  async cancel(@Param('stagingId', ParseUUIDPipe) stagingId: string) {
    await this.importService.cancel(stagingId);
    return { success: true };
  }
}
