import { forwardRef, Module } from '@nestjs/common';
import { PageLinksModule } from '../page-links/page-links.module';
import { PagesModule } from '../pages/pages.module';
import { VersionsModule } from '../versions/versions.module';
import { BlockController } from './block.controller';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

@Module({
  imports: [forwardRef(() => PagesModule), PageLinksModule, forwardRef(() => VersionsModule)],
  controllers: [BlocksController, BlockController],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class BlocksModule {}
