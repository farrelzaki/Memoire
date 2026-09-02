import { Module } from '@nestjs/common';
import { PagesModule } from '../pages/pages.module';
import { BlockController } from './block.controller';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

@Module({
  imports: [PagesModule],
  controllers: [BlocksController, BlockController],
  providers: [BlocksService],
})
export class BlocksModule {}
