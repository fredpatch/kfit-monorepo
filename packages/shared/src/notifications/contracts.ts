/*
 * S7.2 - internal operational notifications and optional e-mail reminders/digest (Gate 1 approved 2026-10-23).
 * Source modules own business truth; notifications are durable delivery/history; e-mail is an optional side effect.
 */
import { privacyPurgeDelayDaysKey } from "../privacy/contracts.js";

/** Closed vocabulary. quote_action_required is kept: S7.1 already derives one precise condition (quote status « changes_requested »). */
export const notificationKinds = [
  "follow_up_overdue",
  "request_to_contact",
  "installment_overdue",
  "payment_proof_pending",
  "quote_action_required",
  "preparation_blocked",
  "completion_due",
  // OPS-01 O9: operational health of K'FIT itself (admins only); never about a customer.
  "supervision_alert",
] as const;
export type NotificationKind = (typeof notificationKinds)[number];

export const notificationKindLabels: Record<NotificationKind, string> = {
  follow_up_overdue: "Suivi en retard",
  request_to_contact: "Demande à contacter",
  installment_overdue: "Échéance en retard",
  payment_proof_pending: "Justificatif à vérifier",
  quote_action_required: "Modification de devis demandée",
  preparation_blocked: "Préparation bloquée",
  completion_due: "Revue de fin à effectuer",
  supervision_alert: "Alerte de supervision",
};

export type NotificationSeverity = "warning" | "info";
export type NotificationState = "unread" | "read" | "resolved";

/** Only privacy-safe fields (Gate 1 § Privacy): no health data, notes, documents, payment references, amounts or tokens. */
export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  summary: string;
  customerDisplayName: string | null;
  deepLink: string;
  occurredAt: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  readAt: string | null;
  resolvedAt: string | null;
};

export const notificationListViews = ["active", "resolved"] as const;
export type NotificationListView = (typeof notificationListViews)[number];
export type NotificationListResponse = {
  view: NotificationListView;
  items: NotificationItem[];
  nextCursor: string | null;
};
/** unread: bell badge (not read, not resolved). open: « À traiter » tab (not resolved, read or not) - POL-01 D7. */
export type NotificationUnreadCountResponse = { unread: number; open: number };
export type NotificationReadResponse = { notification: NotificationItem };
export type NotificationReadAllResponse = { updated: number };

export const notificationApiRoutes = {
  list: "/admin/notifications",
  unreadCount: "/admin/notifications/unread-count",
  read: "/admin/notifications/:notificationId/read",
  readAll: "/admin/notifications/read-all",
  settings: "/admin/notification-settings",
} as const;

export const notificationErrorCodes = [
  "NOTIFICATION_INVALID_INPUT",
  "NOTIFICATION_NOT_FOUND",
  "NOTIFICATION_ADMIN_FORBIDDEN",
  "NOTIFICATION_SETTINGS_INVALID",
  "NOTIFICATION_ROUTE_UNEXPECTED_FAILURE",
] as const;
export type NotificationErrorCode = (typeof notificationErrorCodes)[number];

/* ------------------------------------------------------------------ */
/* Typed settings registry (Gate 1 § Settings). Unknown keys rejected. */
/* ------------------------------------------------------------------ */

type BooleanSetting = { type: "boolean"; default: boolean; label: string };
type IntegerSetting = {
  type: "integer";
  default: number;
  min: number;
  max: number;
  label: string;
};
export type NotificationSettingDefinition = (
  | BooleanSetting
  | IntegerSetting
) & { sensitivity: "operational" | "privacy"; scope: "global" };

const bool = (
  value: boolean,
  label: string,
): NotificationSettingDefinition => ({
  type: "boolean",
  default: value,
  label,
  sensitivity: "operational",
  scope: "global",
});
const int = (
  value: number,
  min: number,
  max: number,
  label: string,
  sensitivity: NotificationSettingDefinition["sensitivity"] = "operational",
): NotificationSettingDefinition => ({
  type: "integer",
  default: value,
  min,
  max,
  label,
  sensitivity,
  scope: "global",
});

/** Defaults: in-app is primary; e-mail on with one daily digest at 08:00 Libreville; per-kind e-mails off (avoid spam). */
export const notificationSettingRegistry = {
  "notifications.email.enabled": bool(true, "E-mails activés"),
  "notifications.daily_digest.enabled": bool(true, "Résumé quotidien"),
  "notifications.daily_digest.hour": int(
    8,
    0,
    23,
    "Heure du résumé (Libreville)",
  ),
  "notifications.follow_up_overdue.email_enabled": bool(
    false,
    "Suivis en retard",
  ),
  "notifications.follow_up_overdue.reminder_days": int(
    3,
    1,
    30,
    "Relance des suivis en retard (jours)",
  ),
  "notifications.request_to_contact.email_enabled": bool(
    false,
    "Demandes à contacter",
  ),
  "notifications.installment_overdue.email_enabled": bool(
    false,
    "Échéances en retard",
  ),
  "notifications.installment_overdue.reminder_days": int(
    7,
    1,
    30,
    "Relance des échéances en retard (jours)",
  ),
  "notifications.payment_proof_pending.email_enabled": bool(
    false,
    "Justificatifs à vérifier",
  ),
  "notifications.quote_action_required.email_enabled": bool(
    false,
    "Modifications de devis",
  ),
  "notifications.preparation_blocked.email_enabled": bool(
    false,
    "Préparations bloquées",
  ),
  "notifications.completion_due.email_enabled": bool(false, "Revues de fin"),
  // OPS-01 O9: on by default - a stale backup or a failing job must reach the admin's inbox.
  "notifications.supervision_alert.email_enabled": bool(
    true,
    "Alertes de supervision",
  ),
  // S7.3 (D6): the registry is the closed union of operational settings; privacy adds only the purge delay.
  [privacyPurgeDelayDaysKey]: int(
    30,
    1,
    365,
    "Délai avant suppression des fichiers (jours)",
    "privacy",
  ),
} as const satisfies Record<string, NotificationSettingDefinition>;
/** Same closed registry under its S7.3 name; notification-named exports are kept for S7.2 callers. */
export const operationalSettingRegistry = notificationSettingRegistry;

export type NotificationSettingKey = keyof typeof notificationSettingRegistry;
export type NotificationSettingValue = boolean | number;
export type NotificationSettings = Record<
  NotificationSettingKey,
  NotificationSettingValue
>;
export const notificationSettingKeys = Object.keys(
  notificationSettingRegistry,
) as NotificationSettingKey[];
export type NotificationSettingsResponse = {
  settings: NotificationSettings;
  updatedAt: string | null;
};
export type UpdateNotificationSettingsInput = {
  settings: Partial<NotificationSettings>;
};

export function notificationSettingDefaults(): NotificationSettings {
  return Object.fromEntries(
    notificationSettingKeys.map((key) => [
      key,
      notificationSettingRegistry[key].default,
    ]),
  ) as NotificationSettings;
}

/** Validates a partial update: every key known, every value of the declared type and range. Returns null when invalid. */
export function parseNotificationSettingsUpdate(
  input: unknown,
): Partial<NotificationSettings> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const settings = (input as { settings?: unknown }).settings;
  if (
    Object.keys(input).some((k) => k !== "settings") ||
    !settings ||
    typeof settings !== "object" ||
    Array.isArray(settings)
  )
    return null;
  const result: Partial<NotificationSettings> = {};
  const entries = Object.entries(settings);
  if (entries.length === 0) return null;
  for (const [key, value] of entries) {
    if (!Object.hasOwn(notificationSettingRegistry, key)) return null;
    const definition = notificationSettingRegistry[
      key as NotificationSettingKey
    ] as NotificationSettingDefinition;
    if (definition.type === "boolean") {
      if (typeof value !== "boolean") return null;
    } else if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < definition.min ||
      value > definition.max
    )
      return null;
    result[key as NotificationSettingKey] = value as NotificationSettingValue;
  }
  return result;
}

/** Kinds that have a reminder interval (only those keys exist in the registry). */
export function reminderDaysKey(
  kind: NotificationKind,
): NotificationSettingKey | null {
  const key = `notifications.${kind}.reminder_days`;
  return Object.hasOwn(notificationSettingRegistry, key)
    ? (key as NotificationSettingKey)
    : null;
}
export const emailEnabledKey = (kind: NotificationKind) =>
  `notifications.${kind}.email_enabled` as NotificationSettingKey;
