import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../scripts/prod/api-server.mjs", import.meta.url));
// Only what the OS needs to start Node; nothing from the developer's environment (no DATABASE_URL, so no database is touched).
const bare = Object.fromEntries(["PATH", "Path", "SystemRoot", "TEMP", "TMP", "HOME", "USERPROFILE"].filter((key) => process.env[key]).map((key) => [key, process.env[key]!]));
const run = (env: Record<string, string>) => {
  const result = spawnSync(process.execPath, [script], { env: { ...bare, ...env }, encoding: "utf8", timeout: 30_000 });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

test("S7.4 D1: the production entrypoint refuses to start unless NODE_ENV=production", () => {
  for (const nodeEnv of [undefined, "development", "test", "Production"]) {
    const result = run(nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv });
    assert.equal(result.status, 1, String(nodeEnv));
    assert.match(result.output, /NODE_ENV must be "production"/);
  }
});

test("S7.4 D2: production with an empty environment exits 1, lists ENV_MISSING by key and prints no value", () => {
  const planted = "change-me-PLANTED-SECRET-VALUE-0123456789";
  const result = run({ NODE_ENV: "production", AUTH_OTP_PEPPER: planted });
  assert.equal(result.status, 1);
  assert.match(result.output, /production guards failed/);
  assert.match(result.output, /ENV_MISSING \([^)]*DATABASE_URL[^)]*AUTH_OTP_PEPPER/);
  assert.ok(!result.output.includes(planted), "the planted value is never printed");
  assert.doesNotMatch(result.output, /listening/);
});
