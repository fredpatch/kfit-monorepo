ALTER TABLE "users" ADD CONSTRAINT "users_role_known" CHECK (role in ('superadmin', 'admin', 'coach'));--> statement-breakpoint
-- ROLE-01 R4 (data only, appended to the generated CHECK): promote the oldest active user (min created_at, the bootstrap
-- account) to superadmin when no superadmin exists yet. Idempotent: a rerun finds a superadmin and changes nothing.
UPDATE "users" SET "role" = 'superadmin', "updated_at" = now()
WHERE "id" = (SELECT "id" FROM "users" WHERE "status" = 'active' AND "archived_at" IS NULL ORDER BY "created_at", "id" LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "users" WHERE "role" = 'superadmin');
