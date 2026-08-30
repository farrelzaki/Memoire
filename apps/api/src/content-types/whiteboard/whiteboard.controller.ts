import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UpdateCanvasDto, updateCanvasSchema } from './whiteboard.schema';
import { WhiteboardService } from './whiteboard.service';

@Controller('pages/:pageId/canvas')
export class WhiteboardController {
  constructor(private readonly whiteboardService: WhiteboardService) {}

  @Get()
  getCanvas(@Param('pageId', ParseUUIDPipe) pageId: string) {
    return this.whiteboardService.getOrCreate(pageId);
  }

  @Patch()
  updateCanvas(
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body(new ZodValidationPipe(updateCanvasSchema)) body: UpdateCanvasDto,
  ) {
    return this.whiteboardService.update(pageId, body);
  }
}
