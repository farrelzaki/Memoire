import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';
import {
  attachments,
  blocks,
  databaseProperties,
  databaseRows,
  databases,
  pages,
  workspaces,
} from '../db/schema';

/**
 * Full-workspace JSON export (§30, §51 "Export JSON"). A single self-contained
 * document is the backup unit at MVP scale; ZIP packaging is a later upgrade.
 */
@Injectable()
export class ExportService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

  async exportWorkspace() {
    const [
      workspaceRows,
      pageRows,
      blockRows,
      databaseRowsList,
      propertyRows,
      rowRows,
      attachmentRows,
    ] = await Promise.all([
      this.db.select().from(workspaces),
      this.db.select().from(pages),
      this.db.select().from(blocks),
      this.db.select().from(databases),
      this.db.select().from(databaseProperties),
      this.db.select().from(databaseRows),
      this.db.select().from(attachments),
    ]);

    return {
      app: 'memoire',
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces: workspaceRows,
      pages: pageRows,
      blocks: blockRows,
      databases: databaseRowsList,
      properties: propertyRows,
      rows: rowRows,
      attachments: attachmentRows,
    };
  }
}
