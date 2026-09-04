import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';
import { Workspace, workspaces } from '../db/schema';

@Injectable()
export class WorkspacesService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

  /**
   * Single-user app (§1): there is exactly one workspace. Create it lazily on
   * first access so the app self-seeds with no extra setup step.
   */
  async getOrCreateDefault(): Promise<Workspace> {
    const [existing] = await this.db.select().from(workspaces).limit(1);
    if (existing) return existing;

    const [created] = await this.db
      .insert(workspaces)
      .values({ name: 'Memoire' })
      .returning();
    return created;
  }

  /** Merges into the one workspace's `settings` JSONB (§57 Decision 3, mirrors `pages.settings`). */
  async updateSettings(patch: Record<string, unknown>): Promise<Workspace> {
    const workspace = await this.getOrCreateDefault();
    const [updated] = await this.db
      .update(workspaces)
      .set({ settings: { ...workspace.settings, ...patch }, updatedAt: sql`now()` })
      .where(eq(workspaces.id, workspace.id))
      .returning();
    return updated;
  }
}
