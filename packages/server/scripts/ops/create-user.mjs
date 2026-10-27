import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// ROLE-01 R5: creates an admin or coach account (status active, unusable password until « Mot de passe oublié »).
// Loads the root .env when present (local); otherwise the process environment (production host).
// Output: one French sentence, never an e-mail or a password; exit 1 on any failure or when the run could not be recorded.
const rootEnv = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(rootEnv)) config({ path: rootEnv, quiet: true });
const { userOpsMain } = await import("../../dist/ops/user-accounts.js");
process.exitCode = await userOpsMain("createUser", process.argv.slice(2));
