CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"date" date NOT NULL,
	"present" boolean NOT NULL,
	"alerted_at" timestamp with time zone,
	"alert_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "centres" ADD COLUMN "absence_alerts" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_batch_student_date_unique" ON "attendance" USING btree ("batch_id","student_id","date");--> statement-breakpoint
CREATE INDEX "attendance_centre_batch_date_idx" ON "attendance" USING btree ("centre_id","batch_id","date");--> statement-breakpoint
CREATE POLICY "attendance_centre_isolation" ON "attendance" AS PERMISSIVE FOR ALL TO "chukta_app" USING ("attendance"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid) WITH CHECK ("attendance"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid);