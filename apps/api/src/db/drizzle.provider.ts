import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE_DB = 'DRIZZLE_DB';
export type DrizzleDB = NodePgDatabase<typeof schema>;

export const drizzleProvider = {
  provide: DRIZZLE_DB,
  inject: [ConfigService],
  useFactory: (config: ConfigService): DrizzleDB => {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    const pool = new Pool({ connectionString });
    return drizzle(pool, { schema });
  },
};
