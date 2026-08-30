import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';

@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

  @Get()
  async check(): Promise<{ status: string; database: string }> {
    let database = 'up';
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      database = 'down';
    }
    return { status: database === 'up' ? 'ok' : 'degraded', database };
  }
}
