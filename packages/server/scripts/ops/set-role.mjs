import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// ROLE-01 R5: switches an account between admin and coach (never to or from superadmin).
// Loads the root .env when present (local); otherwise the process environment (production host).
// Output: one French sentence, never an e-mail or a password; exit 1 on any failure or when the run could not be recorded.
const rootEnv = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(rootEnv)) config({ path: rootEnv, quiet: true });
const { userOpsMain } = await import("../../dist/ops/user-accounts.js");
process.exitCode = await userOpsMain("setRole", process.argv.slice(2));
