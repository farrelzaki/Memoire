import { Body, Controller, Post } from '@nestjs/common';
import { linkPreviewRequestSchema, type LinkPreviewRequestDto } from '@memoire/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { LinkPreviewService } from './link-preview.service';

@Controller('link-preview')
export class LinkPreviewController {
  constructor(private readonly linkPreviewService: LinkPreviewService) {}

  @Post()
  getPreview(@Body(new ZodValidationPipe(linkPreviewRequestSchema)) body: LinkPreviewRequestDto) {
    return this.linkPreviewService.getPreview(body.url);
  }
}
