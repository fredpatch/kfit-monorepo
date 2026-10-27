import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ANONYMIZATION_PLAN,
  customerArchivable,
  prospectArchivable,
  PRIVACY_INVENTORY_NON_KEEP,
  PRIVACY_KEEP_COLUMNS,
  anonymizeDecision,
  confirmationMatches,
  customerArchiveRefusal,
  planFor,
  prospectArchiveRefusal,
  pseudonymFor,
  purgeAfter,
  whatsappPlaceholderFor,
} from "../services/privacy.policy.js";

const id = "8d6f1f0e-3a4b-4c5d-9e8f-0a1b2c3d4e5f";
const planned = new Set(
  ANONYMIZATION_PLAN.flatMap((step) =>
    Object.keys(step.columns).map((column) => `${step.table}.${column}`),
  ),
);

test("column plan covers every non-keep inventory row and touches no kept column", () => {
  for (const column of PRIVACY_INVENTORY_NON_KEEP)
    assert.ok(planned.has(column), `${column} missing from the plan`);
  for (const column of PRIVACY_KEEP_COLUMNS)
    assert.equal(planned.has(column), false, `${column} must be kept`);
  assert.equal(
    planned.size,
    PRIVACY_INVENTORY_NON_KEEP.length,
    "no column outside the approved inventory",
  );
});

test("prospect plan is the prospect part only; customer plan includes the source prospect (D8)", () => {
  const prospectTables = planFor("prospect").map((step) => step.table);
  assert.ok(
    !prospectTables.includes("customers") &&
      !prospectTables.includes("questionnaire_answers"),
  );
  assert.ok(
    prospectTables.includes("service_requests") &&
      prospectTables.includes("notifications"),
  );
  assert.ok(planFor("customer").some((step) => step.table === "prospects"));
});

test("pseudonym is deterministic, uppercase sha256 prefix, not the id itself (D2a)", () => {
  const expected = createHash("sha256")
    .update(id)
    .digest("hex")
    .slice(0, 4)
    .toUpperCase();
  assert.equal(pseudonymFor(id), `Client anonymisé · ${expected}`);
  assert.equal(pseudonymFor(id), pseudonymFor(id));
  assert.equal(
    pseudonymFor(id).includes(id.slice(0, 4)) &&
      expected !== id.slice(0, 4).toUpperCase(),
    false,
  );
  assert.equal(whatsappPlaceholderFor(id), `anon-${id}`);
});

test("confirmation compares trimmed, NFC, collapsed whitespace, case-sensitive (D9)", () => {
  assert.ok(confirmationMatches("  Awa   Ndong ", "Awa Ndong"));
  assert.ok(
    confirmationMatches("Adéla Obame", "Adéla Obame"),
    "NFD input matches NFC name",
  );
  assert.equal(confirmationMatches("awa ndong", "Awa Ndong"), false);
  assert.equal(confirmationMatches("Awa", "Awa Ndong"), false);
});

test("archive eligibility: customer only when every subscription is completed/cancelled; prospect only without open request (D1)", () => {
  assert.equal(customerArchiveRefusal({ exists: false }, []), "not_found");
  assert.equal(customerArchiveRefusal({ exists: true }, []), null);
  assert.equal(
    customerArchiveRefusal({ exists: true }, ["completed", "cancelled"]),
    null,
  );
  for (const status of [
    "active",
    "onboarding",
    "paused",
    "awaiting_payment",
    "medical_clearance_required",
    "ready_to_start",
    "completion_due",
  ]) {
    assert.equal(
      customerArchiveRefusal({ exists: true }, ["completed", status]),
      "has_active_subscription",
      status,
    );
  }
  assert.equal(
    prospectArchiveRefusal({ exists: true }, [
      "rejected",
      "converted",
      "abandoned",
      "closed_duplicate",
    ]),
    null,
  );
  for (const status of [
    "submitted",
    "contacting",
    "qualification_in_progress",
    "qualified",
    "qualified_with_conditions",
    "waitlisted",
  ]) {
    assert.equal(
      prospectArchiveRefusal({ exists: true }, [status]),
      "has_open_request",
      status,
    );
  }
});

test("anonymize decision: not found, already anonymized is idempotent, archived required, confirmation, holds win", () => {
  const archived = {
    archivedAt: new Date(),
    anonymizedAt: null,
    fullName: "Awa Ndong",
  };
  assert.deepEqual(
    anonymizeDecision({ subject: null, activeHoldCount: 0, confirmName: "x" }),
    { outcome: "refused", reason: "not_found" },
  );
  assert.deepEqual(
    anonymizeDecision({
      subject: {
        ...archived,
        anonymizedAt: new Date(),
        fullName: pseudonymFor(id),
      },
      activeHoldCount: 1,
      confirmName: "Awa Ndong",
    }),
    { outcome: "already_anonymized" },
  );
  assert.deepEqual(
    anonymizeDecision({
      subject: { ...archived, archivedAt: null },
      activeHoldCount: 0,
      confirmName: "Awa Ndong",
    }),
    { outcome: "refused", reason: "not_archived" },
  );
  assert.deepEqual(
    anonymizeDecision({
      subject: archived,
      activeHoldCount: 0,
      confirmName: "Awa N.",
    }),
    { outcome: "refused", reason: "confirmation_mismatch" },
  );
  assert.deepEqual(
    anonymizeDecision({
      subject: archived,
      activeHoldCount: 1,
      confirmName: "Awa Ndong",
    }),
    { outcome: "refused", reason: "hold_active" },
  );
  assert.deepEqual(
    anonymizeDecision({
      subject: archived,
      activeHoldCount: 0,
      confirmName: "Awa Ndong",
    }),
    { outcome: "proceed" },
  );
});

test("purge_after = anonymization time + delay days (D3c)", () => {
  assert.equal(
    purgeAfter(new Date("2026-10-25T10:00:00Z"), 30).toISOString(),
    "2026-11-24T10:00:00.000Z",
  );
});

test("S7.3b D1/D5: archivable flags mirror the archive refusal rules and are false once archived", () => {
  assert.equal(customerArchivable(null, []), true);
  assert.equal(customerArchivable(null, ["completed", "cancelled"]), true);
  assert.equal(customerArchivable(null, ["completed", "active"]), false);
  assert.equal(customerArchivable(new Date(), ["completed"]), false);
  assert.equal(prospectArchivable(null, ["rejected", "converted"]), true);
  assert.equal(prospectArchivable(null, ["rejected", "contacting"]), false);
  assert.equal(prospectArchivable(new Date(), ["rejected"]), false);
});
