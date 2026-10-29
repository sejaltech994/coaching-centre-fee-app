ALTER TABLE "otp_challenges" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "signup_tickets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "otp_challenges" CASCADE;--> statement-breakpoint
DROP TABLE "signup_tickets" CASCADE;--> statement-breakpoint
DROP INDEX "users_verified_phone_unique";--> statement-breakpoint
ALTER TABLE "centres" ALTER COLUMN "owner_phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "phone_verified_at";