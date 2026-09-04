CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "blocks" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (jsonb_to_tsvector('simple', coalesce(content, '{}'::jsonb), '["string"]')) STORED;--> statement-breakpoint
ALTER TABLE "database_rows" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (jsonb_to_tsvector('simple', coalesce(values, '{}'::jsonb), '["string"]')) STORED;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A')) STORED;--> statement-breakpoint
CREATE INDEX "blocks_fts_idx" ON "blocks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "database_rows_fts_idx" ON "database_rows" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "pages_fts_idx" ON "pages" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "pages_title_trgm" ON "pages" USING gin ("title" gin_trgm_ops);