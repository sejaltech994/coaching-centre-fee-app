CREATE TABLE "fee_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"cycle" text NOT NULL,
	"due_day" integer,
	"late_fee_paise" integer,
	"late_fee_after_days" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_plans_name_check" CHECK (length(trim("fee_plans"."name")) > 0),
	CONSTRAINT "fee_plans_amount_check" CHECK ("fee_plans"."amount_paise" > 0),
	CONSTRAINT "fee_plans_cycle_check" CHECK ("fee_plans"."cycle" in ('monthly', 'quarterly', 'one_time')),
	CONSTRAINT "fee_plans_due_day_check" CHECK (("fee_plans"."cycle" = 'one_time' and "fee_plans"."due_day" is null) or ("fee_plans"."cycle" <> 'one_time' and "fee_plans"."due_day" is not null and "fee_plans"."due_day" between 1 and 28)),
	CONSTRAINT "fee_plans_late_fee_check" CHECK (("fee_plans"."late_fee_paise" is null and "fee_plans"."late_fee_after_days" is null) or ("fee_plans"."late_fee_paise" is not null and "fee_plans"."late_fee_after_days" is not null and "fee_plans"."late_fee_paise" between 1 and "fee_plans"."amount_paise" and "fee_plans"."late_fee_after_days" between 1 and 60))
);
--> statement-breakpoint
ALTER TABLE "fee_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "fee_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fee_plans_centre_id_idx" ON "fee_plans" USING btree ("centre_id");--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_fee_plan_id_fee_plans_id_fk" FOREIGN KEY ("fee_plan_id") REFERENCES "public"."fee_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_fee_plan_id_fee_plans_id_fk" FOREIGN KEY ("fee_plan_id") REFERENCES "public"."fee_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "fee_plans_centre_isolation" ON "fee_plans" AS PERMISSIVE FOR ALL TO "chukta_app" USING ("fee_plans"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid) WITH CHECK ("fee_plans"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid);