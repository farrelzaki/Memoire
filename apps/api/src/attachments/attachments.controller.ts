import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { AttachmentsService } from './attachments.service';

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('pageId') pageId: string | undefined,
  ) {
    if (!pageId) {
      throw new BadRequestException('pageId is required');
    }
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.attachmentsService.upload(file, pageId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.attachmentsService.findOne(id);
  }

  @Get(':id/content')
  async content(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, contentType } = await this.attachmentsService.getContent(id);
    res.set({ 'Content-Type': contentType });
    return new StreamableFile(stream);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.attachmentsService.remove(id);
  }
}
