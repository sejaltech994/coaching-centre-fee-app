CREATE TABLE "payment_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"gateway" text DEFAULT 'razorpay' NOT NULL,
	"gateway_link_id" text NOT NULL,
	"short_url" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_links_gateway_link_id_unique" UNIQUE("gateway_link_id")
);
--> statement-breakpoint
ALTER TABLE "payment_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"event_id" text NOT NULL,
	"centre_id" uuid,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "razorpay_key_id" text;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "razorpay_key_secret" text;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "razorpay_webhook_secret" text;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_links_invoice_idx" ON "payment_links" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_links_centre_status_idx" ON "payment_links" USING btree ("centre_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_source_event_unique" ON "webhook_events" USING btree ("source","event_id");--> statement-breakpoint
CREATE POLICY "payment_links_centre_isolation" ON "payment_links" AS PERMISSIVE FOR ALL TO "chukta_app" USING ("payment_links"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid) WITH CHECK ("payment_links"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid);