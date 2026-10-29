ALTER TABLE "centres" ADD COLUMN "subscription_id" text;--> statement-breakpoint
ALTER TABLE "centres" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "centres" ADD CONSTRAINT "centres_subscription_id_unique" UNIQUE("subscription_id");--> statement-breakpoint
ALTER TABLE "centres" ADD CONSTRAINT "centres_subscription_status_check" CHECK ("centres"."subscription_status" in ('created', 'active', 'cancelled', 'halted'));