CREATE TABLE "database_relation_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"from_row_id" uuid NOT NULL,
	"to_row_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "database_rows" ADD COLUMN "computed" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "database_rows" ADD COLUMN "computed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "database_relation_links" ADD CONSTRAINT "database_relation_links_property_id_database_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."database_properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_relation_links" ADD CONSTRAINT "database_relation_links_from_row_id_database_rows_id_fk" FOREIGN KEY ("from_row_id") REFERENCES "public"."database_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_relation_links" ADD CONSTRAINT "database_relation_links_to_row_id_database_rows_id_fk" FOREIGN KEY ("to_row_id") REFERENCES "public"."database_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "database_relation_links_uniq" ON "database_relation_links" USING btree ("property_id","from_row_id","to_row_id");--> statement-breakpoint
CREATE INDEX "database_relation_links_to_row_idx" ON "database_relation_links" USING btree ("to_row_id","property_id");--> statement-breakpoint
CREATE INDEX "database_relation_links_from_row_idx" ON "database_relation_links" USING btree ("from_row_id","property_id");