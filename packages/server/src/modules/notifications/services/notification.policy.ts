import { businessDateKey, businessOffsetMs, businessTimeZone, notificationKindLabels, type DashboardAlert, type NotificationKind, type NotificationSeverity } from "@kfit/shared";

/*
 * S7.2 pure rules: alert → notification candidate, reminder windows, digest timing, retry schedule, e-mail content.
 * Privacy (Gate 1): only kind, customer display name, offer/reference, safe dates and K'FIT deep links.
 * Never amounts, payment references, health data, documents, notes, consent text or tokens.
 */

export type NotificationCandidate = {
  kind: NotificationKind;
  severity: NotificationSeverity;
  resourceType: "subscription" | "request" | "installment" | "payment_proof" | "quote";
  resourceId: string;
  subscriptionId: string | null;
  customerId: string | null;
  customerDisplayName: string | null;
  title: string;
  summary: string;
  deepLink: string;
  dedupeKey: string;
  occurredAt: Date | null;
};

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { timeZone: businessTimeZone, day: "numeric", month: "long" }) : null;

/** Former tab ids still work in the client, but new links point at the merged « Paiements » tab (UX-15a). */
const canonicalLink = (link: string) => link.replace(/onglet=(finance|devis)\b/, "onglet=paiements");

/** Maps one S7.1 derived alert to its stable condition identity. Returns null when an id the identity needs is missing. */
export function candidateFromAlert(alert: DashboardAlert): NotificationCandidate | null {
  const base = {
    kind: alert.kind,
    severity: alert.severity,
    subscriptionId: alert.subscriptionId,
    customerId: alert.customerId,
    customerDisplayName: alert.customerDisplayName || null,
    deepLink: canonicalLink(alert.deepLink),
    occurredAt: alert.referenceAt ? new Date(alert.referenceAt) : null,
  };
  switch (alert.kind) {
    case "follow_up_overdue":
    case "preparation_blocked":
    case "completion_due":
      if (!alert.subscriptionId) return null;
      return { ...base, resourceType: "subscription", resourceId: alert.subscriptionId, dedupeKey: `${alert.kind}:${alert.subscriptionId}`, title: alert.title, summary: alert.summary };
    case "request_to_contact":
      if (!alert.requestId) return null;
      return { ...base, resourceType: "request", resourceId: alert.requestId, dedupeKey: `request_to_contact:${alert.requestId}`, title: alert.title, summary: alert.summary };
    case "installment_overdue":
      if (!alert.resourceId) return null;
      // The S7.1 summary carries the remaining amount: not a safe field, rebuilt from the due date only.
      return { ...base, resourceType: "installment", resourceId: alert.resourceId, dedupeKey: `installment_overdue:${alert.resourceId}`, title: notificationKindLabels.installment_overdue, summary: `Échéance du ${shortDate(alert.referenceAt) ?? "—"}` };
    case "payment_proof_pending":
      if (!alert.resourceId) return null;
      return { ...base, resourceType: "payment_proof", resourceId: alert.resourceId, dedupeKey: `payment_proof_pending:${alert.resourceId}`, title: notificationKindLabels.payment_proof_pending, summary: `Déposé le ${shortDate(alert.referenceAt) ?? "—"}` };
    case "quote_action_required":
      if (!alert.resourceId) return null;
      return { ...base, resourceType: "quote", resourceId: alert.resourceId, dedupeKey: `quote_action_required:${alert.resourceId}`, title: notificationKindLabels.quote_action_required, summary: `Demandée le ${shortDate(alert.referenceAt) ?? "—"}` };
  }
}

/** Distinct candidates by dedupe key (two S7.1 tasks can describe the same preparation condition). */
export function candidatesFromAlerts(alerts: DashboardAlert[]): NotificationCandidate[] {
  const byKey = new Map<string, NotificationCandidate>();
  for (const alert of alerts) {
    const candidate = candidateFromAlert(alert);
    if (candidate && !byKey.has(candidate.dedupeKey)) byKey.set(candidate.dedupeKey, candidate);
  }
  return [...byKey.values()];
}

const DAY_MS = 86_400_000;

/** Reminder window index: 0 at first detection, then +1 every `reminderDays` while unresolved; no repeat without a reminder key. */
export function reminderWindow(now: Date, firstDetectedAt: Date, reminderDays: number | null): number {
  if (!reminderDays) return 0;
  return Math.max(0, Math.floor((now.getTime() - firstDetectedAt.getTime()) / (reminderDays * DAY_MS)));
}

/** True once the Libreville clock has reached the configured digest hour on its business date. */
export function digestDue(now: Date, hour: number): boolean {
  const localHour = new Date(now.getTime() + businessOffsetMs(now)).getUTCHours();
  return localHour >= hour;
}

/** Bounded retry schedule (Gate 1): +5 min, +30 min, +2 h, +12 h, then dead letter. Typed and validated at load. */
export const notificationRetryDelaysMs = [5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000] as const;
export const notificationMaxAttempts = notificationRetryDelaysMs.length + 1;
if (!notificationRetryDelaysMs.every((d, i, all) => Number.isSafeInteger(d) && d > 0 && (i === 0 || d > all[i - 1]!))) throw new Error("Invalid notification retry policy");

/** After `attemptCount` failed sends: the next attempt time, or null when the row must go to dead letter. */
export function nextAttemptAfterFailure(attemptCount: number, now: Date): Date | null {
  if (attemptCount >= notificationMaxAttempts) return null;
  const delay = notificationRetryDelaysMs[Math.max(0, attemptCount - 1)];
  return delay === undefined ? null : new Date(now.getTime() + delay);
}

export type MailContent = { subject: string; bodyText: string };
const absolute = (baseUrl: string, link: string) => `${baseUrl.replace(/\/$/, "")}${link.startsWith("/") ? link : `/${link}`}`;

export function reminderMail(item: { kind: NotificationKind; title: string; summary: string; customerDisplayName: string | null; deepLink: string }, window: number, baseUrl: string): MailContent {
  const who = item.customerDisplayName ? ` — ${item.customerDisplayName}` : "";
  return {
    subject: `K'FIT — ${window > 0 ? "Rappel : " : ""}${item.title}${who}`,
    bodyText: [
      `${item.title}${who}`,
      item.summary,
      `Ouvrir dans K'FIT : ${absolute(baseUrl, item.deepLink)}`,
      "Ce message est envoyé par l'espace coach K'FIT. Les réglages des e-mails sont dans Configuration › Réglages.",
    ].join("\n\n"),
  };
}

const digestLines: Record<NotificationKind, (n: number) => string> = {
  follow_up_overdue: (n) => `${n} suivi${n > 1 ? "s" : ""} en retard`,
  request_to_contact: (n) => `${n} demande${n > 1 ? "s" : ""} à contacter`,
  installment_overdue: (n) => `${n} échéance${n > 1 ? "s" : ""} en retard`,
  payment_proof_pending: (n) => `${n} justificatif${n > 1 ? "s" : ""} à vérifier`,
  quote_action_required: (n) => `${n} modification${n > 1 ? "s" : ""} de devis demandée${n > 1 ? "s" : ""}`,
  preparation_blocked: (n) => `${n} préparation${n > 1 ? "s" : ""} bloquée${n > 1 ? "s" : ""}`,
  completion_due: (n) => `${n} revue${n > 1 ? "s" : ""} de fin à effectuer`,
};

/** Counts and one link only (Gate 1 § Digest). */
export function digestMail(counts: Partial<Record<NotificationKind, number>>, businessDate: string, baseUrl: string): MailContent {
  const lines = (Object.keys(digestLines) as NotificationKind[]).filter((k) => (counts[k] ?? 0) > 0).map((k) => `- ${digestLines[k](counts[k]!)}`);
  const day = new Date(`${businessDate}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  return {
    subject: "K'FIT — Actions à traiter",
    bodyText: [`Résumé du ${day}`, lines.join("\n"), `Ouvrir Aujourd'hui : ${absolute(baseUrl, "/admin")}`, "Ce résumé est envoyé une fois par jour. Les réglages des e-mails sont dans Configuration › Réglages."].join("\n\n"),
  };
}

export const digestDedupeKey = (userId: string, now: Date) => `digest:${userId}:${businessDateKey(now)}`;
export const reminderDedupeKey = (notificationId: string, window: number) => `reminder:${notificationId}:${window}`;
