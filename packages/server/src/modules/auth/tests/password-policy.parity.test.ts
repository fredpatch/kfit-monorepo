import assert from "node:assert/strict";
import test from "node:test";
import {
  authPasswordMinLength,
  firstFailedAuthPasswordRule,
} from "@kfit/shared";
import {
  defaultPasswordHashOptions,
  validatePasswordStrength,
} from "../services/password.service.js";

// The UI password meter (UX-10) uses the @kfit/shared copy; the server stays authoritative.
test("shared password policy matches the server policy", () => {
  assert.equal(authPasswordMinLength, defaultPasswordHashOptions.minLength);

  const samples = [
    "",
    "a1",
    "short9",
    "123456789012",
    "abcdefghijkl",
    "abcdefghijk1",
    "ABCDEFGHIJK1",
    "éééééééééé11",
    "abc def ghi 1",
    "Abcdefghijklmno1!",
  ];
  for (const password of samples) {
    const server = validatePasswordStrength(password);
    const shared = firstFailedAuthPasswordRule(password);
    assert.deepEqual(
      shared === null ? { ok: true } : { ok: false, reason: shared },
      server,
      `mismatch for ${JSON.stringify(password)}`,
    );
  }
});
