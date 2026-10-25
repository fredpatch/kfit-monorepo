import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// S7.3 rule 7 / D11: `npm run privacy:replay -- --since <iso>` re-applies executed anonymizations (journal ∪ DB) after a restore,
// before traffic is reopened. Local database only until S7.4 production enablement. Output: counts only.
let pool;
try {
  const sinceIndex = process.argv.indexOf("--since");
  const since = new Date(sinceIndex > 0 ? process.argv[sinceIndex + 1] ?? "" : "");
  if (!Number.isFinite(since.getTime())) throw new Error("USAGE");
  if (process.env.DATABASE_URL) throw new Error("Inherited database target");
  const env = config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
  if (env.error) throw new Error("Missing local environment");
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "5433" || target.search) throw new Error("Unsafe database target");
  const database = await import("../../dist/db/client.js");
  pool = database.pool;
  const { loadAuthConfig } = await import("../../dist/modules/auth/config/auth.config.js");
  const { DrizzlePrivacyRepository } = await import("../../dist/modules/privacy/repositories/privacy.repository.js");
  const { createPrivacyJournal, PRIVACY_JOURNAL_DIR_ENV } = await import("../../dist/modules/privacy/services/privacy-journal.js");
  const { runPrivacyReplay } = await import("../../dist/modules/privacy/services/privacy-replay.js");
  const { PrivateDocumentStorage } = await import("../../dist/modules/documents/services/document-storage.service.js");
  const journal = createPrivacyJournal(process.env[PRIVACY_JOURNAL_DIR_ENV]);
  const storage = new PrivateDocumentStorage();
  const counts = await runPrivacyReplay({
    repository: new DrizzlePrivacyRepository(database.db, { auditHashPepper: loadAuthConfig(process.env).auditHashPepper }),
    journal,
    removeStoredObject: (key) => storage.remove(key),
  }, since, new Date());
  console.log(JSON.stringify({ since: since.toISOString(), journalEnabled: journal !== null, ...counts }));
} catch (error) {
  console.error(error instanceof Error && error.message === "USAGE"
    ? "Usage: npm run privacy:replay -- --since <ISO date>"
    : `Privacy replay aborted (${error instanceof Error ? error.name : "error"}). Verify the local environment, migrations and build; each event replays in its own transaction.`);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
