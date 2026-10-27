import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// S7.3 D11: `npm run privacy:journal-sync` appends executed anonymizations present in the DB but missing from the
// off-database journal (dedupe by eventId), e.g. after an append failed post-commit. Output: counts only.
let pool;
try {
  if (process.env.DATABASE_URL) throw new Error("Inherited database target");
  const env = config({
    path: fileURLToPath(new URL("../../../../.env", import.meta.url)),
  });
  if (env.error) throw new Error("Missing local environment");
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.port !== "5433" ||
    target.search
  )
    throw new Error("Unsafe database target");
  const { createPrivacyJournal, PRIVACY_JOURNAL_DIR_ENV } =
    await import("../../dist/modules/privacy/services/privacy-journal.js");
  const journal = createPrivacyJournal(process.env[PRIVACY_JOURNAL_DIR_ENV]);
  if (!journal) throw new Error("NO_JOURNAL");
  const database = await import("../../dist/db/client.js");
  pool = database.pool;
  const { loadAuthConfig } =
    await import("../../dist/modules/auth/config/auth.config.js");
  const { DrizzlePrivacyRepository } =
    await import("../../dist/modules/privacy/repositories/privacy.repository.js");
  const { syncPrivacyJournal } =
    await import("../../dist/modules/privacy/services/privacy-replay.js");
  const counts = await syncPrivacyJournal({
    repository: new DrizzlePrivacyRepository(database.db, {
      auditHashPepper: loadAuthConfig(process.env).auditHashPepper,
    }),
    journal,
  });
  console.log(JSON.stringify(counts));
} catch (error) {
  console.error(
    error instanceof Error && error.message === "NO_JOURNAL"
      ? "KFIT_PRIVACY_JOURNAL_DIR is not set: the privacy journal is disabled."
      : `Privacy journal sync aborted (${error instanceof Error ? error.name : "error"}). Verify the local environment and build.`,
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
