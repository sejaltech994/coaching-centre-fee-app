ALTER TABLE "centres" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "centres" ADD COLUMN "deleted_at" timestamp with time zone;