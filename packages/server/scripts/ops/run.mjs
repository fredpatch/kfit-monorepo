import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

/*
 * FIX-03 F3: `node ./scripts/ops/run.mjs <job> [args…]` is the whole npm script, so npm appends the user's arguments to a
 * single node command (no `&&` chain, where Windows cmd escaping left a trailing `^` on a quoted path). The build runs as
 * a separate process that never sees the user's arguments; the target script then reads them unchanged in process.argv.
 * Test-only (NODE_ENV=test): --skip-build, and KFIT_OPS_RUNNER_TARGET to replace the target script.
 */
const TARGETS = {
  backup: "./backup.mjs",
  restore: "./restore.mjs",
  "restore-drill": "./restore-drill.mjs",
  "privacy-replay": "../privacy/replay.mjs",
  "privacy-journal-sync": "../privacy/journal-sync.mjs",
  "create-user": "./create-user.mjs",
  "set-role": "./set-role.mjs",
};

const [job, ...rest] = process.argv.slice(2);
if (!Object.hasOwn(TARGETS, job ?? "")) {
  console.error(`✖ usage: node scripts/ops/run.mjs <${Object.keys(TARGETS).join("|")}> [args…]`);
  process.exit(1);
}
const testMode = process.env.NODE_ENV === "test";
const skipBuild = rest[0] === "--skip-build";
if (skipBuild && !testMode) {
  console.error("✖ --skip-build is only accepted with NODE_ENV=test.");
  process.exit(1);
}
const args = skipBuild ? rest.slice(1) : rest;

if (!skipBuild) {
  // A fixed command string: no user input reaches the shell (npm is a .cmd script on Windows).
  const build = spawnSync("npm run build", { cwd: fileURLToPath(new URL("../../", import.meta.url)), stdio: "inherit", shell: true });
  if (build.status !== 0) {
    console.error("✖ build failed; nothing was run.");
    process.exit(build.status ?? 1);
  }
}

const override = testMode ? process.env.KFIT_OPS_RUNNER_TARGET : undefined;
const target = override ? pathToFileURL(override) : new URL(TARGETS[job], import.meta.url);
process.argv = [process.argv[0], fileURLToPath(target), ...args];
await import(target.href);
