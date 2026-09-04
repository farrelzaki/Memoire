import { BadRequestException, Controller, Get, NotFoundException, Param, Post, Res, StreamableFile } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Response } from 'express';
import { BackupService } from './backup.service';

@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Post('run')
  run() {
    return this.backupService.runBackup();
  }

  @Get()
  list() {
    return this.backupService.listBackups();
  }

  @Get(':filename/download')
  async download(@Param('filename') filename: string, @Res({ passthrough: true }) res: Response) {
    // The filename is a raw URL path segment — reject anything that could
    // escape `BACKUP_DIR` (path traversal) before it ever reaches `join()`.
    if (!/^[\w.-]+\.zip$/.test(filename)) {
      throw new BadRequestException('Invalid backup filename');
    }
    const path = this.backupService.backupFilePath(filename);
    try {
      await stat(path);
    } catch {
      throw new NotFoundException(`Backup ${filename} not found`);
    }
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${filename}"` });
    return new StreamableFile(createReadStream(path));
  }
}
