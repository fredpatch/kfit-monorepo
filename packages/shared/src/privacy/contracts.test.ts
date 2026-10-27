import assert from "node:assert/strict";
import test from "node:test";
import {
  notificationSettingDefaults,
  operationalSettingRegistry,
  parseNotificationSettingsUpdate,
} from "../notifications/contracts.js";
import {
  parseAnonymizeSubjectInput,
  parseCreateRetentionHoldInput,
  parseRetentionHoldListQuery,
  parseUnarchiveSubjectInput,
  privacyApiRoutes,
  privacyErrorCodes,
  privacyPurgeDelayDaysKey,
  retentionEmailOutboxDaysKey,
  retentionNotificationsDaysKey,
  retentionProspectInactiveMonthsKey,
  retentionSecurityLogsDaysKey,
  retentionSettingKeys,
  subjectArchivedErrorCodes,
  unarchiveReasonLabels,
  unarchiveReasons,
} from "./contracts.js";

const id = "11111111-1111-4111-8111-111111111111";

test("widened settings registry holds the purge delay (1-365, default 30, D6) and the four RET-01 retention keys as privacy keys", () => {
  const privacyKeys = Object.entries(operationalSettingRegistry)
    .filter(([, d]) => d.sensitivity === "privacy")
    .map(([key]) => key);
  assert.deepEqual(privacyKeys, [
    privacyPurgeDelayDaysKey,
    ...retentionSettingKeys,
  ]);
  assert.equal(notificationSettingDefaults()[privacyPurgeDelayDaysKey], 30);
  assert.deepEqual(
    parseNotificationSettingsUpdate({
      settings: { [privacyPurgeDelayDaysKey]: 365 },
    }),
    { [privacyPurgeDelayDaysKey]: 365 },
  );
  for (const bad of [0, 366, 1.5, "30"])
    assert.equal(
      parseNotificationSettingsUpdate({
        settings: { [privacyPurgeDelayDaysKey]: bad },
      }),
      null,
    );
  assert.equal(
    parseNotificationSettingsUpdate({
      settings: { "privacy.retention.customer_archived_months": 12 },
    }),
    null,
    "no inert retention keys",
  );
});

test("RET-01 R1: retention defaults and ranges; an out-of-range update is refused", () => {
  const expected = {
    [retentionEmailOutboxDaysKey]: [30, 7, 365],
    [retentionNotificationsDaysKey]: [180, 30, 730],
    [retentionSecurityLogsDaysKey]: [395, 90, 1095],
    [retentionProspectInactiveMonthsKey]: [12, 3, 60],
  } as const;
  const defaults = notificationSettingDefaults();
  for (const [key, [value, min, max]] of Object.entries(expected)) {
    const definition = operationalSettingRegistry[key as keyof typeof expected];
    assert.deepEqual(
      [definition.type, defaults[key as keyof typeof expected]],
      ["integer", value],
      key,
    );
    assert.deepEqual(
      parseNotificationSettingsUpdate({ settings: { [key]: min } }),
      { [key]: min },
    );
    assert.deepEqual(
      parseNotificationSettingsUpdate({ settings: { [key]: max } }),
      { [key]: max },
    );
    for (const bad of [min - 1, max + 1, min + 0.5, String(value)])
      assert.equal(
        parseNotificationSettingsUpdate({ settings: { [key]: bad } }),
        null,
        `${key} ${bad}`,
      );
  }
});

test("anonymize input requires a non-blank confirmation name and nothing else", () => {
  assert.deepEqual(parseAnonymizeSubjectInput({ confirmName: "Awa Ndong" }), {
    confirmName: "Awa Ndong",
  });
  for (const bad of [
    null,
    {},
    { confirmName: "   " },
    { confirmName: 3 },
    { confirmName: "x".repeat(201) },
    { confirmName: "A", extra: 1 },
  ]) {
    assert.equal(parseAnonymizeSubjectInput(bad), null);
  }
});

test("hold input accepts the closed scopes and types only (D7) and trims the reason", () => {
  assert.deepEqual(
    parseCreateRetentionHoldInput({
      scopeType: "document",
      scopeId: id,
      holdType: "dispute",
      reason: "  litige en cours  ",
    }),
    {
      scopeType: "document",
      scopeId: id,
      holdType: "dispute",
      reason: "litige en cours",
    },
  );
  assert.equal(
    parseCreateRetentionHoldInput({
      scopeType: "subscription",
      scopeId: id,
      holdType: "legal",
      reason: "motif",
    }),
    null,
  );
  assert.equal(
    parseCreateRetentionHoldInput({
      scopeType: "customer",
      scopeId: id,
      holdType: "tax",
      reason: "motif",
    }),
    null,
  );
  assert.equal(
    parseCreateRetentionHoldInput({
      scopeType: "customer",
      scopeId: "not-a-uuid",
      holdType: "legal",
      reason: "motif",
    }),
    null,
  );
  assert.equal(
    parseCreateRetentionHoldInput({
      scopeType: "customer",
      scopeId: id,
      holdType: "legal",
      reason: "ab",
    }),
    null,
  );
  assert.deepEqual(
    parseRetentionHoldListQuery({ scopeType: "prospect", scopeId: id }),
    { scopeType: "prospect", scopeId: id },
  );
  assert.equal(parseRetentionHoldListQuery({ scopeType: "prospect" }), null);
});

test("ARCH-01 D6 unarchive accepts only a reason from the closed list; every reason has a French label", () => {
  for (const reason of unarchiveReasons)
    assert.deepEqual(parseUnarchiveSubjectInput({ reason }), { reason });
  for (const input of [
    null,
    [],
    {},
    { reason: "other" },
    { reason: "returning_customer", note: "x" },
    { reason: 1 },
  ])
    assert.equal(
      parseUnarchiveSubjectInput(input),
      null,
      JSON.stringify(input),
    );
  assert.deepEqual(
    Object.keys(unarchiveReasonLabels).sort(),
    [...unarchiveReasons].sort(),
  );
  assert.equal(unarchiveReasonLabels.returning_customer, "Client de retour");
  assert.deepEqual(
    [...subjectArchivedErrorCodes],
    ["CUSTOMER_ARCHIVED", "PROSPECT_ARCHIVED"],
  );
  assert.ok(privacyErrorCodes.includes("PRIVACY_SUBJECT_ANONYMIZED"));
  assert.equal(
    privacyApiRoutes.unarchiveCustomer,
    "/admin/customers/:customerId/unarchive",
  );
  assert.equal(
    privacyApiRoutes.unarchiveProspect,
    "/admin/prospects/:prospectId/unarchive",
  );
});
