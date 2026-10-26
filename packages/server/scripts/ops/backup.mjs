import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// S7.4 D6 / S7.4b B4: encrypted bundle (database, private files, privacy journal) in BACKUP_DIR, copied to BACKUP_SECONDARY_DIR, rotated.
// Loads the root .env when present (local); otherwise the process environment (production host timer, S7.4 D8).
// Output: one JSON line with counts only; exit 1 on any failure or when the run could not be recorded.
const rootEnv = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(rootEnv)) config({ path: rootEnv, quiet: true });
const { opsMain } = await import("../../dist/ops/ops-cli.js");
process.exitCode = await opsMain("backup", process.argv.slice(2));
