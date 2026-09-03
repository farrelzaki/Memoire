ALTER TABLE "database_rows" ADD COLUMN "unique_id_seq" integer;--> statement-breakpoint
CREATE INDEX "database_rows_values_gin" ON "database_rows" USING gin ("values" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "database_rows_db_pos" ON "database_rows" USING btree ("database_id","position");