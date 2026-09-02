ALTER TABLE "blocks" ADD COLUMN "descendant_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
CREATE INDEX "blocks_descendants_idx" ON "blocks" USING gin ("descendant_ids");