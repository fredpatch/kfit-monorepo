import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type {
  ConsentDefinition,
  ConsentRecord,
  ConsentType,
} from "@kfit/shared";
import {
  ConsentDefinitionService,
  ConsentService,
  consentScopeAllows,
  optionalConsentLinkValidityMs,
  optionalConsentStates,
  parseDecisions,
  parseDecisionShape,
  requestedDecisionError,
  type ConsentCommand,
  type ConsentDefinitionCommand,
  type ConsentRepository,
} from "../services/consent.service.js";
import {
  optionalConsentTokenScope,
  validateConsentToken,
} from "../services/consent-token.crypto.js";

const id = randomUUID();
const actor = { userId: id, requestId: id, ipAddress: null, userAgent: null };
function recording() {
  const commands: ConsentCommand[] = [];
  const repository: ConsentRepository = {
    async execute(_id, command) {
      commands.push(command);
      return { ok: true, body: { accepted: true } };
    },
    async publicAccess() {
      return { ok: true, body: { accepted: true } };
    },
  };
  return { commands, service: new ConsentService(repository) };
}
const definition = (
  consentType: ConsentType,
  version: string,
): ConsentDefinition => ({
  id: randomUUID(),
  consentType,
  version,
  title: "Synthetic",
  content: "Synthetic text",
  contentHash: "hash",
  status: "published",
  publishedAt: new Date().toISOString(),
  retiredAt: null,
});
const record = (
  definitionRow: ConsentDefinition,
  decision: ConsentRecord["decision"],
): ConsentRecord => ({
  id: randomUUID(),
  consentType: definitionRow.consentType,
  consentDefinitionId: definitionRow.id,
  definitionVersion: definitionRow.version,
  decision,
  capturedVia: "coach_assisted",
  capturedAt: new Date().toISOString(),
  capturedByUserId: id,
  secureAccessTokenId: null,
  supersedesConsentRecordId: null,
});

test("CONS-02 status rule: required onboarding-only, optional while onboarding, active or paused (D1, D5)", () => {
  for (const status of ["onboarding", "active", "paused"])
    assert.equal(consentScopeAllows("optional", status), true, status);
  for (const status of [
    "completed",
    "cancelled",
    "ready_to_start",
    "awaiting_payment",
  ])
    assert.equal(consentScopeAllows("optional", status), false, status);
  assert.equal(consentScopeAllows("required", "onboarding"), true);
  for (const status of ["active", "paused"])
    assert.equal(consentScopeAllows("required", status), false, status);
});

test("CONS-02 decisions answer exactly the requested set, each granted or refused independently (D3)", () => {
  const requested = ["health_data", "progress_photo_storage"] as const;
  assert.deepEqual(
    parseDecisions(
      {
        decisions: {
          health_data: "granted",
          progress_photo_storage: "refused",
        },
      },
      requested,
    ),
    { health_data: "granted", progress_photo_storage: "refused" },
  );
  assert.equal(
    requestedDecisionError({ health_data: "granted" }, requested),
    "CONSENT_INVALID_INPUT",
  );
  assert.equal(
    requestedDecisionError(
      {
        health_data: "granted",
        progress_photo_storage: "granted",
        marketing: "granted",
      },
      requested,
    ),
    "CONSENT_TYPE_NOT_REQUESTED",
  );
  assert.equal(
    requestedDecisionError(
      {
        health_data: "granted",
        progress_photo_storage: "refused",
        service_terms: "granted",
      },
      requested,
    ),
    "CONSENT_TYPE_NOT_REQUESTED",
  );
  for (const body of [
    { decisions: {} },
    { decisions: { health_data: "revoked" } },
    { decisions: { unknown: "granted" } },
    { decisions: { health_data: "granted" }, note: "x" },
  ])
    assert.equal(parseDecisionShape(body), null, JSON.stringify(body));
});

test("CONS-02 optional state reports renewal when the grant is on an older version (D6)", () => {
  const v1 = definition("health_data", "1"),
    v2 = definition("health_data", "2"),
    photo = definition("progress_photo_storage", "1"),
    marketing = definition("marketing", "1");
  const states = optionalConsentStates(
    [v1, v2, photo, marketing],
    [
      record(v1, "granted"),
      record(photo, "refused"),
      record(marketing, "revoked"),
    ],
  );
  assert.deepEqual(states, {
    health_data: "renewal_required",
    progress_photo_storage: "refused",
    marketing: "revoked",
    publication: "none",
  });
  assert.equal(
    optionalConsentStates([v1, v2], [record(v2, "granted")]).health_data,
    "granted",
  );
});

test("CONS-02 optional link input: at least one optional type, default validity 7 days, explicit future expiry otherwise (D2, D3)", async () => {
  const { commands, service } = recording();
  const before = Date.now();
  assert.ok(
    (
      await service.execute(
        id,
        "issue_optional",
        { types: ["health_data", "progress_photo_storage"] },
        undefined,
        actor,
      )
    ).ok,
  );
  const issued = commands[0];
  assert.ok(issued?.action === "issue_optional");
  assert.deepEqual(issued.types, ["health_data", "progress_photo_storage"]);
  assert.ok(
    issued.expiresAt.getTime() >= before + optionalConsentLinkValidityMs &&
      issued.expiresAt.getTime() <= Date.now() + optionalConsentLinkValidityMs,
  );
  assert.ok(
    (
      await service.execute(
        id,
        "issue_optional",
        { types: ["marketing"], expiresAt: "2030-01-01T00:00:00Z" },
        undefined,
        actor,
      )
    ).ok,
  );
  for (const body of [
    {},
    { types: [] },
    { types: ["service_terms"] },
    { types: ["health_data", "health_data"] },
    { types: ["health_data"], expiresAt: "2000-01-01T00:00:00Z" },
    { types: ["health_data"], expiresAt: "2030-01-01T00:00:00" },
    { types: ["health_data"], definitionIds: [id] },
  ])
    assert.deepEqual(
      await service.execute(id, "issue_optional", body, undefined, actor),
      { ok: false, error: "CONSENT_INVALID_INPUT" },
      JSON.stringify(body),
    );
  assert.equal(commands.length, 2);
});

test("CONS-02 optional coach capture needs one displayed-definition guard per optional decision and no note (D4)", async () => {
  const { commands, service } = recording();
  assert.ok(
    (
      await service.execute(
        id,
        "capture_optional",
        {
          decisions: { health_data: "granted", publication: "refused" },
          expectedDefinitionIds: [randomUUID(), randomUUID()],
        },
        undefined,
        actor,
      )
    ).ok,
  );
  for (const body of [
    { decisions: { health_data: "granted" }, expectedDefinitionIds: [] },
    { decisions: { service_terms: "granted" }, expectedDefinitionIds: [id] },
    {
      decisions: { health_data: "granted" },
      expectedDefinitionIds: [id],
      note: "free text",
    },
    { decisions: { health_data: "granted" }, expectedDefinitionIds: ["bad"] },
  ])
    assert.deepEqual(
      await service.execute(id, "capture_optional", body, undefined, actor),
      { ok: false, error: "CONSENT_INVALID_INPUT" },
      JSON.stringify(body),
    );
  assert.equal(commands.length, 1);
});

test("CONS-02 optional tokens pass the shared single-use validation", () => {
  const token = {
    ...optionalConsentTokenScope,
    expiresAt: new Date(Date.now() + 60000),
    revokedAt: null,
    usedAt: null,
    maxUses: 1,
    useCount: 0,
    requiresOtp: false,
  };
  assert.equal(validateConsentToken(token), null);
  assert.equal(
    validateConsentToken({ ...token, useCount: 1 }),
    "CONSENT_LINK_CONSUMED",
  );
});

test("CONS-02 definition admin input: type, title and content on create; title/content only on edit; empty body on publish/delete (D7)", async () => {
  const commands: ConsentDefinitionCommand[] = [];
  const service = new ConsentDefinitionService({
    async definitions(command) {
      commands.push(command);
      return { ok: true, body: { deleted: true } };
    },
  });
  assert.ok(
    (
      await service.execute(
        "definition_create",
        { consentType: "health_data", title: "T", content: "C" },
        undefined,
        actor,
      )
    ).ok,
  );
  assert.ok(
    (await service.execute("definition_update", { content: "C2" }, id, actor))
      .ok,
  );
  assert.ok((await service.execute("definition_publish", {}, id, actor)).ok);
  assert.deepEqual(commands.slice(1), [
    { action: "definition_update", definitionId: id, content: "C2" },
    { action: "definition_publish", definitionId: id },
  ]);
  for (const [action, body, selector] of [
    [
      "definition_create",
      { consentType: "bogus", title: "T", content: "C" },
      undefined,
    ],
    [
      "definition_create",
      { consentType: "marketing", title: " ", content: "C" },
      undefined,
    ],
    [
      "definition_create",
      { consentType: "marketing", title: "T", content: "C", version: "9" },
      undefined,
    ],
    ["definition_update", { version: "9" }, id],
    ["definition_update", {}, id],
    ["definition_publish", { version: "9" }, id],
    ["definition_delete", {}, "bad"],
  ] as const)
    assert.deepEqual(
      await service.execute(action, body, selector, actor),
      { ok: false, error: "CONSENT_INVALID_INPUT" },
      `${action} ${JSON.stringify(body)}`,
    );
  assert.equal(commands.length, 3);
});
