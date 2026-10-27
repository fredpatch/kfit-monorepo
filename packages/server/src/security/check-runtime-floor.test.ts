import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../../scripts/security/check-runtime-floor.mjs", import.meta.url),
);
const run = (env: Record<string, string>) => {
  const {
    NODE_ENV: _ignored,
    KFIT_SECURITY_FLOOR_TEST_VERSION: _override,
    ...base
  } = process.env;
  return spawnSync(process.execPath, [script], {
    env: { ...base, ...env },
    encoding: "utf8",
  });
};

test("SEC-01 D3: security:check passes on this runner (above the floor) and fails on an overridden vulnerable version", () => {
  const current = run({});
  assert.equal(current.status, 0, current.stderr);
  const vulnerable = run({ KFIT_SECURITY_FLOOR_TEST_VERSION: "v22.23.3" });
  assert.equal(vulnerable.status, 1);
  assert.match(
    vulnerable.stderr,
    /CVE-2026-111497: below_minimum \(required ≥ 22\.23\.4\)/,
  );
  assert.equal(run({ KFIT_SECURITY_FLOOR_TEST_VERSION: "v20.19.0" }).status, 1);
});

test("SEC-01 D3: the version override is ignored when NODE_ENV=production", () => {
  assert.equal(
    run({
      NODE_ENV: "production",
      KFIT_SECURITY_FLOOR_TEST_VERSION: "v22.23.3",
    }).status,
    0,
  );
});
