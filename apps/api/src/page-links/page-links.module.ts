import { Module } from '@nestjs/common';
import { PageLinksController } from './page-links.controller';
import { PageLinksService } from './page-links.service';

@Module({
  controllers: [PageLinksController],
  providers: [PageLinksService],
  exports: [PageLinksService],
})
export class PageLinksModule {}
