import assert from "node:assert/strict";
import test from "node:test";
import { developmentDemoAccount } from "@kfit/shared";
import { validatePasswordStrength } from "../modules/auth/services/password.service.js";
import {
  assertLocalDemoEnvironment,
  DemoAdminSetupError,
} from "./demo-admin.js";

test("demo provisioning permits only the expected local development database", () => {
  for (const host of ["localhost", "127.0.0.1"]) {
    assert.doesNotThrow(() =>
      assertLocalDemoEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: `postgresql://synthetic:synthetic@${host}:5433/kfit_dev`,
      }),
    );
  }
});

test("demo provisioning refuses production, staging, test and unspecified modes", () => {
  for (const mode of ["production", "staging", "test", undefined]) {
    assert.throws(
      () =>
        assertLocalDemoEnvironment({
          NODE_ENV: mode,
          DATABASE_URL:
            "postgresql://synthetic:synthetic@localhost:5433/kfit_dev",
        }),
      DemoAdminSetupError,
    );
  }
});

test("demo provisioning refuses remote/native databases and connection URL overrides", () => {
  for (const target of [
    undefined,
    "invalid",
    "postgresql://remote.invalid:5433/kfit_dev",
    "postgresql://localhost:5432/kfit_dev",
    "postgresql://localhost:5433/kfit_prod",
    "postgresql://localhost:5433/kfit_dev?host=remote.invalid",
    "postgresql://localhost:5433/kfit_dev?port=5432",
    "postgresql://localhost:5433/kfit_dev#override",
    "https://localhost:5433/kfit_dev",
  ]) {
    assert.throws(
      () =>
        assertLocalDemoEnvironment({
          NODE_ENV: "development",
          DATABASE_URL: target,
        }),
      DemoAdminSetupError,
    );
  }
});

test("public synthetic demo password satisfies the normal authentication password policy", () => {
  assert.deepEqual(validatePasswordStrength(developmentDemoAccount.password), {
    ok: true,
  });
});
