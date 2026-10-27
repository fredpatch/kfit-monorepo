import { businessDateKey } from "../time/business-time.js";
import type {
  SupervisionAlert,
  SupervisionAlertCode,
  SupervisionAlertSeverity,
  SupervisionJobState,
  SupervisionManualAction,
  SupervisionOverviewResponse,
  SupervisionPurgeSimulationResponse,
  SupervisionSecurityResponse,
  SupervisionStatusResponse,
} from "./contracts.js";

/* OPS-01b: pure wording for the « Supervision » page (French, tutoiement, « - » for an empty value). */

export const EMPTY_VALUE = "-";

export type SupervisionTone =
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "neutral";

export const jobStateDisplay: Record<
  SupervisionJobState,
  { label: string; tone: SupervisionTone }
> = {
  ok: { label: "Réussi", tone: "success" },
  late: { label: "En retard", tone: "warning" },
  failing: { label: "En échec", tone: "danger" },
  never_run: { label: "Jamais exécuté", tone: "neutral" },
  running: { label: "En cours", tone: "info" },
};

export const severityTone: Record<SupervisionAlertSeverity, SupervisionTone> = {
  critical: "danger",
  warning: "warning",
};

/** S3: the menu dot; nothing when every alert is closed. */
export function statusDotTone(
  status: SupervisionStatusResponse | null | undefined,
): "warning" | "danger" | null {
  if (!status || status.level === "ok") return null;
  return status.level === "critical" ? "danger" : "warning";
}

const decimal = (value: number) =>
  value.toFixed(1).replace(/\.0$/, "").replace(".", ",");

/** « il y a 31 h », « il y a 3 j »; « - » without a date. */
export function formatAge(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return EMPTY_VALUE;
  if (hours < 1) return "il y a moins d'une heure";
  if (hours < 48) return `il y a ${Math.floor(hours)} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

export function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.max(0, (now.getTime() - new Date(iso).getTime()) / 3_600_000);
}

/** « 4,6 Mo » (base 1024). */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return EMPTY_VALUE;
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let value = bytes,
    unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : decimal(value)} ${units[unit]}`;
}

/** « 850 ms », « 12,3 s », « 4 min ». */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return EMPTY_VALUE;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${decimal(ms / 1000)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

export function formatRate(rate: number | null): string {
  return rate === null ? EMPTY_VALUE : `${Math.round(rate * 100)} %`;
}

/** The two cron shapes the API schedules (O3): every N minutes, or once a day at H:M. */
export function intervalLabel(cron: string): string {
  const every = /^\*\/(\d+) \* \* \* \*$/.exec(cron);
  if (every) return `Toutes les ${every[1]} min`;
  const daily = /^(\d+) (\d+) \* \* \*$/.exec(cron);
  if (daily)
    return `Tous les jours à ${daily[2]!.padStart(2, "0")}:${daily[1]!.padStart(2, "0")}`;
  return cron;
}

export type SupervisionBlock =
  | "jobs"
  | "backup"
  | "restore"
  | "floor"
  | "privacy";

const alertBlock: Record<SupervisionAlertCode, SupervisionBlock> = {
  BACKUP_STALE: "backup",
  BACKUP_FAILED: "backup",
  RESTORE_CHECK_STALE: "restore",
  RESTORE_CHECK_FAILED: "restore",
  PRIVACY_JOURNAL_UNAVAILABLE: "privacy",
  PURGE_FAILED: "privacy",
  SECURITY_FLOOR_NOT_MET: "floor",
  JOB_FAILING: "jobs",
  JOB_LATE: "jobs",
  JOB_NEVER_RUN: "jobs",
  PROSPECTS_INACTIVE: "privacy",
};

/** S1: a tile turns warning or danger only when its own block has an open alert (critical wins). */
export function blockSeverity(
  alerts: SupervisionAlert[],
  block: SupervisionBlock,
): SupervisionAlertSeverity | null {
  const mine = alerts.filter((alert) => alertBlock[alert.code] === block);
  if (mine.some((alert) => alert.severity === "critical")) return "critical";
  return mine.length ? "warning" : null;
}

export type SupervisionJobRow = {
  key: string;
  label: string;
  interval: string;
  failureRate30d: number | null;
  state: SupervisionJobState;
  lastRunAt: string | null;
  durationMs: number | null;
  nextRunAt: string | null;
  action: SupervisionManualAction;
};

const latest = (...dates: Array<string | null | undefined>) =>
  dates
    .filter((date): date is string => !!date)
    .sort()
    .at(-1) ?? null;

/**
 * S1 « Jobs planifiés »: the API jobs, then the two ops scripts (host timer, read-only here). Their state comes from the
 * open alerts, so the page never repeats the server's thresholds.
 */
export function jobRows(
  overview: SupervisionOverviewResponse,
): SupervisionJobRow[] {
  const has = (code: SupervisionAlertCode) =>
    overview.alerts.some((alert) => alert.code === code);
  const { backup, restoreCheck } = overview;
  const backupState: SupervisionJobState = has("BACKUP_FAILED")
    ? "failing"
    : !backup.lastSucceededAt
      ? "never_run"
      : has("BACKUP_STALE")
        ? "late"
        : "ok";
  const restoreState: SupervisionJobState = !restoreCheck
    ? "never_run"
    : restoreCheck.status === "running"
      ? "running"
      : has("RESTORE_CHECK_FAILED") || restoreCheck.status === "failed"
        ? "failing"
        : has("RESTORE_CHECK_STALE")
          ? "late"
          : "ok";
  return [
    ...overview.jobs.map((job) => ({
      key: job.jobKey,
      label: job.label,
      interval: intervalLabel(job.cron),
      failureRate30d: job.failureRate30d,
      state: job.state,
      lastRunAt: job.lastRun?.startedAt ?? null,
      durationMs: job.lastRun?.durationMs ?? null,
      nextRunAt: job.nextRunAt,
      action: job.manual,
    })),
    {
      key: "ops.backup",
      label: "Sauvegarde",
      interval: "Tous les jours (timer du serveur)",
      failureRate30d: null,
      state: backupState,
      lastRunAt: latest(backup.lastSucceededAt, backup.lastFailed?.at),
      durationMs: backup.durationMs,
      nextRunAt: null,
      action: null,
    },
    {
      key: "ops.restore_drill",
      label: "Contrôle de restauration",
      interval: "Chaque semaine (recommandé)",
      failureRate30d: null,
      state: restoreState,
      lastRunAt: restoreCheck?.at ?? null,
      durationMs: null,
      nextRunAt: null,
      action: null,
    },
  ];
}

/** « Jobs » tile: rows neither late, failing nor never run. */
export function onTimeCount(rows: SupervisionJobRow[]): number {
  return rows.filter((row) => row.state === "ok" || row.state === "running")
    .length;
}

export type SecurityColumn = {
  date: string;
  loginRejected: number;
  otpFailed: number;
  otpLocked: number;
  rateLimited: number;
  encodingRejected: number;
  publicLinkInvalid: number;
};

/** S1 « Sécurité »: one column per Libreville day; refused bootstraps count as refused logins. */
export function securityColumns(
  response: SupervisionSecurityResponse,
): SecurityColumn[] {
  return response.days.map(({ date, series }) => ({
    date: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
    loginRejected: series.loginRejected + series.bootstrapRejected,
    otpFailed: series.otpFailed,
    otpLocked: series.otpLocked,
    rateLimited: Object.values(series.rateLimited).reduce(
      (sum, n) => sum + n,
      0,
    ),
    encodingRejected: series.encodingRejected,
    publicLinkInvalid: series.publicLinkInvalid,
  }));
}

export function securityTotal(columns: SecurityColumn[]): number {
  return columns.reduce(
    (sum, c) =>
      sum +
      c.loginRejected +
      c.otpFailed +
      c.otpLocked +
      c.rateLimited +
      c.encodingRejected +
      c.publicLinkInvalid,
    0,
  );
}

/** S2 « Simuler »: counts only, sizes in Mo; RET-01 R7 adds the retention line (audit and access events summed). */
export function purgeSimulationText(
  simulation: SupervisionPurgeSimulationResponse,
): string[] {
  const files = [
    `Personnes dont les fichiers seraient supprimés : ${simulation.subjectsDue}`,
    `Fichiers : ${simulation.filesDue}`,
    `Taille : ${decimal(simulation.bytesDue / 1024 / 1024)} Mo`,
    `Retenus par un blocage : ${simulation.heldBack}`,
  ].join(" · ");
  const retention = [
    `E-mails à purger : ${simulation.outboxToRedact}`,
    `Notifications à supprimer : ${simulation.notificationsToDelete}`,
    `Journaux de sécurité à supprimer : ${simulation.auditEventsToDelete + simulation.accessEventsToDelete}`,
  ].join(" · ");
  return [files, retention];
}

/** S2 toast after « Lancer maintenant ». */
export function manualRunText(run: {
  outcome: "succeeded" | "failed";
  durationMs: number;
  errorCode: string | null;
}): string {
  return run.outcome === "succeeded"
    ? `Job lancé : réussi en ${formatDuration(run.durationMs)}.`
    : `Job lancé : en échec (${run.errorCode ?? "erreur inconnue"}).`;
}

/** RET-01 R5: request reference and Libreville date only, never a name, phone or e-mail. */
export function inactiveProspectLine(item: {
  reference: string;
  lastRequestAt: string;
}): string {
  const day = businessDateKey(new Date(item.lastRequestAt))
    .split("-")
    .reverse()
    .join("/");
  return `${item.reference} · dernière demande le ${day}`;
}
