ALTER TABLE "users" DROP CONSTRAINT "users_phone_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
-- Owners so far signed up with a one-time code to their number, so it is confirmed.
UPDATE "users" SET "phone_verified_at" = "created_at";--> statement-breakpoint
CREATE UNIQUE INDEX "users_verified_phone_unique" ON "users" USING btree ("phone") WHERE "users"."phone_verified_at" is not null;