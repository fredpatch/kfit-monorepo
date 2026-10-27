import {
  retentionEmailOutboxDaysKey,
  retentionNotificationsDaysKey,
  retentionProspectInactiveMonthsKey,
  retentionSecurityLogsDaysKey,
  type NotificationSettings,
} from "@kfit/shared";

/* RET-01 (Gate 1 approved 2026-10-27): retention of e-mail content, resolved notifications, security logs; inactive prospects. */

/** T1: the text that replaces the address, subject and bodies of an old outbox row. */
export const REDACTED = "[purgé]";

/**
 * T3: audit types under `auth.*` / `ops.*` that record account creation or role changes - legal evidence, never deleted.
 * `ops.create_user` / `ops.set_role` are job keys today (the audit types are `auth.user.*`); listed so a future audit type
 * with that name stays protected. `auth.dev_demo.created` records the local demo account's creation.
 */
export const RETENTION_EVIDENCE_EVENT_TYPES = [
  "auth.bootstrap.created",
  "auth.user.created",
  "auth.user.role_changed",
  "auth.dev_demo.created",
  "ops.create_user",
  "ops.set_role",
] as const;

/** T3: only these audit prefixes are security logs; every other prefix (privacy, consent, payment, …) is kept. */
export const RETENTION_SECURITY_LOG_PREFIXES = ["auth.", "ops."] as const;

/** R6: batches per step and per run (x PURGE_BATCH_SIZE rows); the rest waits for the next daily run. */
export const RETENTION_MAX_BATCHES = 200;

/** R5: Supervision lists at most this many inactive prospects, oldest first. */
export const INACTIVE_PROSPECTS_LIST_LIMIT = 20;

const DAY_MS = 86_400_000;
/** Africa/Libreville is UTC+1 all year (no daylight saving time). */
const LIBREVILLE_OFFSET_MS = 3_600_000;

export type RetentionSettings = {
  emailOutboxDays: number;
  notificationsDays: number;
  securityLogsDays: number;
  prospectInactiveMonths: number;
};

export type RetentionCutoffs = {
  outbox: Date;
  notifications: Date;
  securityLogs: Date;
  prospects: Date;
};

export function retentionSettingsOf(
  settings: NotificationSettings,
): RetentionSettings {
  return {
    emailOutboxDays: settings[retentionEmailOutboxDaysKey] as number,
    notificationsDays: settings[retentionNotificationsDaysKey] as number,
    securityLogsDays: settings[retentionSecurityLogsDaysKey] as number,
    prospectInactiveMonths: settings[
      retentionProspectInactiveMonthsKey
    ] as number,
  };
}

/** Same Libreville wall-clock time, `months` calendar months earlier (the day is clamped to the shorter month). */
export function monthsBefore(now: Date, months: number): Date {
  const local = new Date(now.getTime() + LIBREVILLE_OFFSET_MS);
  const year = local.getUTCFullYear(),
    month = local.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const shifted = Date.UTC(
    year,
    month,
    Math.min(local.getUTCDate(), lastDay),
    local.getUTCHours(),
    local.getUTCMinutes(),
    local.getUTCSeconds(),
    local.getUTCMilliseconds(),
  );
  return new Date(shifted - LIBREVILLE_OFFSET_MS);
}

/** Rows strictly older than a cutoff are in scope (a row exactly N days or months old is kept). */
export function retentionCutoffs(
  now: Date,
  settings: RetentionSettings,
): RetentionCutoffs {
  return {
    outbox: new Date(now.getTime() - settings.emailOutboxDays * DAY_MS),
    notifications: new Date(
      now.getTime() - settings.notificationsDays * DAY_MS,
    ),
    securityLogs: new Date(now.getTime() - settings.securityLogsDays * DAY_MS),
    prospects: monthsBefore(now, settings.prospectInactiveMonths),
  };
}
