import { createHash } from "node:crypto";
import type {
  SupervisionAlert,
  SupervisionAlertCode,
  SupervisionBackup,
  SupervisionJob,
  SupervisionJobState,
  SupervisionManualAction,
  SupervisionMode,
  SupervisionPrivacy,
  SupervisionRestoreCheck,
  SupervisionRuntime,
} from "@kfit/shared";
import type { NotificationCandidate } from "../../notifications/services/notification.policy.js";
import {
  PURGE_JOB_CRON,
  PURGE_JOB_KEY,
  PURGE_TIMEZONE,
} from "../../privacy/services/privacy.policy.js";

/*
 * OPS-01 pure rules (Gate 1 approved 2026-10-27). No I/O: the repository gathers facts, these functions judge them.
 */

/** O3: a job is late once its last success is older than this many intervals. */
export const STALE_FACTOR = 2;
/** O3: failure rate window. */
export const FAILURE_RATE_WINDOW_DAYS = 30;
/** O8: JOB_FAILING when at least half of the last 10 finished runs failed, or the last 3 all failed. */
export const JOB_FAILING_RECENT_RUNS = 10;
export const JOB_FAILING_RATE = 0.5;
export const JOB_FAILING_CONSECUTIVE = 3;
/** O5. */
export const BACKUP_MAX_AGE_HOURS = 26;
/** O6. */
export const RESTORE_CHECK_MAX_AGE_DAYS = 8;
/** O4: one manual run per job and minute. */
export const MANUAL_RUN_COOLDOWN_MS = 60_000;
/** O9. */
export const SUPERVISION_DEEP_LINK = "/admin/supervision";

const MINUTE = 60_000,
  HOUR = 60 * MINUTE,
  DAY = 24 * HOUR;

export type SupervisedJob = {
  jobKey: string;
  label: string;
  cron: string;
  timezone: string | null;
  intervalMs: number;
  manual: SupervisionManualAction;
};

/** O3: the jobs the API schedules (runtime.ts startNotificationJobs / startPrivacyJobs). Ops scripts are read from their own sections. */
export const SUPERVISED_JOBS: readonly SupervisedJob[] = [
  {
    jobKey: "notifications.reconcile",
    label: "Notifications : mise à jour",
    cron: "*/15 * * * *",
    timezone: null,
    intervalMs: 15 * MINUTE,
    manual: "run",
  },
  {
    jobKey: "notifications.email-delivery",
    label: "Notifications : envoi des e-mails",
    cron: "*/5 * * * *",
    timezone: null,
    intervalMs: 5 * MINUTE,
    manual: "run",
  },
  {
    jobKey: PURGE_JOB_KEY,
    label: "Confidentialité : suppression des fichiers",
    cron: PURGE_JOB_CRON,
    timezone: PURGE_TIMEZONE,
    intervalMs: DAY,
    manual: "simulate",
  },
];

/** UTC offset of `timeZone` at `at`, in ms (Intl only, no dependency). */
function offsetMs(timeZone: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
  return (
    Date.UTC(
      parts.year!,
      parts.month! - 1,
      parts.day!,
      parts.hour!,
      parts.minute!,
      parts.second!,
    ) -
    Math.floor(at.getTime() / 1000) * 1000
  );
}

/**
 * O3: next fire time for the two cron shapes the API uses - « *\/N * * * * » (every N minutes, N divides 60) and « M H * * * »
 * (daily, in `timeZone` or UTC). Null for any other expression.
 */
export function nextRunAt(
  cron: string,
  timeZone: string | null,
  now: Date,
): Date | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5 || fields.slice(2).some((field) => field !== "*"))
    return null;
  const [minute, hour] = fields as [string, string];
  const every = /^\*\/(\d{1,2})$/.exec(minute);
  if (every && hour === "*") {
    const step = Number(every[1]);
    if (step < 1 || 60 % step !== 0) return null;
    const next = new Date(now.getTime());
    next.setUTCSeconds(0, 0);
    next.setUTCMinutes((Math.floor(next.getUTCMinutes() / step) + 1) * step);
    return next;
  }
  if (
    !/^\d{1,2}$/.test(minute) ||
    !/^\d{1,2}$/.test(hour) ||
    Number(minute) > 59 ||
    Number(hour) > 23
  )
    return null;
  const zone = timeZone ?? "UTC";
  const local = new Date(now.getTime() + offsetMs(zone, now));
  for (let day = 0; day <= 1; day += 1) {
    const wallClock = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + day,
      Number(hour),
      Number(minute),
    );
    const candidate = new Date(wallClock - offsetMs(zone, new Date(wallClock)));
    if (candidate > now) return candidate;
  }
  return null;
}

export type JobRunFacts = {
  lastRun: {
    status: "running" | "succeeded" | "failed";
    startedAt: Date;
    finishedAt: Date | null;
    attempt: number;
    errorCode: string | null;
  } | null;
  lastSucceededAt: Date | null;
  runs30d: number;
  failed30d: number;
  /** Finished runs, newest first, at most JOB_FAILING_RECENT_RUNS. */
  recentFinished: Array<"succeeded" | "failed">;
};

export function isFailing(recent: JobRunFacts["recentFinished"]): boolean {
  const window = recent.slice(0, JOB_FAILING_RECENT_RUNS);
  if (!window.length) return false;
  const consecutive =
    window.length >= JOB_FAILING_CONSECUTIVE &&
    window
      .slice(0, JOB_FAILING_CONSECUTIVE)
      .every((status) => status === "failed");
  return (
    consecutive ||
    window.filter((status) => status === "failed").length / window.length >=
      JOB_FAILING_RATE
  );
}

export function supervisedJobView(
  job: SupervisedJob,
  facts: JobRunFacts,
  now: Date,
): SupervisionJob {
  const late =
    facts.lastSucceededAt !== null &&
    now.getTime() - facts.lastSucceededAt.getTime() >
      STALE_FACTOR * job.intervalMs;
  const failing = isFailing(facts.recentFinished);
  const state: SupervisionJobState = !facts.lastRun
    ? "never_run"
    : failing
      ? "failing"
      : late
        ? "late"
        : facts.lastRun.status === "running"
          ? "running"
          : "ok";
  const next = nextRunAt(job.cron, job.timezone, now);
  return {
    jobKey: job.jobKey,
    label: job.label,
    cron: job.cron,
    timezone: job.timezone,
    manual: job.manual,
    state,
    late,
    lastRun: facts.lastRun
      ? {
          status: facts.lastRun.status,
          startedAt: facts.lastRun.startedAt.toISOString(),
          attempt: facts.lastRun.attempt,
          errorCode: facts.lastRun.errorCode,
          durationMs: facts.lastRun.finishedAt
            ? facts.lastRun.finishedAt.getTime() -
              facts.lastRun.startedAt.getTime()
            : null,
        }
      : null,
    lastSucceededAt: facts.lastSucceededAt?.toISOString() ?? null,
    nextRunAt: next?.toISOString() ?? null,
    failureRate30d: facts.runs30d ? facts.failed30d / facts.runs30d : null,
  };
}

export type SupervisionState = {
  jobs: SupervisionJob[];
  backup: SupervisionBackup;
  restoreCheck: SupervisionRestoreCheck;
  privacy: SupervisionPrivacy;
  runtime: SupervisionRuntime;
};

/** O9: short French label (notification title) per code. */
export const supervisionAlertTitles: Record<SupervisionAlertCode, string> = {
  BACKUP_STALE: "Sauvegarde trop ancienne",
  BACKUP_FAILED: "Sauvegarde en échec",
  RESTORE_CHECK_STALE: "Contrôle de restauration trop ancien",
  RESTORE_CHECK_FAILED: "Contrôle de restauration en échec",
  PRIVACY_JOURNAL_UNAVAILABLE: "Journal de confidentialité indisponible",
  PURGE_FAILED: "Suppression des fichiers en échec",
  SECURITY_FLOOR_NOT_MET: "Version de Node à mettre à jour",
  JOB_FAILING: "Tâche planifiée en échec",
  JOB_LATE: "Tâche planifiée en retard",
  JOB_NEVER_RUN: "Tâche planifiée jamais exécutée",
  PROSPECTS_INACTIVE: "Prospects inactifs",
};

/** O9: each code has one severity, so the status endpoint can read it back from the stored dedupe key. */
export const supervisionAlertSeverity: Record<
  SupervisionAlertCode,
  SupervisionAlert["severity"]
> = {
  BACKUP_STALE: "critical",
  BACKUP_FAILED: "critical",
  RESTORE_CHECK_STALE: "warning",
  RESTORE_CHECK_FAILED: "critical",
  PRIVACY_JOURNAL_UNAVAILABLE: "critical",
  PURGE_FAILED: "warning",
  SECURITY_FLOOR_NOT_MET: "critical",
  JOB_FAILING: "warning",
  JOB_LATE: "warning",
  JOB_NEVER_RUN: "warning",
  PROSPECTS_INACTIVE: "warning",
};

const ageHours = (iso: string, now: Date) =>
  (now.getTime() - Date.parse(iso)) / HOUR;

/** O9: every active condition, critical first. Development tolerates « never ran / never backed up »; production does not. */
export function computeSupervisionAlerts(
  state: SupervisionState,
  now: Date,
  mode: SupervisionMode,
): SupervisionAlert[] {
  const alerts: SupervisionAlert[] = [];
  const add = (
    code: SupervisionAlertCode,
    message: string,
    jobKey?: string,
  ) => {
    const severity = supervisionAlertSeverity[code];
    alerts.push(
      jobKey
        ? { code, severity, jobKey, message }
        : { code, severity, message },
    );
  };
  const { backup, restoreCheck, privacy, runtime } = state;

  if (
    backup.lastFailed &&
    (!backup.lastSucceededAt ||
      Date.parse(backup.lastFailed.at) > Date.parse(backup.lastSucceededAt))
  ) {
    add(
      "BACKUP_FAILED",
      "La dernière sauvegarde a échoué. Consulte le runbook « Sauvegarde et restauration » et relance-la.",
    );
  }
  if (
    backup.lastSucceededAt
      ? ageHours(backup.lastSucceededAt, now) > BACKUP_MAX_AGE_HOURS
      : mode === "production"
  ) {
    add(
      "BACKUP_STALE",
      backup.lastSucceededAt
        ? `Aucune sauvegarde réussie depuis plus de ${BACKUP_MAX_AGE_HOURS} heures. Lance une sauvegarde.`
        : "Aucune sauvegarde réussie. Lance une sauvegarde.",
    );
  }
  if (restoreCheck?.status === "failed") {
    add(
      "RESTORE_CHECK_FAILED",
      "Le dernier contrôle de restauration a échoué. Vérifie la sauvegarde avant d'en dépendre.",
    );
  }
  if (
    restoreCheck
      ? ageHours(restoreCheck.at, now) > RESTORE_CHECK_MAX_AGE_DAYS * 24
      : mode === "production"
  ) {
    add(
      "RESTORE_CHECK_STALE",
      `Aucun contrôle de restauration depuis plus de ${RESTORE_CHECK_MAX_AGE_DAYS} jours. Lance ops:restore-drill.`,
    );
  }
  if (
    (privacy.journal.configured && !privacy.journal.writable) ||
    (!privacy.journal.configured && mode === "production")
  ) {
    add(
      "PRIVACY_JOURNAL_UNAVAILABLE",
      "Le journal de confidentialité n'est pas accessible en écriture. Vérifie KFIT_PRIVACY_JOURNAL_DIR.",
    );
  }
  if (privacy.lastPurge?.status === "failed") {
    add(
      "PURGE_FAILED",
      "La dernière suppression des fichiers a échoué. Consulte le runbook « Échec de job ».",
    );
  }
  // RET-01 T4: anonymization stays manual (S7.3 D6); the alert only points to the list.
  if (privacy.inactiveProspects.count > 0) {
    const { count, months } = privacy.inactiveProspects;
    add(
      "PROSPECTS_INACTIVE",
      `${count} prospect${count > 1 ? "s" : ""} sans nouvelle demande depuis plus de ${months} mois. Consulte la liste dans « Confidentialité » et anonymise ceux qui ne reviendront pas.`,
    );
  }
  if (!runtime.floor.ok) {
    add(
      "SECURITY_FLOOR_NOT_MET",
      "La version de Node est sous le plancher de sécurité. Mets Node à jour.",
    );
  }
  for (const job of state.jobs) {
    if (job.state === "failing")
      add(
        "JOB_FAILING",
        `« ${job.label} » échoue régulièrement. Consulte le runbook « Échec de job ».`,
        job.jobKey,
      );
    if (job.late)
      add(
        "JOB_LATE",
        `« ${job.label} » n'a pas réussi depuis plus de ${STALE_FACTOR} intervalles. Vérifie que l'API tourne.`,
        job.jobKey,
      );
    if (job.state === "never_run" && mode === "production")
      add(
        "JOB_NEVER_RUN",
        `« ${job.label} » ne s'est jamais exécutée. Vérifie que les tâches planifiées sont actives.`,
        job.jobKey,
      );
  }
  return alerts.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1,
  );
}

export const supervisionDedupeKey = (
  alert: Pick<SupervisionAlert, "code" | "jobKey">,
) => `supervision:${alert.code}${alert.jobKey ? `:${alert.jobKey}` : ""}`;

/** O9: fixed namespace so the same alert always maps to the same resource id (resource_id is a NOT NULL uuid). */
export const SUPERVISION_RESOURCE_NAMESPACE =
  "6f1d3c52-4b0e-5a7d-9c21-8e4f0b7a3d19";

/** O9: deterministic UUID, v5 layout (SHA-1 of namespace + name, version 5, RFC 4122 variant). */
export function supervisionResourceId(name: string): string {
  const namespace = Buffer.from(
    SUPERVISION_RESOURCE_NAMESPACE.replaceAll("-", ""),
    "hex",
  );
  const bytes = createHash("sha1")
    .update(namespace)
    .update(name)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** O9: the notifications column only knows warning|info, so every supervision alert is stored as « warning » (critical stays in the API). */
export const notificationSeverityFor = (
  _severity: SupervisionAlert["severity"],
): "warning" => "warning";

export function supervisionCandidates(
  alerts: SupervisionAlert[],
): NotificationCandidate[] {
  return alerts.map((alert) => {
    const dedupeKey = supervisionDedupeKey(alert);
    return {
      kind: "supervision_alert",
      severity: notificationSeverityFor(alert.severity),
      resourceType: "supervision",
      resourceId: supervisionResourceId(dedupeKey),
      subscriptionId: null,
      customerId: null,
      customerDisplayName: null,
      title: supervisionAlertTitles[alert.code],
      summary: alert.message,
      deepLink: SUPERVISION_DEEP_LINK,
      dedupeKey,
      occurredAt: null,
    };
  });
}
