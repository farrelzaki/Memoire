import { Module } from '@nestjs/common';
import { PageLinksModule } from '../page-links/page-links.module';
import { PagesModule } from '../pages/pages.module';
import { BlockController } from './block.controller';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

@Module({
  imports: [PagesModule, PageLinksModule],
  controllers: [BlocksController, BlockController],
  providers: [BlocksService],
})
export class BlocksModule {}
