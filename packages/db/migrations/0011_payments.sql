CREATE TABLE "payment_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"upi_id" text,
	"payee_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_settings_centre_id_unique" UNIQUE("centre_id")
);
--> statement-breakpoint
ALTER TABLE "payment_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"gateway_payment_id" text,
	"received_at" timestamp with time zone NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_invoice_id_unique" UNIQUE("invoice_id"),
	CONSTRAINT "payments_gateway_payment_id_unique" UNIQUE("gateway_payment_id"),
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount_paise" > 0),
	CONSTRAINT "payments_method_check" CHECK (method in ('upi', 'cash', 'bank_transfer', 'card', 'netbanking', 'wallet'))
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
ALTER TABLE "receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "public_token" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_centre_id_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_centre_received_idx" ON "payments" USING btree ("centre_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_centre_number_unique" ON "receipts" USING btree ("centre_id","number");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_public_token_unique" UNIQUE("public_token");--> statement-breakpoint
CREATE POLICY "payment_settings_centre_isolation" ON "payment_settings" AS PERMISSIVE FOR ALL TO "chukta_app" USING ("payment_settings"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid) WITH CHECK ("payment_settings"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "payments_centre_isolation" ON "payments" AS PERMISSIVE FOR ALL TO "chukta_app" USING ("payments"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid) WITH CHECK ("payments"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "receipts_centre_isolation" ON "receipts" AS PERMISSIVE FOR ALL TO "chukta_app" USING ("receipts"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid) WITH CHECK ("receipts"."centre_id" = nullif(current_setting('app.centre_id', true), '')::uuid);