import { Module } from '@nestjs/common';
import { ExportModule } from '../export/export.module';
import { ImportModule } from '../import/import.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

@Module({
  imports: [ExportModule, ImportModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
