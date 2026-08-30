import { Module } from '@nestjs/common';
import { PagesModule } from '../pages/pages.module';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

@Module({
  imports: [PagesModule],
  controllers: [BlocksController],
  providers: [BlocksService],
})
export class BlocksModule {}
