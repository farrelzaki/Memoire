ALTER TABLE "databases" DROP CONSTRAINT "databases_page_id_unique";--> statement-breakpoint
ALTER TABLE "databases" DROP CONSTRAINT "databases_page_id_pages_id_fk";
--> statement-breakpoint
DROP INDEX "databases_page_idx";--> statement-breakpoint
ALTER TABLE "databases" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "databases" ALTER COLUMN "owner_page_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "databases_full_page_uniq" ON "databases" USING btree ("owner_page_id") WHERE "databases"."is_inline" = false;--> statement-breakpoint
ALTER TABLE "databases" DROP COLUMN "page_id";