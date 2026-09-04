ALTER TABLE "blocks" drop column "search_vector";--> statement-breakpoint
ALTER TABLE "blocks" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', jsonb_path_query_array(content, '$.**.text')::text)) STORED;--> statement-breakpoint
CREATE INDEX "blocks_fts_idx" ON "blocks" USING gin ("search_vector");