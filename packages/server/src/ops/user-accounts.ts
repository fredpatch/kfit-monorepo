import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema/index.js";
import { users } from "../db/schema/auth.js";
import { loadAuthConfig } from "../modules/auth/config/auth.config.js";
import { AuditService } from "../modules/auth/services/audit.service.js";
import { PasswordService } from "../modules/auth/services/password.service.js";
import { withClient } from "./ops-database.js";
import { failAs, OpsError } from "./ops-errors.js";
import { recordOpsRun, USER_OPS_JOB_KEYS } from "./run-records.js";

/*
 * ROLE-01 R5: staff accounts are created and re-roled from the host, never over HTTP. The CLI manages admin and coach
 * only; the one superadmin comes from bootstrap. Nothing printed or recorded carries an e-mail or a password.
 */
export const SUPERADMIN_ONLY_VIA_BOOTSTRAP = "SUPERADMIN_ONLY_VIA_BOOTSTRAP";
export const OPS_ACTOR = "system:ops";
export const MANAGED_ROLES = ["admin", "coach"] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];
/** Hex, so the throwaway secret always passes the password policy (letters and digits). Hashed, never displayed. */
const UNUSABLE_PASSWORD_BYTES = 64;
const LABEL_MAX_LENGTH = 40;

export type UserOpsJob = keyof typeof USER_OPS_JOB_KEYS;
export const USER_OPS_USAGE: Record<UserOpsJob, string> = {
  createUser:
    "npm run ops:create-user -- --email <e> --role admin|coach [--label <prénom>]",
  setRole: "npm run ops:set-role -- --email <e> --role admin|coach",
};
export const USER_OPS_SUCCESS: Record<UserOpsJob, string> = {
  createUser:
    "Compte créé. La personne doit choisir son mot de passe via « Mot de passe oublié » sur l'écran de connexion.",
  setRole:
    "Rôle modifié. Il s'applique à la prochaine connexion ou au prochain rafraîchissement de session.",
};

type UserOpsDb = NodePgDatabase<typeof schema>;
type Actor = { auditHashPepper: string };

const canonicalEmail = (email: string) => email.trim().toLowerCase();
const option = (argv: string[], name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

function parseEmail(value: string | undefined, job: UserOpsJob): string {
  const email = canonicalEmail(value ?? "");
  if (!/^[^\s@]+@[^\s@]+$/.test(email))
    throw new OpsError("ENV_INVALID", `usage: ${USER_OPS_USAGE[job]}`);
  return email;
}

function parseRole(value: string | undefined, job: UserOpsJob): ManagedRole {
  if (value === "superadmin")
    throw new OpsError(SUPERADMIN_ONLY_VIA_BOOTSTRAP, "role superadmin");
  const role = MANAGED_ROLES.find((managed) => managed === value);
  if (!role) throw new OpsError("ENV_INVALID", `usage: ${USER_OPS_USAGE[job]}`);
  return role;
}

const findByEmail = (db: Pick<UserOpsDb, "select">, email: string) =>
  db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)
    .for("update");

/** Status active, password unusable until the person sets one through « Mot de passe oublié ». */
export async function createUser(
  db: UserOpsDb,
  input: { email: string; role: ManagedRole; label?: string | undefined },
  actor: Actor,
): Promise<{ userId: string }> {
  const passwordHash = await new PasswordService().hash(
    randomBytes(UNUSABLE_PASSWORD_BYTES).toString("hex"),
  );
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('kfit:ops:users', 0))`,
    );
    if ((await findByEmail(tx, input.email)).length)
      throw new OpsError(
        "USER_EMAIL_TAKEN",
        "an account already uses this e-mail",
      );
    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        role: input.role,
        status: "active",
      })
      .returning({ id: users.id });
    const label = input.label?.trim().slice(0, LABEL_MAX_LENGTH);
    await new AuditService(tx, actor).record({
      actorType: "system",
      eventType: "auth.user.created",
      entityType: "user",
      entityId: user!.id,
      result: "success",
      metadata: {
        actor: OPS_ACTOR,
        role: input.role,
        ...(label ? { label } : {}),
      },
    });
    return { userId: user!.id };
  });
}

/** admin ↔ coach only: a superadmin is never re-roled, so the last superadmin can never be demoted. Same role: no change, no audit. */
export async function setRole(
  db: UserOpsDb,
  input: { email: string; role: ManagedRole },
  actor: Actor,
): Promise<{ changed: 0 | 1 }> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('kfit:ops:users', 0))`,
    );
    const [user] = await findByEmail(tx, input.email);
    if (!user)
      throw new OpsError("USER_NOT_FOUND", "no account uses this e-mail");
    if (user.role === "superadmin")
      throw new OpsError(
        SUPERADMIN_ONLY_VIA_BOOTSTRAP,
        "the superadmin keeps its role",
      );
    if (user.role === input.role) return { changed: 0 };
    await tx
      .update(users)
      .set({ role: input.role, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await new AuditService(tx, actor).record({
      actorType: "system",
      eventType: "auth.user.role_changed",
      entityType: "user",
      entityId: user.id,
      result: "success",
      metadata: { actor: OPS_ACTOR, from: user.role, to: input.role },
    });
    return { changed: 1 };
  });
}

async function runUserJob(
  job: UserOpsJob,
  argv: string[],
  db: UserOpsDb,
  actor: Actor,
): Promise<Record<string, number>> {
  const email = parseEmail(option(argv, "--email"), job),
    role = parseRole(option(argv, "--role"), job);
  return failAs("USER_WRITE_FAILED", "database write refused", async () => {
    if (job === "createUser") {
      await createUser(
        db,
        { email, role, label: option(argv, "--label") },
        actor,
      );
      return { created: 1 };
    }
    return setRole(db, { email, role }, actor);
  });
}

/** Prints one sentence (never an e-mail or a password) and returns the exit code: 0 only when the run succeeded and its row was written. */
export async function userOpsMain(
  job: UserOpsJob,
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const jobKey = USER_OPS_JOB_KEYS[job],
    runKey = randomUUID(),
    startedAt = new Date();
  const databaseUrl = env.DATABASE_URL;
  let outcome:
    | { status: "succeeded"; result: Record<string, number> }
    | { status: "failed"; error: OpsError };
  try {
    if (!databaseUrl) throw new OpsError("ENV_INVALID", "DATABASE_URL");
    const auditHashPepper = (() => {
      try {
        return loadAuthConfig(env).auditHashPepper;
      } catch {
        throw new OpsError(
          "ENV_INVALID",
          "AUTH_OTP_PEPPER / AUTH_AUDIT_HASH_PEPPER (audit)",
        );
      }
    })();
    const result = await withClient(databaseUrl, (client) =>
      runUserJob(job, argv, drizzle(client, { schema }), { auditHashPepper }),
    );
    outcome = { status: "succeeded", result };
  } catch (error) {
    outcome = {
      status: "failed",
      error:
        error instanceof OpsError
          ? error
          : new OpsError("USER_WRITE_FAILED", "database unreachable", {
              cause: error,
            }),
    };
  }
  const recorded = databaseUrl
    ? await recordOpsRun(
        databaseUrl,
        outcome.status === "succeeded"
          ? {
              jobKey,
              runKey,
              status: "succeeded",
              startedAt,
              result: outcome.result,
            }
          : {
              jobKey,
              runKey,
              status: "failed",
              startedAt,
              result: {},
              errorCode: outcome.error.code,
            },
      )
    : false;
  if (outcome.status === "succeeded") console.log(USER_OPS_SUCCESS[job]);
  else
    console.error(
      `✖ ${jobKey} failed: ${outcome.error.code} (${outcome.error.detail})`,
    );
  if (!recorded)
    console.error(
      `✖ ${jobKey}: run not recorded in scheduled_job_runs (database unreachable)`,
    );
  return outcome.status === "succeeded" && recorded ? 0 : 1;
}
