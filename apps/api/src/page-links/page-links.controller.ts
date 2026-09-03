import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { PageLinksService } from './page-links.service';

@Controller('pages')
export class PageLinksController {
  constructor(private readonly pageLinksService: PageLinksService) {}

  @Get(':id/backlinks')
  findBacklinks(@Param('id', ParseUUIDPipe) id: string) {
    return this.pageLinksService.findBacklinks(id);
  }
}
