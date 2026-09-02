import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BlocksService } from './blocks.service';
import { ReplaceBlocksDto, replaceBlocksSchema } from './blocks.schema';

@Controller('pages/:pageId/blocks')
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  @Get()
  getBlocks(@Param('pageId', ParseUUIDPipe) pageId: string) {
    return this.blocksService.getByPage(pageId);
  }

  @Put()
  replace(
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body(new ZodValidationPipe(replaceBlocksSchema)) body: ReplaceBlocksDto,
  ) {
    return this.blocksService.replace(pageId, body.blocks);
  }
}
