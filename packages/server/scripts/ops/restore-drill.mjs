import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// S7.4 D10 / S7.4b B7: restore of the newest bundle into a throwaway kfit_restore_* database, checked against the manifest, then dropped.
// Loads the root .env when present (local); otherwise the process environment (production host timer, S7.4 D8).
// Output: one JSON line with counts only; exit 1 on any failure or when the run could not be recorded.
const rootEnv = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(rootEnv)) config({ path: rootEnv, quiet: true });
const { opsMain } = await import("../../dist/ops/ops-cli.js");
process.exitCode = await opsMain("drill", process.argv.slice(2));
