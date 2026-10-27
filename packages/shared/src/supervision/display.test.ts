import assert from "node:assert/strict";
import test from "node:test";
import type { SupervisionOverviewResponse } from "./contracts.js";
import {
  blockSeverity,
  formatAge,
  formatBytes,
  formatDuration,
  formatRate,
  inactiveProspectLine,
  intervalLabel,
  jobRows,
  jobStateDisplay,
  manualRunText,
  onTimeCount,
  purgeSimulationText,
  securityColumns,
  securityTotal,
  statusDotTone,
} from "./display.js";

const overview = (
  patch: Partial<SupervisionOverviewResponse> = {},
): SupervisionOverviewResponse => ({
  generatedAt: "2026-10-27T10:00:00.000Z",
  alerts: [],
  jobs: [
    {
      jobKey: "notifications.reconcile",
      label: "Notifications : mise à jour",
      cron: "*/15 * * * *",
      timezone: null,
      manual: "run",
      state: "ok",
      lastRun: {
        status: "succeeded",
        startedAt: "2026-10-27T09:45:00.000Z",
        durationMs: 120,
        attempt: 1,
        errorCode: null,
      },
      lastSucceededAt: "2026-10-27T09:45:00.000Z",
      nextRunAt: "2026-10-27T10:00:00.000Z",
      failureRate30d: 0.04,
      late: false,
    },
  ],
  backup: {
    lastSucceededAt: "2026-10-26T02:00:00.000Z",
    ageHours: 32,
    bytes: 4_823_449,
    durationMs: 9000,
    secondaryVerified: true,
    rotation: null,
    lastFailed: null,
  },
  restoreCheck: {
    at: "2026-10-24T03:00:00.000Z",
    status: "succeeded",
    tablesMatched: 42,
    filesMatched: 3,
    replayEvents: 0,
    errorCode: null,
  },
  privacy: {
    journal: { configured: true, writable: true },
    lastPurge: null,
    lastReplay: null,
    activeHolds: 0,
    purgesDue7d: 0,
    anonymizedTotal: 0,
    inactiveProspects: { count: 0, months: 12, items: [] },
  },
  runtime: {
    nodeVersion: "v24.22.1",
    floor: { ok: true, failures: [] },
    mode: "development",
    guards: null,
  },
  ...patch,
});

test("OPS-01b S1: job state labels and tones", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(jobStateDisplay).map(([state, d]) => [
        state,
        `${d.label}/${d.tone}`,
      ]),
    ),
    {
      ok: "Réussi/success",
      late: "En retard/warning",
      failing: "En échec/danger",
      never_run: "Jamais exécuté/neutral",
      running: "En cours/info",
    },
  );
});

test("OPS-01b S1: ages, sizes, durations, rates and intervals in French, « - » when empty", () => {
  assert.deepEqual(
    [formatAge(0.4), formatAge(31.9), formatAge(80), formatAge(null)],
    ["il y a moins d'une heure", "il y a 31 h", "il y a 3 j", "-"],
  );
  assert.deepEqual(
    [
      formatBytes(512),
      formatBytes(4_823_449),
      formatBytes(2048),
      formatBytes(null),
    ],
    ["512 o", "4,6 Mo", "2 Ko", "-"],
  );
  assert.deepEqual(
    [
      formatDuration(850),
      formatDuration(12_340),
      formatDuration(240_000),
      formatDuration(null),
    ],
    ["850 ms", "12,3 s", "4 min", "-"],
  );
  assert.deepEqual([formatRate(0.04), formatRate(null)], ["4 %", "-"]);
  assert.deepEqual(
    [
      intervalLabel("*/15 * * * *"),
      intervalLabel("0 3 * * *"),
      intervalLabel("5 4 * * 1"),
    ],
    ["Toutes les 15 min", "Tous les jours à 03:00", "5 4 * * 1"],
  );
});

test("OPS-01b S1/S3: a tile follows its own block's alerts (critical wins); the menu dot follows the status level", () => {
  const alerts = [
    { code: "BACKUP_STALE", severity: "critical", message: "x" },
    { code: "JOB_LATE", severity: "warning", jobKey: "a", message: "x" },
    { code: "JOB_FAILING", severity: "warning", jobKey: "b", message: "x" },
  ] as const;
  assert.equal(blockSeverity([...alerts], "backup"), "critical");
  assert.equal(blockSeverity([...alerts], "jobs"), "warning");
  assert.equal(blockSeverity([...alerts], "floor"), null);
  assert.equal(
    blockSeverity(
      [{ code: "PROSPECTS_INACTIVE", severity: "warning", message: "x" }],
      "privacy",
    ),
    "warning",
  );
  // Libreville is UTC+1: 23:30 UTC on 31/12 is already 01/01 there.
  assert.equal(
    inactiveProspectLine({
      reference: "DEM-2025-0042",
      lastRequestAt: "2025-12-31T23:30:00.000Z",
    }),
    "DEM-2025-0042 · dernière demande le 01/01/2026",
  );
  assert.deepEqual(
    [
      statusDotTone({ level: "critical", alertCount: 2 }),
      statusDotTone({ level: "warning", alertCount: 1 }),
      statusDotTone({ level: "ok", alertCount: 0 }),
      statusDotTone(null),
    ],
    ["danger", "warning", null, null],
  );
});

test("OPS-01b S1: job rows add backup and restore check, their state read from the open alerts", () => {
  const healthy = jobRows(overview());
  assert.deepEqual(
    healthy.map((r) => [r.key, r.state, r.action]),
    [
      ["notifications.reconcile", "ok", "run"],
      ["ops.backup", "ok", null],
      ["ops.restore_drill", "ok", null],
    ],
  );
  assert.equal(healthy[0]!.interval, "Toutes les 15 min");
  assert.equal(onTimeCount(healthy), 3);

  const failing = jobRows(
    overview({
      alerts: [
        { code: "BACKUP_FAILED", severity: "critical", message: "x" },
        { code: "RESTORE_CHECK_STALE", severity: "warning", message: "x" },
      ],
      backup: {
        lastSucceededAt: "2026-10-26T02:00:00.000Z",
        ageHours: 32,
        bytes: 1,
        durationMs: 1,
        secondaryVerified: true,
        rotation: null,
        lastFailed: {
          at: "2026-10-27T02:00:00.000Z",
          errorCode: "DUMP_FAILED",
        },
      },
    }),
  );
  assert.deepEqual(
    failing.slice(1).map((r) => [r.state, r.lastRunAt]),
    [
      ["failing", "2026-10-27T02:00:00.000Z"],
      ["late", "2026-10-24T03:00:00.000Z"],
    ],
  );
  assert.equal(onTimeCount(failing), 1);

  const empty = jobRows(
    overview({
      backup: {
        lastSucceededAt: null,
        ageHours: null,
        bytes: null,
        durationMs: null,
        secondaryVerified: false,
        rotation: null,
        lastFailed: null,
      },
      restoreCheck: null,
    }),
  );
  assert.deepEqual(
    empty.slice(1).map((r) => r.state),
    ["never_run", "never_run"],
  );
});

test("OPS-01b S1/S2: security columns per day, simulation and manual run sentences", () => {
  const columns = securityColumns({
    days: [
      {
        date: "2026-10-26",
        series: {
          loginRejected: 2,
          otpFailed: 1,
          otpLocked: 0,
          bootstrapRejected: 1,
          rateLimited: { auth_login: 3, supervision_run: 1 },
          encodingRejected: 0,
          publicLinkInvalid: 2,
        },
      },
      {
        date: "2026-10-27",
        series: {
          loginRejected: 0,
          otpFailed: 0,
          otpLocked: 0,
          bootstrapRejected: 0,
          rateLimited: {},
          encodingRejected: 0,
          publicLinkInvalid: 0,
        },
      },
    ],
  });
  assert.deepEqual(columns[0], {
    date: "26/10",
    loginRejected: 3,
    otpFailed: 1,
    otpLocked: 0,
    rateLimited: 4,
    encodingRejected: 0,
    publicLinkInvalid: 2,
  });
  assert.equal(securityTotal(columns), 10);
  assert.equal(securityTotal(columns.slice(1)), 0);
  assert.deepEqual(
    purgeSimulationText({
      subjectsDue: 2,
      filesDue: 5,
      bytesDue: 4_823_449,
      heldBack: 1,
      outboxToRedact: 3,
      notificationsToDelete: 4,
      auditEventsToDelete: 5,
      accessEventsToDelete: 6,
    }),
    [
      "Personnes dont les fichiers seraient supprimés : 2 · Fichiers : 5 · Taille : 4,6 Mo · Retenus par un blocage : 1",
      "E-mails à purger : 3 · Notifications à supprimer : 4 · Journaux de sécurité à supprimer : 11",
    ],
  );
  assert.equal(
    manualRunText({ outcome: "succeeded", durationMs: 1200, errorCode: null }),
    "Job lancé : réussi en 1,2 s.",
  );
  assert.equal(
    manualRunText({
      outcome: "failed",
      durationMs: 10,
      errorCode: "SMTP_DOWN",
    }),
    "Job lancé : en échec (SMTP_DOWN).",
  );
});
