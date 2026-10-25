import assert from "node:assert/strict";
import test from "node:test";
import { isAppointmentToClose } from "./appointment-state.js";

const now = new Date("2026-10-25T10:00:00Z");
test("POL-01 D8: past scheduled or confirmed appointments are « à clôturer », nothing else", () => {
  assert.equal(isAppointmentToClose({ status: "confirmed", scheduledEnd: "2026-10-25T09:00:00Z" }, now), true);
  assert.equal(isAppointmentToClose({ status: "scheduled", scheduledEnd: "2026-10-25T10:00:00Z" }, now), true, "ended exactly now");
  assert.equal(isAppointmentToClose({ status: "confirmed", scheduledEnd: "2026-10-25T10:30:00Z" }, now), false, "still running");
  assert.equal(isAppointmentToClose({ status: "scheduled", scheduledEnd: "2026-10-26T09:00:00Z" }, now), false, "future");
  assert.equal(isAppointmentToClose({ status: "completed", scheduledEnd: "2026-10-24T09:00:00Z" }, now), false);
  assert.equal(isAppointmentToClose({ status: "reschedule_requested", scheduledEnd: "2026-10-24T09:00:00Z" }, now), false, "stays « Report demandé »");
});
