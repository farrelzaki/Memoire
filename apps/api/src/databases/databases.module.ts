import { Module } from '@nestjs/common';
import { DatabaseQueryService } from './database-query.service';
import { DatabasesController } from './databases.controller';
import { DatabasesService } from './databases.service';

@Module({
  controllers: [DatabasesController],
  providers: [DatabasesService, DatabaseQueryService],
  exports: [DatabasesService, DatabaseQueryService],
})
export class DatabasesModule {}
