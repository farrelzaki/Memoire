import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { strToU8, zipSync } from 'fflate';
import { ExportService } from '../export/export.service';
import { StorageService } from '../storage/storage.service';
import { ImportService } from '../import/import.service';

const RETENTION_COUNT = 7;

export interface BackupFileInfo {
  filename: string;
  createdAt: string;
  size: number;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Manual + scheduled workspace backup (§31, Sprint 24) — a genuinely
 * different artifact from the export ZIP (§30B.4, client-side, ADR-25):
 * just `memoire.json` (the existing `ExportService.exportWorkspace()`
 * output) plus attachment binaries, no rendered Markdown/CSV. That means no
 * registry dependency at all, so — unlike export — this can run entirely
 * server-side, including from a cron tick with no browser open. Zipped with
 * `fflate` (not `archiver`, despite §31/§30B.4 naming Node-stream libraries
 * — the installed `archiver` v8 turned out to be an incompatible ESM
 * rewrite of the classic API those docs assumed; `fflate` already proven
 * elsewhere this sprint, zero-dependency, works identically here).
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir = process.env.BACKUP_DIR ?? './backups';

  constructor(
    private readonly exportService: ExportService,
    private readonly storage: StorageService,
    private readonly importService: ImportService,
  ) {}

  async createBackupArchive(): Promise<Buffer> {
    const workspaceJson = await this.exportService.exportWorkspace();
    const files: Record<string, Uint8Array> = {
      'memoire.json': strToU8(JSON.stringify(workspaceJson, null, 2)),
    };

    for (const attachment of workspaceJson.attachments) {
      try {
        const { stream } = await this.storage.get(attachment.storageKey);
        files[`attachments/${attachment.id}-${attachment.filename}`] = new Uint8Array(
          await streamToBuffer(stream),
        );
      } catch (error) {
        this.logger.warn(`Skipping attachment ${attachment.id} in backup: ${(error as Error).message}`);
      }
    }

    return Buffer.from(zipSync(files, { level: 6 }));
  }

  async runBackup(): Promise<BackupFileInfo> {
    await mkdir(this.backupDir, { recursive: true });
    const archive = await this.createBackupArchive();
    const filename = `memoire-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    await writeFile(join(this.backupDir, filename), archive);
    await this.pruneOldBackups();
    return { filename, createdAt: new Date().toISOString(), size: archive.length };
  }

  async listBackups(): Promise<BackupFileInfo[]> {
    await mkdir(this.backupDir, { recursive: true });
    const entries = await readdir(this.backupDir);
    const infos = await Promise.all(
      entries
        .filter((name) => name.endsWith('.zip'))
        .map(async (filename) => {
          const s = await stat(join(this.backupDir, filename));
          return { filename, createdAt: s.mtime.toISOString(), size: s.size };
        }),
    );
    return infos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  backupFilePath(filename: string): string {
    return join(this.backupDir, filename);
  }

  private async pruneOldBackups(): Promise<void> {
    const backups = await this.listBackups();
    for (const old of backups.slice(RETENTION_COUNT)) {
      await rm(this.backupFilePath(old.filename), { force: true });
    }
  }

  /**
   * §31's own text defers *scheduled* backup ("once the app is stable") —
   * built here anyway per explicit instruction. Piggybacks the same daily
   * tick to clean up stale `import_stagings` rows (§30A) rather than
   * running a second scheduled job just for that.
   */
  @Cron('0 3 * * *')
  async scheduledBackup(): Promise<void> {
    try {
      await this.runBackup();
    } catch (error) {
      this.logger.error(`Scheduled backup failed: ${(error as Error).message}`);
    }
    await this.importService.cleanupStale();
  }
}
