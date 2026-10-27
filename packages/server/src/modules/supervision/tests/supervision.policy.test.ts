import assert from "node:assert/strict";
import test from "node:test";
import { supervisionAlertCodes, type SupervisionAlertCode, type SupervisionMode } from "@kfit/shared";
import {
  BACKUP_MAX_AGE_HOURS,
  RESTORE_CHECK_MAX_AGE_DAYS,
  SUPERVISED_JOBS,
  computeSupervisionAlerts,
  isFailing,
  nextRunAt,
  notificationSeverityFor,
  supervisedJobView,
  supervisionCandidates,
  supervisionResourceId,
  type JobRunFacts,
  type SupervisionState,
} from "../services/supervision.policy.js";

const now = new Date("2026-10-27T10:07:30Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const job = (key: string) => SUPERVISED_JOBS.find((j) => j.jobKey === key)!;
const healthyFacts = (minutesAgo: number): JobRunFacts => {
  const at = new Date(now.getTime() - minutesAgo * 60_000);
  return { lastRun: { status: "succeeded", startedAt: at, finishedAt: new Date(at.getTime() + 1200), attempt: 1, errorCode: null }, lastSucceededAt: at, runs30d: 100, failed30d: 2, recentFinished: ["succeeded", "succeeded"] };
};

function healthy(): SupervisionState {
  return {
    jobs: [
      supervisedJobView(job("notifications.reconcile"), healthyFacts(7), now),
      supervisedJobView(job("notifications.email-delivery"), healthyFacts(2), now),
      supervisedJobView(job("privacy.purge"), healthyFacts(7 * 60), now),
    ],
    backup: { lastSucceededAt: hoursAgo(3), ageHours: 3, bytes: 10, durationMs: 1000, secondaryVerified: true, rotation: { kept: 7, deleted: 0 }, lastFailed: null },
    restoreCheck: { at: hoursAgo(48), status: "succeeded", tablesMatched: 40, filesMatched: 3, replayEvents: 0, errorCode: null },
    privacy: { journal: { configured: true, writable: true }, lastPurge: { at: hoursAgo(7), status: "succeeded", filesDeleted: 0 }, lastReplay: null, activeHolds: 0, purgesDue7d: 0, anonymizedTotal: 0 },
    runtime: { nodeVersion: "v24.22.1", floor: { ok: true, failures: [] }, mode: "production", guards: { ok: true, failures: [], checkedAt: now.toISOString() } },
  };
}
const codes = (state: SupervisionState, mode: SupervisionMode = "production") => computeSupervisionAlerts(state, now, mode).map((a) => a.code);

test("OPS-01 O3: nextRunAt for every N minutes and daily 03:00 Africa/Libreville (UTC+1, no DST), across midnight", () => {
  assert.equal(nextRunAt("*/5 * * * *", null, now)?.toISOString(), "2026-10-27T10:10:00.000Z");
  assert.equal(nextRunAt("*/15 * * * *", null, now)?.toISOString(), "2026-10-27T10:15:00.000Z");
  assert.equal(nextRunAt("*/15 * * * *", null, new Date("2026-10-27T23:59:00Z"))?.toISOString(), "2026-10-28T00:00:00.000Z");
  assert.equal(nextRunAt("*/5 * * * *", null, new Date("2026-10-27T10:10:00Z"))?.toISOString(), "2026-10-27T10:15:00.000Z", "a run exactly now is not « next »");
  assert.equal(nextRunAt("0 3 * * *", "Africa/Libreville", now)?.toISOString(), "2026-10-28T02:00:00.000Z");
  assert.equal(nextRunAt("0 3 * * *", "Africa/Libreville", new Date("2026-10-27T01:30:00Z"))?.toISOString(), "2026-10-27T02:00:00.000Z", "02:30 Libreville: today at 03:00");
  assert.equal(nextRunAt("0 3 * * *", "Africa/Libreville", new Date("2026-10-27T23:30:00Z"))?.toISOString(), "2026-10-28T02:00:00.000Z", "00:30 Libreville next day");
  assert.equal(nextRunAt("0 3 * * *", "Africa/Libreville", new Date("2026-12-31T23:30:00Z"))?.toISOString(), "2027-01-01T02:00:00.000Z", "across the year");
  for (const unsupported of ["0 3 * * 1", "*/7 * * * *", "nonsense", "15 */2 * * *"]) assert.equal(nextRunAt(unsupported, null, now), null, unsupported);
  for (const supervised of SUPERVISED_JOBS) assert.ok(nextRunAt(supervised.cron, supervised.timezone, now), supervised.jobKey);
});

test("OPS-01 O3: late, never_run, failing and failure rate", () => {
  const reconcile = job("notifications.reconcile");
  const late = supervisedJobView(reconcile, healthyFacts(31), now);
  assert.equal(late.late, true);
  assert.equal(late.state, "late");
  assert.equal(supervisedJobView(reconcile, healthyFacts(29), now).late, false, "2 × 15 min not yet exceeded");
  const never = supervisedJobView(reconcile, { lastRun: null, lastSucceededAt: null, runs30d: 0, failed30d: 0, recentFinished: [] }, now);
  assert.deepEqual([never.state, never.failureRate30d, never.late], ["never_run", null, false]);
  assert.equal(supervisedJobView(reconcile, healthyFacts(7), now).failureRate30d, 0.02);

  assert.equal(isFailing(["failed", "failed", "failed", "succeeded"]), true, "3 consecutive");
  assert.equal(isFailing(["failed", "succeeded", "failed", "succeeded"]), true, "50 % of the last runs");
  assert.equal(isFailing(["failed", "succeeded", "succeeded"]), false);
  assert.equal(isFailing([...Array(10).fill("succeeded"), "failed", "failed", "failed"]), false, "only the last 10 count");
  assert.equal(isFailing([]), false);
});

test("OPS-01 O9: a healthy state raises nothing, in production and development", () => {
  assert.deepEqual(codes(healthy()), []);
  assert.deepEqual(codes(healthy(), "development"), []);
});

test("OPS-01 O5–O9: every alert code is raised alone by its own condition", () => {
  const cases: Record<SupervisionAlertCode, (state: SupervisionState) => void> = {
    BACKUP_STALE: (s) => { s.backup.lastSucceededAt = hoursAgo(BACKUP_MAX_AGE_HOURS + 1); },
    BACKUP_FAILED: (s) => { s.backup.lastFailed = { at: hoursAgo(1), errorCode: "SECONDARY_COPY_FAILED" }; },
    RESTORE_CHECK_STALE: (s) => { s.restoreCheck = { ...s.restoreCheck!, at: hoursAgo(RESTORE_CHECK_MAX_AGE_DAYS * 24 + 1) }; },
    RESTORE_CHECK_FAILED: (s) => { s.restoreCheck = { ...s.restoreCheck!, status: "failed", errorCode: "DRILL_MISMATCH" }; },
    PRIVACY_JOURNAL_UNAVAILABLE: (s) => { s.privacy.journal.writable = false; },
    PURGE_FAILED: (s) => { s.privacy.lastPurge = { at: hoursAgo(7), status: "failed", filesDeleted: null }; },
    SECURITY_FLOOR_NOT_MET: (s) => { s.runtime.floor = { ok: false, failures: ["CVE-X:below_minimum"] }; },
    JOB_FAILING: (s) => { s.jobs[1] = supervisedJobView(job("notifications.email-delivery"), { ...healthyFacts(2), recentFinished: ["failed", "failed", "failed"] }, now); },
    JOB_LATE: (s) => { s.jobs[0] = supervisedJobView(job("notifications.reconcile"), healthyFacts(45), now); },
    JOB_NEVER_RUN: (s) => { s.jobs[2] = supervisedJobView(job("privacy.purge"), { lastRun: null, lastSucceededAt: null, runs30d: 0, failed30d: 0, recentFinished: [] }, now); },
  };
  assert.deepEqual(Object.keys(cases).sort(), [...supervisionAlertCodes].sort());
  for (const code of supervisionAlertCodes) {
    const state = healthy();
    cases[code](state);
    assert.deepEqual(codes(state), [code], code);
  }
  const old = healthy();
  old.backup.lastFailed = { at: hoursAgo(10), errorCode: "X" };
  assert.deepEqual(codes(old), [], "a failure older than the last success is history");
});

test("OPS-01 O3/O5/O6: development tolerates never-run jobs, no backup and no restore check; production does not", () => {
  const empty = healthy();
  empty.backup = { lastSucceededAt: null, ageHours: null, bytes: null, durationMs: null, secondaryVerified: false, rotation: null, lastFailed: null };
  empty.restoreCheck = null;
  empty.privacy.journal = { configured: false, writable: false };
  empty.jobs = empty.jobs.map((j) => ({ ...j, state: "never_run", lastRun: null, lastSucceededAt: null, late: false }));
  assert.deepEqual(codes(empty, "development"), []);
  assert.deepEqual(codes(empty, "production").sort(), ["BACKUP_STALE", "JOB_NEVER_RUN", "JOB_NEVER_RUN", "JOB_NEVER_RUN", "PRIVACY_JOURNAL_UNAVAILABLE", "RESTORE_CHECK_STALE"]);
});

test("OPS-01 O9: critical first; notifications store warning only, with a stable uuid and dedupe key", () => {
  const state = healthy();
  state.jobs[0] = supervisedJobView(job("notifications.reconcile"), healthyFacts(45), now);
  state.runtime.floor = { ok: false, failures: ["x"] };
  const alerts = computeSupervisionAlerts(state, now, "production");
  assert.deepEqual(alerts.map((a) => [a.code, a.severity]), [["SECURITY_FLOOR_NOT_MET", "critical"], ["JOB_LATE", "warning"]]);
  assert.equal(notificationSeverityFor("critical"), "warning");
  assert.equal(notificationSeverityFor("warning"), "warning");

  const candidates = supervisionCandidates(alerts);
  assert.deepEqual(candidates.map((c) => c.dedupeKey), ["supervision:SECURITY_FLOOR_NOT_MET", "supervision:JOB_LATE:notifications.reconcile"]);
  for (const candidate of candidates) {
    assert.match(candidate.resourceId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.deepEqual([candidate.kind, candidate.severity, candidate.resourceType, candidate.deepLink, candidate.customerId], ["supervision_alert", "warning", "supervision", "/admin/supervision", null]);
  }
  assert.equal(supervisionResourceId("supervision:BACKUP_STALE"), supervisionResourceId("supervision:BACKUP_STALE"));
  assert.notEqual(supervisionResourceId("supervision:BACKUP_STALE"), supervisionResourceId("supervision:BACKUP_FAILED"));
});
