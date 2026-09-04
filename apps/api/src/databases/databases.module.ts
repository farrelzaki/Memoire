import { Module } from '@nestjs/common';
import { DatabaseQueryService } from './database-query.service';
import { DatabasesController } from './databases.controller';
import { DatabasesService } from './databases.service';
import { FormulaGraphService } from './formula-graph.service';
import { FormulaRecomputeService } from './formula-recompute.service';

@Module({
  controllers: [DatabasesController],
  providers: [DatabasesService, DatabaseQueryService, FormulaGraphService, FormulaRecomputeService],
  exports: [DatabasesService, DatabaseQueryService],
})
export class DatabasesModule {}
