import { forwardRef, Module } from '@nestjs/common';
import { BlocksModule } from '../blocks/blocks.module';
import { VersionsController } from './versions.controller';
import { VersionsService } from './versions.service';

@Module({
  imports: [forwardRef(() => BlocksModule)],
  controllers: [VersionsController],
  providers: [VersionsService],
  exports: [VersionsService],
})
export class VersionsModule {}
