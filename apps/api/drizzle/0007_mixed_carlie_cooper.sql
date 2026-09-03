ALTER TABLE "database_rows" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "databases" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "databases" ADD COLUMN "owner_page_id" uuid;--> statement-breakpoint
ALTER TABLE "databases" ADD COLUMN "is_inline" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "database_id" uuid;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "database_id" uuid;--> statement-breakpoint
ALTER TABLE "databases" ADD CONSTRAINT "databases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "databases" ADD CONSTRAINT "databases_owner_page_id_pages_id_fk" FOREIGN KEY ("owner_page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_database_id_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."databases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_database_id_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "databases_owner_page_idx" ON "databases" USING btree ("owner_page_id");--> statement-breakpoint
CREATE INDEX "pages_database_idx" ON "pages" USING btree ("database_id");--> statement-breakpoint
CREATE INDEX "templates_database_idx" ON "templates" USING btree ("database_id");--> statement-breakpoint
-- Backfill §20C.2: every existing database was page-backed (isInline=false),
-- so owner_page_id is simply the old page_id, and workspace_id is the single
-- default workspace (§10.2, single-user app has exactly one).
UPDATE "databases" SET "owner_page_id" = "page_id" WHERE "owner_page_id" IS NULL;--> statement-breakpoint
UPDATE "databases" SET "workspace_id" = (SELECT "id" FROM "workspaces" LIMIT 1) WHERE "workspace_id" IS NULL;