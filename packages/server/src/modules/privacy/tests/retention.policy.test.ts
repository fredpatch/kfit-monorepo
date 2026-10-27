import assert from "node:assert/strict";
import test from "node:test";
import { notificationSettingDefaults } from "@kfit/shared";
import {
  monthsBefore,
  RETENTION_EVIDENCE_EVENT_TYPES,
  retentionCutoffs,
  retentionSettingsOf,
} from "../services/retention.policy.js";

test("RET-01 R5: calendar months in Libreville time (UTC+1), day clamped to the shorter month, year wrap", () => {
  assert.equal(
    monthsBefore(new Date("2026-03-31T10:00:00.000Z"), 1).toISOString(),
    "2026-02-28T10:00:00.000Z",
  );
  assert.equal(
    monthsBefore(new Date("2026-01-15T00:30:00.000Z"), 3).toISOString(),
    "2025-10-15T00:30:00.000Z",
  );
  // 23:30 UTC on 31/03 is already 01/04 00:30 in Libreville: one month earlier is 01/03 00:30 there.
  assert.equal(
    monthsBefore(new Date("2026-03-31T23:30:00.000Z"), 1).toISOString(),
    "2026-02-28T23:30:00.000Z",
  );
});

test("RET-01 R1: cutoffs follow the registry defaults (30, 180, 395 days; 12 months)", () => {
  const now = new Date("2026-10-27T12:00:00.000Z");
  const settings = retentionSettingsOf(notificationSettingDefaults());
  assert.deepEqual(settings, {
    emailOutboxDays: 30,
    notificationsDays: 180,
    securityLogsDays: 395,
    prospectInactiveMonths: 12,
  });
  const cutoffs = retentionCutoffs(now, settings);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(cutoffs).map(([key, date]) => [key, date.toISOString()]),
    ),
    {
      outbox: "2026-09-27T12:00:00.000Z",
      notifications: "2026-04-30T12:00:00.000Z",
      securityLogs: "2025-09-27T12:00:00.000Z",
      prospects: "2025-10-27T12:00:00.000Z",
    },
  );
});

test("RET-01 R4: the evidence keep-list protects account creation and role changes", () => {
  for (const type of [
    "auth.bootstrap.created",
    "auth.user.created",
    "auth.user.role_changed",
    "auth.dev_demo.created",
    "ops.create_user",
    "ops.set_role",
  ])
    assert.ok(
      (RETENTION_EVIDENCE_EVENT_TYPES as readonly string[]).includes(type),
      type,
    );
});
