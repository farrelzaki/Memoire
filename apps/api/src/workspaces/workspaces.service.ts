import { Inject, Injectable } from '@nestjs/common';
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
}
