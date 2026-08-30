import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Minimal foundational schema for Sprint 1 (Foundation).
 *
 * The full content schema — pages (with the polymorphic `pages.type` column),
 * blocks, databases, attachments, page_canvases, etc. — is introduced in
 * Sprint 2+, per the technical plan §10 and §65 ("kolom pages.type sejak awal").
 *
 * A single table is enough to prove the PostgreSQL + Drizzle migration/query
 * pipeline end-to-end without committing to the content model yet.
 */
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  icon: text('icon'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
