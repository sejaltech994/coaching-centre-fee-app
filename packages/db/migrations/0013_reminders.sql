CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"template" text NOT NULL,
	"template_version" integer NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_provider_message_id_unique" UNIQUE("provider_message_id"),
	CONSTRAINT "reminders_kind_check" CHECK (kind in ('pre_due', 'due', 'overdue_3', 'overdue_7', 'manual', 'payment_received')),
	CONSTRAINT "reminders_status_check" CHECK (status in ('sent', 'delivered', 'read', 'failed', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "centres" ADD COLUMN "reminder_tone" text DEFAULT 'gentle' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_centre_created_idx" ON "reminders" USING btree ("centre_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_invoice_kind_unique" ON "reminders" USING btree ("invoice_id","kind") WHERE "reminders"."kind" <> 'manual';--> statement-breakpoint
ALTER TABLE "centres" ADD CONSTRAINT "centres_reminder_tone_check" CHECK ("centres"."reminder_tone" in ('gentle', 'firm'));--> statement-breakpoint
CREATE POLICY "reminders_centre_isolation" ON "reminders" AS PERMISSIVE FOR ALL TO "chukta_app" USING ("reminders"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid) WITH CHECK ("reminders"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid);