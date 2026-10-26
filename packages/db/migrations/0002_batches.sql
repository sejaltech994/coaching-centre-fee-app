CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"days" text[] NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batches_name_check" CHECK (length(trim("batches"."name")) > 0),
	CONSTRAINT "batches_days_check" CHECK (cardinality("batches"."days") > 0 and "batches"."days" <@ array['mon','tue','wed','thu','fri','sat','sun']),
	CONSTRAINT "batches_time_check" CHECK ("batches"."end_time" > "batches"."start_time")
);
--> statement-breakpoint
ALTER TABLE "batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batches_centre_id_idx" ON "batches" USING btree ("centre_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_centre_active_name_unique" ON "batches" USING btree ("centre_id",lower("name")) WHERE "batches"."is_active";--> statement-breakpoint
CREATE POLICY "batches_centre_isolation" ON "batches" AS PERMISSIVE FOR ALL TO "chukta_app" USING ("batches"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid) WITH CHECK ("batches"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid);