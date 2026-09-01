import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE_DB = 'DRIZZLE_DB';
export type DrizzleDB = NodePgDatabase<typeof schema>;

/**
 * The handle drizzle hands to a `db.transaction(...)` callback. Services that
 * take one of these can be composed into a caller's transaction, which is how
 * multi-table structural operations (duplicate/delete a page) stay atomic (§7).
 */
export type DrizzleTx = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];

export const drizzleProvider = {
  provide: DRIZZLE_DB,
  inject: [ConfigService],
  useFactory: (config: ConfigService): DrizzleDB => {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    const pool = new Pool({ connectionString });
    return drizzle(pool, { schema });
  },
};
