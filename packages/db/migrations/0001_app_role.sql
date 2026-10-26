-- Restricted role for centre-scoped queries (TSD: Postgres row-level security as
-- a second tenant guard). The app keeps connecting as its normal user, and
-- withCentre() runs each centre-scoped transaction as chukta_app with
-- app.centre_id set, so RLS policies apply even to the table owner's connection.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chukta_app') THEN
    CREATE ROLE chukta_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
-- The connecting user must be a member to SET ROLE.
GRANT chukta_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO chukta_app;
--> statement-breakpoint
-- Every table created from now on is readable and writable by chukta_app;
-- each centre-owned table restricts rows with its own RLS policy.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chukta_app;
