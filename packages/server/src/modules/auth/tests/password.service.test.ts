import assert from "node:assert/strict";
import test from "node:test";
import { PasswordService, validatePasswordStrength } from "../services/password.service.js";

test("PasswordService stores adaptive scrypt hashes and verifies without storing raw passwords", async () => {
  const service = new PasswordService({
    saltBytes: 8,
    keyLength: 32,
    cost: 1024,
    blockSize: 8,
    parallelization: 1,
    minLength: 12,
  });

  const password = "CorrectHorse9";
  const hash = await service.hash(password);

  assert.match(hash, /^kfit-scrypt\$v=1\$N=1024\$r=8\$p=1\$keylen=32\$/);
  assert.equal(hash.includes(password), false);
  assert.equal(await service.verify(password, hash), true);
  assert.equal(await service.verify("WrongPassword9", hash), false);
});

test("password policy rejects weak bootstrap passwords", () => {
  assert.deepEqual(validatePasswordStrength("short9", { minLength: 12 }), { ok: false, reason: "too_short" });
  assert.deepEqual(validatePasswordStrength("123456789012", { minLength: 12 }), { ok: false, reason: "missing_letter" });
  assert.deepEqual(validatePasswordStrength("CorrectHorse", { minLength: 12 }), { ok: false, reason: "missing_number" });
  assert.deepEqual(validatePasswordStrength("CorrectHorse9", { minLength: 12 }), { ok: true });
});
