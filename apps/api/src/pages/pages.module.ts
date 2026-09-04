import { forwardRef, Module } from '@nestjs/common';
import { DatabasesModule } from '../databases/databases.module';
import { VersionsModule } from '../versions/versions.module';
import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';

@Module({
  imports: [DatabasesModule, forwardRef(() => VersionsModule)],
  controllers: [PagesController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}
