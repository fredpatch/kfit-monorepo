import assert from "node:assert/strict";
import test from "node:test";
import { appointmentActions, appointmentApiRoutes, appointmentErrorCodes, appointmentResponseActions, type PublicAppointmentDocument } from "./contracts.js";
test("appointment contracts expose named commands and independent public responses", () => {
  for (const action of appointmentActions) assert.equal(appointmentApiRoutes[action], `/admin/appointments/:appointmentId/${action}`);
  assert.equal(new Set(appointmentErrorCodes).size, appointmentErrorCodes.length);
  assert.deepEqual(appointmentResponseActions, ["confirm", "decline", "request_reschedule"]);
});
test("public appointment document contains only the approved safe facts", () => {
  const dto: PublicAppointmentDocument = { serviceLabel: "Synthetic service", scheduledStart: "2026-11-01T10:00:00Z", scheduledEnd: "2026-11-01T11:00:00Z", locationOrChannel: "Synthetic channel", availableActions: ["confirm"] };
  assert.deepEqual(Object.keys(dto).sort(), ["serviceLabel", "scheduledStart", "scheduledEnd", "locationOrChannel", "availableActions"].sort());
});
