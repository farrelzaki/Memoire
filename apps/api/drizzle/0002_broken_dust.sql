CREATE INDEX "attachments_page_idx" ON "attachments" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "blocks_page_idx" ON "blocks" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "blocks_parent_idx" ON "blocks" USING btree ("parent_block_id");--> statement-breakpoint
CREATE INDEX "blocks_position_idx" ON "blocks" USING btree ("position");--> statement-breakpoint
CREATE INDEX "database_properties_database_idx" ON "database_properties" USING btree ("database_id");--> statement-breakpoint
CREATE INDEX "database_rows_database_idx" ON "database_rows" USING btree ("database_id");--> statement-breakpoint
CREATE INDEX "database_views_database_idx" ON "database_views" USING btree ("database_id");--> statement-breakpoint
CREATE INDEX "databases_page_idx" ON "databases" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "pages_workspace_idx" ON "pages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "pages_parent_idx" ON "pages" USING btree ("parent_page_id");--> statement-breakpoint
CREATE INDEX "pages_updated_idx" ON "pages" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "pages_favorite_idx" ON "pages" USING btree ("is_favorite");