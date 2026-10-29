CREATE TABLE "enrolments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"fee_plan_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrolments_dates_check" CHECK ("enrolments"."end_date" is null or "enrolments"."end_date" >= "enrolments"."start_date"),
	CONSTRAINT "enrolments_discount_check" CHECK ("enrolments"."discount_paise" >= 0)
);
--> statement-breakpoint
ALTER TABLE "enrolments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"name" text NOT NULL,
	"parent_name" text NOT NULL,
	"parent_phone" text NOT NULL,
	"whatsapp_opt_in" boolean DEFAULT false NOT NULL,
	"whatsapp_opt_in_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_name_check" CHECK (length(trim("students"."name")) > 0),
	CONSTRAINT "students_parent_name_check" CHECK (length(trim("students"."parent_name")) > 0),
	CONSTRAINT "students_status_check" CHECK ("students"."status" in ('active', 'left'))
);
--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrolments_centre_batch_idx" ON "enrolments" USING btree ("centre_id","batch_id");--> statement-breakpoint
CREATE INDEX "enrolments_student_idx" ON "enrolments" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrolments_current_unique" ON "enrolments" USING btree ("student_id","batch_id") WHERE "enrolments"."end_date" is null;--> statement-breakpoint
CREATE INDEX "students_centre_status_name_idx" ON "students" USING btree ("centre_id","status",lower("name"));--> statement-breakpoint
CREATE INDEX "students_centre_parent_phone_idx" ON "students" USING btree ("centre_id","parent_phone");--> statement-breakpoint
CREATE POLICY "enrolments_centre_isolation" ON "enrolments" AS PERMISSIVE FOR ALL TO "chukta_app" USING ("enrolments"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid) WITH CHECK ("enrolments"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "students_centre_isolation" ON "students" AS PERMISSIVE FOR ALL TO "chukta_app" USING ("students"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid) WITH CHECK ("students"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid);