import assert from "node:assert/strict";
import test from "node:test";
import { notificationSettingDefaults, operationalSettingRegistry, parseNotificationSettingsUpdate } from "../notifications/contracts.js";
import { parseAnonymizeSubjectInput, parseCreateRetentionHoldInput, parseRetentionHoldListQuery, privacyPurgeDelayDaysKey } from "./contracts.js";

const id = "11111111-1111-4111-8111-111111111111";

test("widened settings registry holds exactly one privacy key: purge delay 1–365, default 30 (D6)", () => {
  const privacyKeys = Object.entries(operationalSettingRegistry).filter(([, d]) => d.sensitivity === "privacy").map(([key]) => key);
  assert.deepEqual(privacyKeys, [privacyPurgeDelayDaysKey]);
  assert.equal(notificationSettingDefaults()[privacyPurgeDelayDaysKey], 30);
  assert.deepEqual(parseNotificationSettingsUpdate({ settings: { [privacyPurgeDelayDaysKey]: 365 } }), { [privacyPurgeDelayDaysKey]: 365 });
  for (const bad of [0, 366, 1.5, "30"]) assert.equal(parseNotificationSettingsUpdate({ settings: { [privacyPurgeDelayDaysKey]: bad } }), null);
  assert.equal(parseNotificationSettingsUpdate({ settings: { "privacy.retention.customer_archived_months": 12 } }), null, "no inert retention keys");
});

test("anonymize input requires a non-blank confirmation name and nothing else", () => {
  assert.deepEqual(parseAnonymizeSubjectInput({ confirmName: "Awa Ndong" }), { confirmName: "Awa Ndong" });
  for (const bad of [null, {}, { confirmName: "   " }, { confirmName: 3 }, { confirmName: "x".repeat(201) }, { confirmName: "A", extra: 1 }]) {
    assert.equal(parseAnonymizeSubjectInput(bad), null);
  }
});

test("hold input accepts the closed scopes and types only (D7) and trims the reason", () => {
  assert.deepEqual(parseCreateRetentionHoldInput({ scopeType: "document", scopeId: id, holdType: "dispute", reason: "  litige en cours  " }),
    { scopeType: "document", scopeId: id, holdType: "dispute", reason: "litige en cours" });
  assert.equal(parseCreateRetentionHoldInput({ scopeType: "subscription", scopeId: id, holdType: "legal", reason: "motif" }), null);
  assert.equal(parseCreateRetentionHoldInput({ scopeType: "customer", scopeId: id, holdType: "tax", reason: "motif" }), null);
  assert.equal(parseCreateRetentionHoldInput({ scopeType: "customer", scopeId: "not-a-uuid", holdType: "legal", reason: "motif" }), null);
  assert.equal(parseCreateRetentionHoldInput({ scopeType: "customer", scopeId: id, holdType: "legal", reason: "ab" }), null);
  assert.deepEqual(parseRetentionHoldListQuery({ scopeType: "prospect", scopeId: id }), { scopeType: "prospect", scopeId: id });
  assert.equal(parseRetentionHoldListQuery({ scopeType: "prospect" }), null);
});
