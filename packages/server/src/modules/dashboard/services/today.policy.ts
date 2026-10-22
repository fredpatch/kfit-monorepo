import { todayTaskKinds, type AdminCustomerOverviewResponse, type AdminServiceRequestSummary, type FollowUpQueueItem, type OnboardingDetail, type TodayTask } from "@kfit/shared";

/*
 * « À traiter » (UX-9). Rules validated by Fred on 2026-10-22, in this order:
 *  1. overdue follow-ups (most days late first);
 *  2. follow-ups due today (next due ≤ end of the business day, not yet overdue);
 *  3. new requests (submitted, oldest first), then requests whose scheduled next action has passed;
 *  4. preparations: reservation expired, ready to validate, waiting (first missing required item);
 *  5. end reviews (completion_due).
 * Every state comes from the existing calculations (S5.3 cadence, S3 requests, S4 onboarding).
 */

export type PreparationInput = { subscriptionId: string; customerId: string; customerName: string; offer: string; detail: OnboardingDetail | null };
export type CompletionInput = { subscriptionId: string; customerId: string; customerName: string; offer: string; plannedEndDate: string | null };

export function buildTodayTasks(input: {
  now: Date;
  endOfDay: Date;
  followUps: FollowUpQueueItem[];
  offerOfSubscription: Map<string, string>;
  requests: AdminServiceRequestSummary[];
  preparations: PreparationInput[];
  completions: CompletionInput[];
}): TodayTask[] {
  const tasks: TodayTask[] = [];
  const offer = (subscriptionId: string) => input.offerOfSubscription.get(subscriptionId) ?? "";

  const overdue = input.followUps.filter((f) => f.cadenceState === "overdue").sort((a, b) => (b.overdueByDays ?? 0) - (a.overdueByDays ?? 0));
  for (const f of overdue) tasks.push({ kind: "follow_up_overdue", customerId: f.customer.id, name: f.customer.fullName, subscriptionId: f.subscriptionId, requestId: null, offer: offer(f.subscriptionId), at: f.latestMeaningfulActivityAt, days: f.overdueByDays ?? 0, item: null });

  const due = input.followUps
    .filter((f) => f.cadenceState !== "overdue" && f.cadenceEligible && f.nextFollowUpDueAt !== null && new Date(f.nextFollowUpDueAt) <= input.endOfDay)
    .sort((a, b) => (a.nextFollowUpDueAt ?? "").localeCompare(b.nextFollowUpDueAt ?? ""));
  for (const f of due) tasks.push({ kind: "follow_up_due", customerId: f.customer.id, name: f.customer.fullName, subscriptionId: f.subscriptionId, requestId: null, offer: offer(f.subscriptionId), at: f.nextFollowUpDueAt, days: null, item: null });

  const requestOffer = (r: AdminServiceRequestSummary) => `${r.service.name}${r.requestedVariant ? ` · ${r.requestedVariant.name}` : ""}`;
  for (const r of input.requests.filter((r) => r.status === "submitted").sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))) {
    tasks.push({ kind: "request_new", customerId: null, name: r.prospect.fullName, subscriptionId: null, requestId: r.id, offer: requestOffer(r), at: r.submittedAt, days: null, item: null });
  }
  const followUpStatuses = ["contacting", "qualification_in_progress", "qualified", "qualified_with_conditions"];
  for (const r of input.requests.filter((r) => followUpStatuses.includes(r.status) && r.nextActionAt !== null && new Date(r.nextActionAt) <= input.now).sort((a, b) => (a.nextActionAt ?? "").localeCompare(b.nextActionAt ?? ""))) {
    tasks.push({ kind: "request_follow_up", customerId: null, name: r.prospect.fullName, subscriptionId: null, requestId: r.id, offer: requestOffer(r), at: r.nextActionAt, days: null, item: null });
  }

  const prep = (p: PreparationInput, kind: TodayTask["kind"], at: string | null, item: string | null): TodayTask => ({ kind, customerId: p.customerId, name: p.customerName, subscriptionId: p.subscriptionId, requestId: null, offer: p.offer, at, days: null, item });
  const preparations = input.preparations.filter((p) => p.detail !== null && p.detail.subscription.status === "onboarding");
  for (const p of preparations.filter((p) => p.detail!.capacity.expired)) tasks.push(prep(p, "preparation_expired", p.detail!.subscription.capacityReservedUntil, null));
  for (const p of preparations.filter((p) => !p.detail!.capacity.expired && p.detail!.canReady)) tasks.push(prep(p, "preparation_ready", p.detail!.subscription.plannedStartDate, null));
  for (const p of preparations.filter((p) => !p.detail!.capacity.expired && !p.detail!.canReady)) {
    const missing = p.detail!.initialized ? p.detail!.items.find((i) => i.isBlocking && i.status !== "completed" && i.status !== "waived")?.label ?? null : "Checklist à initialiser";
    tasks.push(prep(p, "preparation_waiting", p.detail!.subscription.plannedStartDate, missing));
  }

  for (const c of [...input.completions].sort((a, b) => (a.plannedEndDate ?? "").localeCompare(b.plannedEndDate ?? ""))) {
    tasks.push({ kind: "completion_due", customerId: c.customerId, name: c.customerName, subscriptionId: c.subscriptionId, requestId: null, offer: c.offer, at: c.plannedEndDate, days: null, item: null });
  }

  // Stable order by kind (validated priority), keeping the within-kind order above.
  return tasks.map((t, i) => ({ t, i })).sort((a, b) => todayTaskKinds.indexOf(a.t.kind) - todayTaskKinds.indexOf(b.t.kind) || a.i - b.i).map(({ t }) => t);
}

/** Active clients grouped by the offer of their current subscription (UX-5 rule). */
export function clientsByOffer(overview: AdminCustomerOverviewResponse) {
  const map = new Map<string, { serviceName: string; serviceSlug: string; count: number }>();
  for (const row of overview.customers) {
    if (row.clientStatus !== "active" || !row.currentSubscription) continue;
    const key = row.currentSubscription.serviceSlug;
    const entry = map.get(key) ?? { serviceName: row.currentSubscription.serviceName, serviceSlug: key, count: 0 };
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.serviceName.localeCompare(b.serviceName, "fr"));
}
