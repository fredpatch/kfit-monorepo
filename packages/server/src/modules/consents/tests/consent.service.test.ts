import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { ConsentDefinition, ConsentRecord } from "@kfit/shared";
import {
  ConsentService,
  currentDecisions,
  latestDefinitions,
  parseDecisions,
  requiredBundle,
  type ConsentRepository,
} from "../services/consent.service.js";
import {
  createConsentToken,
  hashConsentToken,
  validateConsentToken,
  consentTokenScope,
} from "../services/consent-token.crypto.js";
const id = randomUUID();
const actor = { userId: id, requestId: id, ipAddress: null, userAgent: null };
const noCalls: ConsentRepository = {
  async execute() {
    assert.fail("invalid input reached persistence");
  },
  async publicAccess() {
    assert.fail("invalid input reached persistence");
  },
};
const service = new ConsentService(noCalls);
const definition = (
  type: "service_terms" | "privacy_notice",
  version = "1",
): ConsentDefinition => ({
  id: randomUUID(),
  consentType: type,
  version,
  title: "Synthetic",
  content: "Synthetic text",
  contentHash: "hash",
  status: "published",
  publishedAt: new Date().toISOString(),
  retiredAt: null,
});
test("required decisions reject missing, revoked, optional and identity/version override inputs", () => {
  for (const body of [
    null,
    {},
    { decisions: { service_terms: "granted" } },
    { decisions: { service_terms: "granted", privacy_notice: "revoked" } },
    {
      decisions: {
        service_terms: "granted",
        privacy_notice: "granted",
        marketing: "granted",
      },
    },
    {
      decisions: { service_terms: "granted", privacy_notice: "granted" },
      definitionId: id,
    },
  ])
    assert.equal(parseDecisions(body), null);
  assert.deepEqual(
    parseDecisions({
      decisions: { service_terms: "granted", privacy_notice: "refused" },
    }),
    { service_terms: "granted", privacy_notice: "refused" },
  );
});
test("issuance requires an explicit future expiry with timezone and accepts no token overrides", async () => {
  for (const body of [
    {},
    { expiresAt: "invalid" },
    { expiresAt: "2000-01-01T00:00:00Z" },
    { expiresAt: "2030-01-01T00:00:00" },
    { expiresAt: "2030-01-01T00:00:00Z", token: "chosen" },
  ])
    assert.deepEqual(
      await service.execute(id, "issue", body, undefined, actor),
      { ok: false, error: "CONSENT_INVALID_INPUT" },
    );
});
test("required acceptances cannot be revoked", async () => {
  for (const type of ["service_terms", "privacy_notice"])
    assert.deepEqual(await service.execute(id, "revoke", {}, type, actor), {
      ok: false,
      error: "CONSENT_REVOCATION_FORBIDDEN",
    });
});
test("invalid subscription/token selectors fail before persistence", async () => {
  assert.deepEqual(await service.execute("bad", "read", {}, undefined, actor), {
    ok: false,
    error: "CONSENT_INVALID_INPUT",
  });
  assert.deepEqual(await service.execute(id, "revoke_link", {}, "bad", actor), {
    ok: false,
    error: "CONSENT_INVALID_INPUT",
  });
});
test("coach capture requires exactly two displayed definition guards", async () => {
  for (const body of [
    { decisions: { service_terms: "granted", privacy_notice: "granted" } },
    {
      decisions: { service_terms: "granted", privacy_notice: "granted" },
      expectedDefinitionIds: [id, id],
    },
    {
      decisions: { service_terms: "granted", privacy_notice: "granted" },
      expectedDefinitionIds: [id, "bad"],
    },
  ]) {
    assert.deepEqual(
      await service.execute(id, "capture", body, undefined, actor),
      { ok: false, error: "CONSENT_INVALID_INPUT" },
    );
  }
});
test("definition ordering is numeric across version 9, 10 and 100", () => {
  assert.equal(
    latestDefinitions([
      definition("service_terms", "9"),
      definition("service_terms", "100"),
      definition("service_terms", "10"),
    ])[0]?.version,
    "100",
  );
});
test("required bundle rejects missing definitions and never treats optional grants as acceptance", () => {
  assert.equal(requiredBundle([], []).satisfied, false);
  assert.equal(
    requiredBundle(
      [definition("service_terms"), definition("privacy_notice")],
      [],
    ).satisfied,
    false,
  );
});
test("current decision follows supersession even when timestamps are equal or backwards", () => {
  const first: ConsentRecord = {
    id,
    consentType: "service_terms",
    consentDefinitionId: id,
    definitionVersion: "1",
    decision: "granted",
    capturedVia: "coach_assisted",
    capturedAt: "2030-01-01T00:00:00Z",
    capturedByUserId: id,
    secureAccessTokenId: null,
    supersedesConsentRecordId: null,
  };
  const second: ConsentRecord = {
    ...first,
    id: randomUUID(),
    decision: "refused",
    capturedAt: "2029-01-01T00:00:00Z",
    supersedesConsentRecordId: id,
  };
  assert.deepEqual(currentDecisions([first, second]), [second]);
  assert.equal(
    currentDecisions([first, { ...second, supersedesConsentRecordId: null }]),
    null,
  );
});
test("random 256-bit bearer tokens have stable SHA256 digests and distinct issuance", () => {
  const first = createConsentToken();
  const second = createConsentToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.match(hashConsentToken(first), /^[0-9a-f]{64}$/);
  assert.notEqual(hashConsentToken(first), first);
});
test("token validation enforces action, resource, expiry, revocation and single use", () => {
  const token = {
    ...consentTokenScope,
    expiresAt: new Date(Date.now() + 60000),
    revokedAt: null,
    usedAt: null,
    maxUses: 1,
    useCount: 0,
    requiresOtp: false,
  };
  assert.equal(validateConsentToken(token), null);
  assert.equal(
    validateConsentToken({ ...token, action: "download" }),
    "CONSENT_LINK_INVALID",
  );
  assert.equal(
    validateConsentToken({ ...token, resourceType: "document" }),
    "CONSENT_LINK_INVALID",
  );
  assert.equal(
    validateConsentToken({ ...token, expiresAt: new Date(0) }),
    "CONSENT_LINK_EXPIRED",
  );
  assert.equal(
    validateConsentToken({ ...token, revokedAt: new Date() }),
    "CONSENT_LINK_REVOKED",
  );
  assert.equal(
    validateConsentToken({ ...token, useCount: 1 }),
    "CONSENT_LINK_CONSUMED",
  );
  assert.equal(
    validateConsentToken({ ...token, requiresOtp: true }),
    "CONSENT_LINK_INVALID",
  );
});
