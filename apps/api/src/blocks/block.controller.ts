import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { BlocksService } from './blocks.service';

/**
 * Standalone block lookup — resolves a block by id whether it's a top-level
 * row or nested inside one via `descendant_ids` (§11E.4). Used by search
 * result anchors and backlinks, both of which only know a blockId.
 */
@Controller('blocks')
export class BlockController {
  constructor(private readonly blocksService: BlocksService) {}

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.blocksService.findById(id);
  }
}
