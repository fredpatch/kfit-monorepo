/*
 * OPS-01 « Supervision » (Gate 1 approved 2026-10-27): admin-only operational health. Counts, dates and codes only:
 * never an IP, an e-mail, a customer name, a file name or a journal subject id.
 */

export const supervisionApiRoutes = {
  overview: "/admin/supervision/overview",
  status: "/admin/supervision/status",
  security: "/admin/supervision/security",
  runJob: "/admin/supervision/jobs/:jobKey/run",
  simulatePurge: "/admin/supervision/jobs/privacy.purge/simulate",
} as const;

export const supervisionErrorCodes = [
  "SUPERVISION_ADMIN_FORBIDDEN",
  "SUPERVISION_INVALID_INPUT",
  "SUPERVISION_JOB_NOT_RUNNABLE",
  "SUPERVISION_JOB_BUSY",
  "SUPERVISION_RATE_LIMITED",
  "SUPERVISION_ROUTE_UNEXPECTED_FAILURE",
] as const;
export type SupervisionErrorCode = (typeof supervisionErrorCodes)[number];

/** O9: closed alert vocabulary (codes English, messages French). */
export const supervisionAlertCodes = [
  "BACKUP_STALE",
  "BACKUP_FAILED",
  "RESTORE_CHECK_STALE",
  "RESTORE_CHECK_FAILED",
  "PRIVACY_JOURNAL_UNAVAILABLE",
  "PURGE_FAILED",
  "SECURITY_FLOOR_NOT_MET",
  "JOB_FAILING",
  "JOB_LATE",
  "JOB_NEVER_RUN",
] as const;
export type SupervisionAlertCode = (typeof supervisionAlertCodes)[number];
export type SupervisionAlertSeverity = "critical" | "warning";
export type SupervisionAlert = { code: SupervisionAlertCode; severity: SupervisionAlertSeverity; jobKey?: string; message: string };

export type SupervisionMode = "development" | "production";
export type SupervisionJobState = "ok" | "late" | "failing" | "never_run" | "running";
export type SupervisionManualAction = "run" | "simulate" | null;

export type SupervisionJob = {
  jobKey: string;
  label: string;
  cron: string;
  timezone: string | null;
  manual: SupervisionManualAction;
  state: SupervisionJobState;
  lastRun: { status: "running" | "succeeded" | "failed"; startedAt: string; durationMs: number | null; attempt: number; errorCode: string | null } | null;
  lastSucceededAt: string | null;
  nextRunAt: string | null;
  /** Failed runs / runs over 30 days; null without runs. */
  failureRate30d: number | null;
  late: boolean;
};

export type SupervisionBackup = {
  lastSucceededAt: string | null;
  ageHours: number | null;
  bytes: number | null;
  durationMs: number | null;
  secondaryVerified: boolean;
  rotation: { kept: number; deleted: number } | null;
  lastFailed: { at: string; errorCode: string | null } | null;
};

export type SupervisionRestoreCheck = {
  at: string;
  status: "running" | "succeeded" | "failed";
  tablesMatched: number | null;
  filesMatched: number | null;
  replayEvents: number | null;
  errorCode: string | null;
} | null;

export type SupervisionPrivacy = {
  journal: { configured: boolean; writable: boolean };
  lastPurge: { at: string; status: "running" | "succeeded" | "failed"; filesDeleted: number | null } | null;
  lastReplay: { at: string; events: number | null } | null;
  activeHolds: number;
  purgesDue7d: number;
  anonymizedTotal: number;
};

export type SupervisionRuntime = {
  nodeVersion: string;
  floor: { ok: boolean; failures: string[] };
  mode: SupervisionMode;
  /** Production only: guard codes that currently fail (empty = all pass). */
  guards: { ok: boolean; failures: string[]; checkedAt: string } | null;
};

export type SupervisionOverviewResponse = {
  generatedAt: string;
  alerts: SupervisionAlert[];
  jobs: SupervisionJob[];
  backup: SupervisionBackup;
  restoreCheck: SupervisionRestoreCheck;
  privacy: SupervisionPrivacy;
  runtime: SupervisionRuntime;
};

/** O9: for the menu dot, from the admin's own open supervision notifications (cheap). */
export type SupervisionStatusResponse = { level: "ok" | "warning" | "critical"; alertCount: number };

export const supervisionSecurityPeriods = [7, 30] as const;
export type SupervisionSecurityPeriod = (typeof supervisionSecurityPeriods)[number];
export type SupervisionSecuritySeries = {
  loginRejected: number;
  otpFailed: number;
  otpLocked: number;
  bootstrapRejected: number;
  rateLimited: Record<string, number>;
  encodingRejected: number;
  publicLinkInvalid: number;
};
export type SupervisionSecurityResponse = { days: Array<{ date: string; series: SupervisionSecuritySeries }> };

export type SupervisionJobRunResponse = { jobKey: string; outcome: "succeeded" | "failed"; durationMs: number; result: Record<string, number> | null; errorCode: string | null };
export type SupervisionPurgeSimulationResponse = { subjectsDue: number; filesDue: number; bytesDue: number; heldBack: number };
