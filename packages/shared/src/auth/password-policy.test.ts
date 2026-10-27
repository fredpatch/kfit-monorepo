import assert from "node:assert/strict";
import test from "node:test";
import {
  authPasswordStrength,
  checkAuthPasswordRules,
  firstFailedAuthPasswordRule,
} from "./password-policy.js";

test("password rules follow the server order: length, letter, number", () => {
  assert.equal(firstFailedAuthPasswordRule("short1"), "too_short");
  assert.equal(firstFailedAuthPasswordRule("123456789012"), "missing_letter");
  assert.equal(firstFailedAuthPasswordRule("abcdefghijkl"), "missing_number");
  assert.equal(firstFailedAuthPasswordRule("abcdefghijk1"), null);
  assert.deepEqual(
    checkAuthPasswordRules("").map((c) => c.met),
    [false, false, false],
  );
});

test("strength is advisory and only counts once the rules pass", () => {
  assert.equal(authPasswordStrength("abc1"), 0);
  assert.equal(authPasswordStrength("abcdefghijk1"), 1);
  assert.equal(authPasswordStrength("abcdefghijklmno1"), 2);
  assert.equal(authPasswordStrength("Abcdefghijklmno1"), 3);
  assert.equal(authPasswordStrength("abcdefghij-1"), 2);
});
