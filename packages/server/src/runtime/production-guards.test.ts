import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { checkPrivacyJournalDir, evaluateProductionEnv, forbiddenDatabaseTarget, isDemoConsentTitle, PRODUCTION_REQUIRED_ENV, PRODUCTION_SECRET_ENV } from "./production-guards.js";

const secret = (seed: string) => `${seed}-${"s".repeat(40)}`.slice(0, 48);
const goodEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://kfit_app:pw@db.internal:5432/kfit_prod",
  KFIT_APP_BASE_URL: "https://app.kfit.ga",
  PRIVATE_STORAGE_ROOT: "/srv/kfit/private",
  KFIT_PRIVACY_JOURNAL_DIR: "/srv/kfit/journal",
  CLAMAV_HOST: "clamav",
  CLAMAV_PORT: "3310",
  SMTP_HOST: "smtp.relay.ga",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "kfit",
  SMTP_PASS: "relay-password",
  SMTP_FROM: "K'FIT <noreply@kfit.ga>",
  AUTH_OTP_PEPPER: secret("otp"),
  AUTH_AUDIT_HASH_PEPPER: secret("audit"),
  AUTH_REFRESH_TOKEN_PEPPER: secret("refresh"),
  AUTH_ACCESS_TOKEN_SECRET: secret("access"),
  AUTH_RECOVERY_TOKEN_SECRET: secret("recovery"),
});
const patched = "v22.23.4";
const codes = (env: NodeJS.ProcessEnv, version = patched) => evaluateProductionEnv(env, version).failures.map((f) => f.code);
const detail = (env: NodeJS.ProcessEnv, code: string) => evaluateProductionEnv(env, patched).failures.find((f) => f.code === code)?.detail;

test("S7.4 D2: a complete production environment on a patched Node passes", () => {
  assert.deepEqual(evaluateProductionEnv(goodEnv(), patched), { failures: [], warnings: [] });
});

test("S7.4 D2: each required key, empty or a placeholder, is ENV_MISSING by name only", () => {
  for (const key of PRODUCTION_REQUIRED_ENV) {
    const env = goodEnv(); delete env[key];
    assert.deepEqual(codes(env), ["ENV_MISSING"], key);
    assert.equal(detail(env, "ENV_MISSING"), key);
  }
  for (const placeholder of ["", "   ", "change-me", "CHANGEME-now", "CHANGE_ME_WITH_A_STRONG_SECRET", "smtp.example.com", "dev-relay", "xxx", "TODO"]) {
    assert.deepEqual(codes({ ...goodEnv(), SMTP_HOST: placeholder }), ["ENV_MISSING"], placeholder);
  }
  const leaked = evaluateProductionEnv({ ...goodEnv(), SMTP_PASS: "change-me-secret-value" }, patched);
  assert.ok(!JSON.stringify(leaked).includes("change-me-secret-value"), "no value in the report");
});

test("S7.4 D2: a secret shorter than 32 characters is ENV_WEAK_SECRET", () => {
  for (const key of PRODUCTION_SECRET_ENV) {
    assert.deepEqual(codes({ ...goodEnv(), [key]: "short-but-real-31-characters-xy".slice(0, 31) }), ["ENV_WEAK_SECRET"], key);
  }
  assert.deepEqual(codes({ ...goodEnv(), AUTH_OTP_PEPPER: "p".repeat(32) }), []);
});

test("S7.4 D2: the security floor, an http base URL and a dev or test database each refuse alone", () => {
  assert.deepEqual(codes(goodEnv(), "v22.23.3"), ["SECURITY_FLOOR"]);
  assert.deepEqual(codes({ ...goodEnv(), KFIT_APP_BASE_URL: "http://app.kfit.ga" }), ["APP_BASE_URL_NOT_HTTPS"]);
  assert.deepEqual(codes({ ...goodEnv(), KFIT_APP_BASE_URL: "not a url" }), ["APP_BASE_URL_NOT_HTTPS"]);
  for (const url of ["postgresql://u:p@db.internal:5432/kfit_dev", "postgresql://u:p@db.internal:5432/kfit_test", "postgresql://u:p@localhost:5433/kfit_prod", "postgresql://u:p@127.0.0.1:5433/kfit_prod"]) {
    assert.deepEqual(codes({ ...goodEnv(), DATABASE_URL: url }), ["DATABASE_TARGET_FORBIDDEN"], url);
  }
  assert.equal(forbiddenDatabaseTarget("postgresql://u:p@localhost:5432/kfit_prod"), null);
});

test("S7.4 D3: KFIT_PRIVACY_JOBS=off is refused; KFIT_NOTIFICATION_JOBS=off is only a warning", () => {
  assert.deepEqual(codes({ ...goodEnv(), KFIT_PRIVACY_JOBS: "off" }), ["PRIVACY_JOBS_DISABLED"]);
  const notifications = evaluateProductionEnv({ ...goodEnv(), KFIT_NOTIFICATION_JOBS: "off" }, patched);
  assert.deepEqual(notifications.failures, []);
  assert.equal(notifications.warnings.length, 1);
});

test("S7.4 D2: several failures are reported together", () => {
  const env: NodeJS.ProcessEnv = { ...goodEnv(), KFIT_APP_BASE_URL: "http://app.kfit.ga", DATABASE_URL: "postgresql://u:p@db:5432/kfit_dev", KFIT_PRIVACY_JOBS: "off", AUTH_OTP_PEPPER: "short" };
  delete env.SMTP_HOST;
  assert.deepEqual(codes(env, "v20.19.0").sort(), ["APP_BASE_URL_NOT_HTTPS", "DATABASE_TARGET_FORBIDDEN", "ENV_MISSING", "ENV_WEAK_SECRET", "PRIVACY_JOBS_DISABLED", "SECURITY_FLOOR"]);
});

test("S7.3 D9: demo consent titles match with or without case and accents", () => {
  for (const title of ["DÉMONSTRATION — conditions", "Texte de démonstration", "Demonstration", "DEMONSTRATION"]) assert.ok(isDemoConsentTitle(title), title);
  assert.equal(isDemoConsentTitle("Conditions générales de service"), false);
});

let root = "";
before(async () => { root = await mkdtemp(path.join(tmpdir(), "kfit-journal-guard-")); });
after(async () => { if (root) await rm(root, { recursive: true, force: true }); });

test("S7.4 D2: the privacy journal directory must exist, be a directory and accept a write", async () => {
  assert.equal(await checkPrivacyJournalDir(root), null);
  assert.deepEqual(await checkPrivacyJournalDir(path.join(root, "missing")), { code: "PRIVACY_JOURNAL_UNAVAILABLE", detail: "missing" });
  const file = path.join(root, "a-file");
  await writeFile(file, "x");
  assert.deepEqual(await checkPrivacyJournalDir(file), { code: "PRIVACY_JOURNAL_UNAVAILABLE", detail: "not a directory" });
});

test("S7.4 D2: a read-only privacy journal directory is refused", { skip: process.platform === "win32" ? "chmod cannot make a directory read-only on Windows" : (process.getuid?.() === 0 ? "root ignores directory permissions" : false) }, async () => {
  const readOnly = path.join(root, "read-only");
  await mkdir(readOnly);
  await chmod(readOnly, 0o555);
  try {
    assert.deepEqual(await checkPrivacyJournalDir(readOnly), { code: "PRIVACY_JOURNAL_UNAVAILABLE", detail: "not writable" });
  } finally {
    await chmod(readOnly, 0o755);
  }
});
