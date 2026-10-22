import assert from "node:assert/strict";
import test from "node:test";
import { addBusinessDays, businessDateKey, businessDayStartFromKey, businessOffsetMs, startOfBusinessDay, startOfBusinessWeek } from "./business-time.js";

test("business time follows Africa/Libreville (UTC+1, no DST)", () => {
  assert.equal(businessOffsetMs(new Date("2026-10-22T10:00:00Z")), 3_600_000);
  assert.equal(businessOffsetMs(new Date("2026-06-22T10:00:00Z")), 3_600_000);
  // 23:30 UTC on the 21st is already the 22nd in Libreville.
  assert.equal(businessDateKey(new Date("2026-10-21T23:30:00Z")), "2026-10-22");
  assert.equal(startOfBusinessDay(new Date("2026-10-22T10:00:00Z")).toISOString(), "2026-10-21T23:00:00.000Z");
  assert.equal(businessDayStartFromKey("2026-10-22")?.toISOString(), "2026-10-21T23:00:00.000Z");
  assert.equal(businessDayStartFromKey("2026-02-30"), null);
  // Thursday 22 Oct 2026 → Monday 19 Oct 00:00 Libreville.
  assert.equal(startOfBusinessWeek(new Date("2026-10-22T10:00:00Z")).toISOString(), "2026-10-18T23:00:00.000Z");
  // Sunday 23:30 Libreville still belongs to the week of Monday 19.
  assert.equal(startOfBusinessWeek(new Date("2026-10-25T22:30:00Z")).toISOString(), "2026-10-18T23:00:00.000Z");
  assert.equal(addBusinessDays(startOfBusinessDay(new Date("2026-10-22T10:00:00Z")), 1).toISOString(), "2026-10-22T23:00:00.000Z");
});
