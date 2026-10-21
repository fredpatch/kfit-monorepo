import assert from "node:assert/strict";
import test from "node:test";
import { AppointmentsService, type AppointmentsRepository } from "../services/appointments.service.js";
import { appointmentTransitions, isLateCancellation, resolveAppointmentPolicy, validateAppointmentToken, appointmentTokenScope } from "../services/appointment.policy.js";
const id = "11111111-1111-1111-1111-111111111111", actor = { userId: id, requestId: id, ipAddress: null, userAgent: null };
const invalid: AppointmentsRepository = { async execute() { assert.fail("invalid input reached persistence"); }, async publicAccess(_token, _command, _actor, rejected) { assert.equal(rejected, true); return { ok: false, error: "APPOINTMENT_INVALID_INPUT" }; } };
test("appointment policy uses per-field fallback and preserves variant false", () => {
  const base = { variantId: null, lateCancelNoticeHours: 24, lateCancelConsumesComponent: true, missedConsumesComponent: true };
  const variant = { variantId: id, lateCancelNoticeHours: null, lateCancelConsumesComponent: false, missedConsumesComponent: false };
  assert.deepEqual(resolveAppointmentPolicy([base, variant], id), { lateCancelNoticeHours: 24, lateCancelConsumesComponent: false, missedConsumesComponent: false });
  assert.equal(resolveAppointmentPolicy([base, base], null), null);
  assert.equal(resolveAppointmentPolicy([{ ...base, lateCancelNoticeHours: -1 }], null), null);
});
test("null notice never penalizes and exact cancellation deadline is on time", () => {
  const start = new Date("2026-11-02T12:00:00Z"), deadline = new Date("2026-11-01T12:00:00Z");
  assert.equal(isLateCancellation(deadline, start, 24), false); assert.equal(isLateCancellation(new Date(deadline.getTime() + 1), start, 24), true);
  assert.equal(isLateCancellation(new Date(start.getTime() + 86400000), start, null), false);
  assert.equal(isLateCancellation(start, start, 0), false); assert.equal(isLateCancellation(new Date(start.getTime() + 1), start, 0), true);
});
test("terminal appointment statuses have no transitions", () => {
  for (const allowed of Object.values(appointmentTransitions)) for (const terminal of ["rescheduled", "completed", "cancelled", "missed"]) assert.ok(!allowed.includes(terminal));
});
test("appointment tokens enforce exact scope, hash-only lifecycle and expiry", () => {
  const token = { ...appointmentTokenScope, maxUses: 1, requiresOtp: false, useCount: 0, usedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 86400000) };
  assert.equal(validateAppointmentToken(token), null);
  assert.equal(validateAppointmentToken({ ...token, action: "onboarding_consent" }), "APPOINTMENT_TOKEN_INVALID");
  assert.equal(validateAppointmentToken({ ...token, revokedAt: new Date() }), "APPOINTMENT_TOKEN_REVOKED");
  assert.equal(validateAppointmentToken({ ...token, useCount: 1 }), "APPOINTMENT_TOKEN_CONSUMED");
  assert.equal(validateAppointmentToken({ ...token, expiresAt: new Date(0) }), "APPOINTMENT_TOKEN_EXPIRED");
});
for (const [action, body] of [
  ["schedule", { scheduledStart: "2026-02-30T10:00:00Z", scheduledEnd: "2026-03-01T10:00:00Z" }],
  ["schedule", { scheduledStart: "2026-11-01T10:00:00Z", scheduledEnd: "2026-11-01T09:00:00Z" }], ["cancel", { reason: " " }],
  ["complete", { earlyCompletionOverride: true }], ["complete", { earlyCompletionOverride: "true" }], ["confirm", { status: "completed" }], ["response-link", { expiresAt: "tomorrow" }],
] as const) test(`${action} rejects invalid fields (${JSON.stringify(body)})`, async () => {
  const result = await new AppointmentsService(invalid).admin(id, action, body, actor); assert.ok(!result.ok);
});
test("public malformed response is rejected through auditable access path", async () => {
  const service = new AppointmentsService(invalid);
  for (const input of [{ action: "complete" }, { action: "confirm", componentId: id }, { action: "decline", rescheduleNote: "private" }, { action: "request_reschedule", rescheduleNote: "x".repeat(501) }]) assert.ok(!(await service.publicAccess("synthetic", input, true, actor)).ok);
});
test("valid public note is trimmed and actor cannot become a coach", async () => {
  await new AppointmentsService({ ...invalid, async publicAccess(token, command, who) { assert.equal(token, "synthetic"); assert.deepEqual(command, { action: "request_reschedule", note: "Synthetic note" }); assert.equal(who.userId, null); return { ok: false, error: "APPOINTMENT_TOKEN_INVALID" }; } }).publicAccess("synthetic", { action: "request_reschedule", rescheduleNote: " Synthetic note " }, true, actor);
});
