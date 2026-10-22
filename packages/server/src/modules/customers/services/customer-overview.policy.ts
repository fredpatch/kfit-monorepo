import { customerOverviewViews, deriveClientStatusKey, isOpenSubscription, pickDefaultSubscription, type AdminCustomer, type AdminCustomerOverviewResponse, type AdminCustomerOverviewRow, type CadenceSource, type CustomerOverviewView } from "@kfit/shared";
import { calculateCadence, InvalidCadenceError, latestMeaningfulActivity, meaningfulActivities, type CadencePause } from "../../follow-ups/services/follow-up-cadence.policy.js";

/*
 * Clients overview (UX-5, board 04). Pure calculations over existing rows — no writes.
 * Rules validated by Fred on 2026-10-22:
 *  1. Client status = deriveClientStatusKey (shared).
 *  2. Current subscription = pickDefaultSubscription (shared, same as the profile); « +N » = other open subscriptions.
 *  3. Cadence = worst S5.3 state across subscriptions: overdue (largest delay) > due > healthy; null when none applies.
 *  4. Next appointment = earliest scheduled / confirmed / reschedule_requested appointment not yet ended.
 *  5. Last contact = latest S5.3 meaningful activity across subscriptions.
 *  6. Views: active = status active; overdue = ≥1 overdue cadence; preparation = onboarding, ready to start,
 *     awaiting payment, medical clearance; paused; former. « all » holds everyone.
 */

export type OverviewSubscription = {
  id: string; customerId: string; reference: string; status: string; serviceName: string; serviceSlug: string; variantName: string | null;
  createdAt: Date; actualStartDate: Date | null;
  /** Resolved cadence; null when the configuration is invalid (the follow-up screen reports it). */
  cadence: { days: number | null; source: CadenceSource } | null;
  pauses: CadencePause[];
};
export type OverviewSource = {
  customers: AdminCustomer[];
  subscriptions: OverviewSubscription[];
  completedAppointments: Array<{ subscriptionId: string; completedAt: Date | null }>;
  followUps: Array<{ subscriptionId: string; occurredAt: Date; completedAt: Date | null; status: string }>;
  upcomingAppointments: Array<{ id: string; subscriptionId: string; scheduledStart: Date; scheduledEnd: Date; status: string }>;
};

const preparationStatuses = ["onboarding", "ready_to_start", "awaiting_payment", "medical_clearance_required"];
const upcomingStatuses = ["scheduled", "confirmed", "reschedule_requested"];
const severity = { healthy: 0, due: 1, overdue: 2 } as const;

function cadenceOf(sub: OverviewSubscription, source: OverviewSource, now: Date) {
  if (!sub.cadence) return null;
  const activity = latestMeaningfulActivity(
    sub.actualStartDate,
    source.completedAppointments.filter((a) => a.subscriptionId === sub.id),
    source.followUps.filter((f) => f.subscriptionId === sub.id),
  );
  try {
    const result = calculateCadence({ status: sub.status, actualStartDate: sub.actualStartDate, cadence: sub.cadence, activity, pauses: sub.pauses, now });
    return result.cadenceState ? { subscriptionId: sub.id, state: result.cadenceState, overdueByDays: result.overdueByDays } : null;
  } catch (error) {
    if (error instanceof InvalidCadenceError) return null;
    throw error;
  }
}

export function overviewRow(customer: AdminCustomer, source: OverviewSource, now: Date): AdminCustomerOverviewRow {
  const subs = source.subscriptions.filter((s) => s.customerId === customer.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const clientStatus = deriveClientStatusKey(subs);
  const current = pickDefaultSubscription(subs) ?? null;

  let cadence: AdminCustomerOverviewRow["cadence"] = null;
  for (const sub of subs) {
    const candidate = cadenceOf(sub, source, now);
    if (!candidate) continue;
    if (!cadence || severity[candidate.state] > severity[cadence.state] || (candidate.state === cadence.state && (candidate.overdueByDays ?? 0) > (cadence.overdueByDays ?? 0))) cadence = candidate;
  }

  const ids = new Set(subs.map((s) => s.id));
  const next = source.upcomingAppointments
    .filter((a) => ids.has(a.subscriptionId) && upcomingStatuses.includes(a.status) && a.scheduledEnd.getTime() >= now.getTime())
    .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime())[0];

  const contacts = subs.flatMap((s) => meaningfulActivities(
    s.actualStartDate,
    source.completedAppointments.filter((a) => a.subscriptionId === s.id),
    source.followUps.filter((f) => f.subscriptionId === s.id),
  ).map((a) => a.at.getTime())).filter((t) => t <= now.getTime());

  const views: CustomerOverviewView[] = ["all"];
  if (clientStatus === "active") views.push("active");
  if (cadence?.state === "overdue") views.push("overdue");
  if (preparationStatuses.includes(clientStatus)) views.push("preparation");
  if (clientStatus === "paused") views.push("paused");
  if (clientStatus === "former") views.push("former");

  return {
    customer,
    clientStatus,
    currentSubscription: current ? { id: current.id, reference: current.reference, status: current.status, serviceName: current.serviceName, serviceSlug: current.serviceSlug, variantName: current.variantName } : null,
    otherOpenSubscriptions: subs.filter((s) => s.id !== current?.id && isOpenSubscription(s.status)).length,
    cadence,
    nextAppointment: next ? { id: next.id, subscriptionId: next.subscriptionId, scheduledStart: next.scheduledStart.toISOString(), status: next.status } : null,
    lastContactAt: contacts.length ? new Date(Math.max(...contacts)).toISOString() : null,
    views,
  };
}

export function computeCustomerOverview(source: OverviewSource, now: Date): AdminCustomerOverviewResponse {
  const customers = source.customers.map((c) => overviewRow(c, source, now));
  const counts = Object.fromEntries(customerOverviewViews.map((v) => [v, customers.filter((row) => row.views.includes(v)).length])) as Record<CustomerOverviewView, number>;
  return { asOf: now.toISOString(), customers, counts };
}
