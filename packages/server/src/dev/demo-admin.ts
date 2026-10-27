import { eq, or, sql } from "drizzle-orm";
import { developmentDemoAccount, rolesWith } from "@kfit/shared";
import type { db as appDb } from "../db/client.js";
import { users } from "../db/schema/auth.js";
import { AuditService } from "../modules/auth/services/audit.service.js";
import { PasswordService } from "../modules/auth/services/password.service.js";

export class DemoAdminSetupError extends Error {}

/** ROLE-01 R4: the migration may promote the demo account (oldest active user) to superadmin; it stays the demo account. */
const DEMO_ACCOUNT_ROLES: readonly string[] = rolesWith("admin");

export function assertLocalDemoEnvironment(environment: {
  NODE_ENV?: string | undefined;
  DATABASE_URL?: string | undefined;
}): void {
  if (environment.NODE_ENV !== "development")
    throw new DemoAdminSetupError("Demo setup requires NODE_ENV=development.");
  let target: URL;
  try {
    target = new URL(environment.DATABASE_URL ?? "");
  } catch {
    throw new DemoAdminSetupError(
      "Demo setup requires a valid local development database URL.",
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.port !== "5433" ||
    target.pathname !== "/kfit_dev" ||
    target.search !== "" ||
    target.hash !== ""
  ) {
    throw new DemoAdminSetupError(
      "Demo setup only supports the disposable kfit_dev database on localhost:5433, without URL overrides.",
    );
  }
}

export async function provisionDemoAdmin(
  database: typeof appDb,
  options: { auditHashPepper: string },
): Promise<"created" | "existing"> {
  const passwords = new PasswordService();
  return database.transaction(
    async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('dev-demo-admin', 0))`,
      );
      const existing = await tx
        .select()
        .from(users)
        .where(
          or(
            eq(users.id, developmentDemoAccount.id),
            eq(users.email, developmentDemoAccount.email),
          ),
        );
      if (existing.length > 0) {
        const account = existing[0];
        if (
          existing.length !== 1 ||
          !account ||
          account.id !== developmentDemoAccount.id ||
          account.email !== developmentDemoAccount.email ||
          !DEMO_ACCOUNT_ROLES.includes(account.role) ||
          account.status !== "active" ||
          account.archivedAt !== null ||
          !(await passwords.verify(
            developmentDemoAccount.password,
            account.passwordHash,
          ))
        ) {
          throw new DemoAdminSetupError(
            "Demo identity is already occupied or modified. Existing users were preserved.",
          );
        }
        return "existing";
      }
      await tx.insert(users).values({
        id: developmentDemoAccount.id,
        email: developmentDemoAccount.email,
        passwordHash: await passwords.hash(developmentDemoAccount.password),
        role: "admin",
        status: "active",
      });
      await new AuditService(tx, options).record({
        actorType: "system",
        eventType: "auth.dev_demo.created",
        entityType: "user",
        entityId: developmentDemoAccount.id,
        result: "success",
        metadata: { source: "local_development_fixture" },
      });
      return "created";
    },
    { isolationLevel: "read committed" },
  );
}
