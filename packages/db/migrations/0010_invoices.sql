CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"enrolment_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"cycle" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"due_date" date NOT NULL,
	"amount_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"plan_late_fee_paise" integer,
	"plan_late_fee_after_days" integer,
	"late_fee_paise" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"waived_at" timestamp with time zone,
	"waived_by" uuid,
	"waive_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_amount_check" CHECK ("invoices"."amount_paise" > 0),
	CONSTRAINT "invoices_money_check" CHECK ("invoices"."discount_paise" >= 0 and "invoices"."late_fee_paise" >= 0),
	CONSTRAINT "invoices_period_check" CHECK ("invoices"."period_end" >= "invoices"."period_start"),
	CONSTRAINT "invoices_status_check" CHECK ("invoices"."status" in ('pending', 'overdue', 'paid', 'waived')),
	CONSTRAINT "invoices_paid_check" CHECK ("invoices"."status" <> 'paid' or "invoices"."paid_at" is not null),
	CONSTRAINT "invoices_waived_check" CHECK ("invoices"."status" <> 'waived' or ("invoices"."waived_at" is not null and "invoices"."waive_reason" is not null and length(trim("invoices"."waive_reason")) > 0))
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_enrolment_id_enrolments_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."enrolments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_waived_by_users_id_fk" FOREIGN KEY ("waived_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_centre_status_due_idx" ON "invoices" USING btree ("centre_id","status","due_date");--> statement-breakpoint
CREATE INDEX "invoices_student_idx" ON "invoices" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_enrolment_period_unique" ON "invoices" USING btree ("enrolment_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_centre_number_unique" ON "invoices" USING btree ("centre_id","number");--> statement-breakpoint
CREATE POLICY "invoices_centre_isolation" ON "invoices" AS PERMISSIVE FOR ALL TO "chukta_app" USING ("invoices"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid) WITH CHECK ("invoices"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid);