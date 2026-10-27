import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { and, eq, gte, inArray, like, sql, TransactionRollbackError } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { auditEvents, users } from "../db/schema/auth.js";
import { scheduledJobRuns } from "../db/schema/operations.js";
import { PasswordService } from "../modules/auth/services/password.service.js";
import { assertLocalTestDatabase, cleanupInOrder } from "../testing/integration-fixtures.js";
import { OPS_ACTOR, userOpsMain } from "./user-accounts.js";

/* ROLE-01 R4/R5 on kfit_test: the user scripts' entry point (argv → row, audit, run row) and migration 0019's data step. */

const tag = randomUUID().slice(0, 8);
const emailOf = (name: string) => `role01-${name}-${tag}@example.invalid`;
const testStart = new Date();
const extraUserIds: string[] = [];
let safe = false;

before(() => { assertLocalTestDatabase(); safe = true; });

after(async () => {
  try {
    if (safe) {
      const created = await db.select({ id: users.id }).from(users).where(like(users.email, `role01-%-${tag}@example.invalid`));
      const ids = [...created.map((row) => row.id), ...extraUserIds];
      await cleanupInOrder([
        ["audit", () => ids.length ? db.delete(auditEvents).where(and(inArray(auditEvents.entityId, ids), like(auditEvents.eventType, "auth.user.%"))) : Promise.resolve()],
        ["runs", () => db.delete(scheduledJobRuns).where(and(inArray(scheduledJobRuns.jobKey, ["ops.create_user", "ops.set_role"]), gte(scheduledJobRuns.startedAt, testStart)))],
        ["users", () => ids.length ? db.delete(users).where(inArray(users.id, ids)) : Promise.resolve()],
      ]);
    }
  } finally {
    await pool.end();
  }
});

const run = (job: "createUser" | "setRole", ...argv: string[]) => userOpsMain(job, argv, process.env);
const userByEmail = async (email: string) => (await db.select().from(users).where(eq(users.email, email)))[0];
const runsOf = (jobKey: string) => db.select().from(scheduledJobRuns).where(and(eq(scheduledJobRuns.jobKey, jobKey), gte(scheduledJobRuns.startedAt, testStart))).orderBy(scheduledJobRuns.startedAt);
const auditsOf = (userId: string, eventType: string) => db.select().from(auditEvents).where(and(eq(auditEvents.entityId, userId), eq(auditEvents.eventType, eventType)));

test("ROLE-01 R5: ops:create-user creates an active admin with an unusable password, audited (system:ops) and recorded with counts only", async () => {
  const email = emailOf("coach");
  assert.equal(await run("createUser", "--email", `  ${email.toUpperCase()} `, "--role", "admin", "--label", "Synthétique"), 0);
  const user = await userByEmail(email);
  assert.ok(user, "stored with the canonical e-mail");
  assert.deepEqual([user.role, user.status, user.archivedAt], ["admin", "active", null]);
  for (const guess of ["", "password", "Synthetic-password-2026"]) assert.equal(await new PasswordService().verify(guess, user.passwordHash), false, "no known password opens the account");

  const [audit] = await auditsOf(user.id, "auth.user.created");
  assert.deepEqual([audit?.actorType, audit?.actorUserId, audit?.result, audit?.metadataJson], ["system", null, "success", { actor: OPS_ACTOR, role: "admin", label: "Synthétique" }]);
  const [row] = await runsOf("ops.create_user");
  assert.deepEqual([row?.status, row?.resultJson, row?.errorCode], ["succeeded", { created: 1 }, null]);
  assert.equal(JSON.stringify([audit, row]).includes(email), false, "no e-mail in the audit or the run row");
});

test("ROLE-01 R5: ops:create-user refuses an existing e-mail (any case) and the superadmin role, writing nothing but a failed run row", async () => {
  const email = emailOf("dup");
  assert.equal(await run("createUser", "--email", email, "--role", "coach"), 0);
  assert.equal(await run("createUser", "--email", email.toUpperCase(), "--role", "admin"), 1);
  assert.equal(await run("createUser", "--email", emailOf("boss"), "--role", "superadmin"), 1);
  assert.equal(await run("createUser", "--email", emailOf("nobody"), "--role", "owner"), 1);
  assert.equal((await db.select().from(users).where(like(users.email, `role01-%-${tag}@example.invalid`))).filter((u) => u.email !== emailOf("coach")).length, 1);
  assert.equal((await userByEmail(email))?.role, "coach", "the first account is untouched");
  const failed = (await runsOf("ops.create_user")).filter((r) => r.status === "failed").map((r) => r.errorCode);
  assert.deepEqual(failed.slice(-3), ["USER_EMAIL_TAKEN", "SUPERADMIN_ONLY_VIA_BOOTSTRAP", "ENV_INVALID"]);
});

test("ROLE-01 R5: ops:set-role switches admin ↔ coach (audited, a repeat changes nothing) and never touches superadmin", async () => {
  const email = emailOf("switch");
  assert.equal(await run("createUser", "--email", email, "--role", "admin"), 0);
  const user = (await userByEmail(email))!;
  assert.equal(await run("setRole", "--email", email, "--role", "coach"), 0);
  assert.equal((await userByEmail(email))?.role, "coach");
  assert.equal(await run("setRole", "--email", email, "--role", "coach"), 0);
  assert.equal(await run("setRole", "--email", email, "--role", "admin"), 0);
  assert.equal((await userByEmail(email))?.role, "admin");
  assert.deepEqual((await auditsOf(user.id, "auth.user.role_changed")).map((a) => a.metadataJson),
    [{ actor: OPS_ACTOR, from: "admin", to: "coach" }, { actor: OPS_ACTOR, from: "coach", to: "admin" }]);

  assert.equal(await run("setRole", "--email", email, "--role", "superadmin"), 1, "never to superadmin");
  const superEmail = emailOf("super");
  const [superadmin] = await db.insert(users).values({ email: superEmail, passwordHash: "unused", role: "superadmin", status: "active" }).returning({ id: users.id });
  extraUserIds.push(superadmin!.id);
  assert.equal(await run("setRole", "--email", superEmail, "--role", "admin"), 1, "never from superadmin, so never the last one");
  assert.equal((await userByEmail(superEmail))?.role, "superadmin");
  assert.equal(await run("setRole", "--email", emailOf("missing"), "--role", "admin"), 1);
  assert.deepEqual((await runsOf("ops.set_role")).map((r) => r.errorCode),
    [null, null, null, "SUPERADMIN_ONLY_VIA_BOOTSTRAP", "SUPERADMIN_ONLY_VIA_BOOTSTRAP", "USER_NOT_FOUND"]);
});

test("ROLE-01 R4: migration 0019 promotes the oldest active user once, a rerun changes nothing, the CHECK refuses an unknown role", async () => {
  const migration = await readFile(fileURLToPath(new URL("../../src/db/migrations/0019_role_superadmin.sql", import.meta.url)), "utf8");
  const promote = migration.split("--> statement-breakpoint").find((statement) => statement.includes("UPDATE"));
  assert.ok(promote, "the data step is in the migration");
  const [archived, oldest, younger] = [randomUUID(), randomUUID(), randomUUID()];
  // Runs inside a transaction that is always rolled back: the real users of kfit_test are never changed.
  await db.transaction(async (tx) => {
    await tx.execute(sql`update users set role = 'admin' where role = 'superadmin'`);
    await tx.insert(users).values([
      { id: archived, email: emailOf("m-archived"), passwordHash: "unused", role: "admin", status: "archived", archivedAt: new Date("1999-06-01T00:00:00Z"), createdAt: new Date("1999-01-01T00:00:00Z") },
      { id: oldest, email: emailOf("m-oldest"), passwordHash: "unused", role: "admin", status: "active", createdAt: new Date("2000-01-01T00:00:00Z") },
      { id: younger, email: emailOf("m-younger"), passwordHash: "unused", role: "admin", status: "active", createdAt: new Date("2000-01-02T00:00:00Z") },
    ]);
    assert.equal((await tx.execute(sql.raw(promote))).rowCount, 1);
    assert.deepEqual((await tx.select({ id: users.id }).from(users).where(eq(users.role, "superadmin"))).map((r) => r.id), [oldest]);
    assert.equal((await tx.execute(sql.raw(promote))).rowCount, 0, "idempotent");
    await assert.rejects(tx.transaction((savepoint) => savepoint.insert(users).values({ email: emailOf("m-owner"), passwordHash: "unused", role: "owner", status: "active" })),
      (error: unknown) => JSON.stringify(error, Object.getOwnPropertyNames(error)).includes("users_role_known") || String((error as { cause?: unknown }).cause).includes("users_role_known"));
    tx.rollback();
  }).catch((error: unknown) => { if (!(error instanceof TransactionRollbackError)) throw error; });
  assert.equal((await db.select().from(users).where(inArray(users.id, [archived, oldest, younger]))).length, 0, "rolled back");
});
