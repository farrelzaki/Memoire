import { Module } from '@nestjs/common';
import { PagesModule } from '../../pages/pages.module';
import { WhiteboardController } from './whiteboard.controller';
import { WhiteboardService } from './whiteboard.service';

@Module({
  imports: [PagesModule],
  controllers: [WhiteboardController],
  providers: [WhiteboardService],
})
export class WhiteboardModule {}
