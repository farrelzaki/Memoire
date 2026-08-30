import { describe, expect, it } from 'vitest';
import { DrizzleDB } from '../db/drizzle.provider';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const healthyDb = { execute: async () => ({}) } as unknown as DrizzleDB;

  it('reports ok when the database responds', async () => {
    const controller = new HealthController(healthyDb);
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('reports degraded when the database is unreachable', async () => {
    const downDb = {
      execute: async () => {
        throw new Error('connection refused');
      },
    } as unknown as DrizzleDB;
    const controller = new HealthController(downDb);
    await expect(controller.check()).resolves.toEqual({
      status: 'degraded',
      database: 'down',
    });
  });
});
