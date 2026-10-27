import {
  businessDateKey,
  businessDayStartFromKey,
  todayTaskKinds,
  type AdminCustomerOverviewResponse,
  type AdminServiceRequestSummary,
  type FollowUpQueueItem,
  type OnboardingDetail,
  type TodayTask,
} from "@kfit/shared";

/*
 * « À traiter » (UX-9). Rules validated by Fred on 2026-10-22, in this order:
 *  1. overdue follow-ups (most days late first);
 *  2. follow-ups due today (next due ≤ end of the business day, not yet overdue);
 *  3. new requests (submitted, oldest first), then requests whose scheduled next action has passed;
 *  4. preparations: reservation expired, ready to validate, waiting (first missing required item);
 *  5. end reviews (completion_due).
 * POL-01 D5 inserts overdue installments after overdue follow-ups and pending payment proofs after follow-ups due today.
 * Every state comes from the existing calculations (S5.3 cadence, S3 requests, S4 onboarding, S6 finance).
 */

export type PreparationInput = {
  subscriptionId: string;
  customerId: string;
  customerName: string;
  offer: string;
  detail: OnboardingDetail | null;
};
export type CompletionInput = {
  subscriptionId: string;
  customerId: string;
  customerName: string;
  offer: string;
  plannedEndDate: string | null;
};
/** POL-01 D5: the dashboard collections snapshot (DrizzleDashboardAlertsRepository); owners already exclude archived and anonymized customers. */
export type FinanceCollectionsInput = {
  owners: Array<{
    subscriptionId: string;
    customerId: string;
    customerDisplayName: string;
  }>;
  finance: Array<{
    subscriptionId: string;
    activePaymentPlan: {
      installments: Array<{
        id: string;
        dueDate: string;
        remainingXaf: number;
      }>;
    } | null;
  }>;
  proofs: Array<{
    resourceId: string;
    subscriptionId: string;
    referenceAt: Date;
  }>;
};

const dayMs = 86_400_000;
/** POL-01 D5: overdue once the Libreville due date is before today (due today is not late). */
export function installmentDaysLate(dueDate: string, now: Date): number | null {
  const today = businessDateKey(now),
    due = businessDateKey(new Date(dueDate));
  if (due >= today) return null;
  return Math.round(
    (businessDayStartFromKey(today)!.getTime() -
      businessDayStartFromKey(due)!.getTime()) /
      dayMs,
  );
}

export function buildTodayTasks(input: {
  now: Date;
  endOfDay: Date;
  followUps: FollowUpQueueItem[];
  offerOfSubscription: Map<string, string>;
  requests: AdminServiceRequestSummary[];
  preparations: PreparationInput[];
  completions: CompletionInput[];
  collections?: FinanceCollectionsInput;
}): TodayTask[] {
  const tasks: TodayTask[] = [];
  const offer = (subscriptionId: string) =>
    input.offerOfSubscription.get(subscriptionId) ?? "";

  const overdue = input.followUps
    .filter((f) => f.cadenceState === "overdue")
    .sort((a, b) => (b.overdueByDays ?? 0) - (a.overdueByDays ?? 0));
  for (const f of overdue)
    tasks.push({
      kind: "follow_up_overdue",
      customerId: f.customer.id,
      name: f.customer.fullName,
      subscriptionId: f.subscriptionId,
      requestId: null,
      offer: offer(f.subscriptionId),
      at: f.latestMeaningfulActivityAt,
      days: f.overdueByDays ?? 0,
      item: null,
    });

  const collections = input.collections ?? {
    owners: [],
    finance: [],
    proofs: [],
  };
  const owner = (subscriptionId: string) =>
    collections.owners.find((o) => o.subscriptionId === subscriptionId);
  const lateInstallments: TodayTask[] = [];
  for (const view of collections.finance) {
    const o = owner(view.subscriptionId);
    if (!o) continue;
    for (const item of view.activePaymentPlan?.installments ?? []) {
      const days =
        item.remainingXaf > 0
          ? installmentDaysLate(item.dueDate, input.now)
          : null;
      if (days !== null)
        lateInstallments.push({
          kind: "installment_overdue",
          customerId: o.customerId,
          name: o.customerDisplayName,
          subscriptionId: o.subscriptionId,
          requestId: null,
          offer: offer(o.subscriptionId),
          at: item.dueDate,
          days,
          item: null,
          resourceId: item.id,
          amountXaf: item.remainingXaf,
        });
    }
  }
  tasks.push(
    ...lateInstallments.sort(
      (a, b) =>
        (b.days ?? 0) - (a.days ?? 0) ||
        (a.at ?? "").localeCompare(b.at ?? "") ||
        (a.resourceId ?? "").localeCompare(b.resourceId ?? ""),
    ),
  );
  const proofs = collections.proofs
    .flatMap((p) => {
      const o = owner(p.subscriptionId);
      return o ? [{ p, o }] : [];
    })
    .sort(
      (a, b) =>
        a.p.referenceAt.getTime() - b.p.referenceAt.getTime() ||
        a.p.resourceId.localeCompare(b.p.resourceId),
    );
  for (const { p, o } of proofs)
    tasks.push({
      kind: "payment_proof_pending",
      customerId: o.customerId,
      name: o.customerDisplayName,
      subscriptionId: o.subscriptionId,
      requestId: null,
      offer: offer(o.subscriptionId),
      at: p.referenceAt.toISOString(),
      days: null,
      item: null,
      resourceId: p.resourceId,
    });

  const due = input.followUps
    .filter(
      (f) =>
        f.cadenceState !== "overdue" &&
        f.cadenceEligible &&
        f.nextFollowUpDueAt !== null &&
        new Date(f.nextFollowUpDueAt) <= input.endOfDay,
    )
    .sort((a, b) =>
      (a.nextFollowUpDueAt ?? "").localeCompare(b.nextFollowUpDueAt ?? ""),
    );
  for (const f of due)
    tasks.push({
      kind: "follow_up_due",
      customerId: f.customer.id,
      name: f.customer.fullName,
      subscriptionId: f.subscriptionId,
      requestId: null,
      offer: offer(f.subscriptionId),
      at: f.nextFollowUpDueAt,
      days: null,
      item: null,
    });

  const requestOffer = (r: AdminServiceRequestSummary) =>
    `${r.service.name}${r.requestedVariant ? ` · ${r.requestedVariant.name}` : ""}`;
  for (const r of input.requests
    .filter((r) => r.status === "submitted")
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))) {
    tasks.push({
      kind: "request_new",
      customerId: null,
      name: r.prospect.fullName,
      subscriptionId: null,
      requestId: r.id,
      offer: requestOffer(r),
      at: r.submittedAt,
      days: null,
      item: null,
    });
  }
  const followUpStatuses = [
    "contacting",
    "qualification_in_progress",
    "qualified",
    "qualified_with_conditions",
  ];
  for (const r of input.requests
    .filter(
      (r) =>
        followUpStatuses.includes(r.status) &&
        r.nextActionAt !== null &&
        new Date(r.nextActionAt) <= input.now,
    )
    .sort((a, b) =>
      (a.nextActionAt ?? "").localeCompare(b.nextActionAt ?? ""),
    )) {
    tasks.push({
      kind: "request_follow_up",
      customerId: null,
      name: r.prospect.fullName,
      subscriptionId: null,
      requestId: r.id,
      offer: requestOffer(r),
      at: r.nextActionAt,
      days: null,
      item: null,
    });
  }

  const prep = (
    p: PreparationInput,
    kind: TodayTask["kind"],
    at: string | null,
    item: string | null,
  ): TodayTask => ({
    kind,
    customerId: p.customerId,
    name: p.customerName,
    subscriptionId: p.subscriptionId,
    requestId: null,
    offer: p.offer,
    at,
    days: null,
    item,
  });
  const preparations = input.preparations.filter(
    (p) => p.detail !== null && p.detail.subscription.status === "onboarding",
  );
  for (const p of preparations.filter((p) => p.detail!.capacity.expired))
    tasks.push(
      prep(
        p,
        "preparation_expired",
        p.detail!.subscription.capacityReservedUntil,
        null,
      ),
    );
  for (const p of preparations.filter(
    (p) => !p.detail!.capacity.expired && p.detail!.canReady,
  ))
    tasks.push(
      prep(
        p,
        "preparation_ready",
        p.detail!.subscription.plannedStartDate,
        null,
      ),
    );
  for (const p of preparations.filter(
    (p) => !p.detail!.capacity.expired && !p.detail!.canReady,
  )) {
    const missing = p.detail!.initialized
      ? (p.detail!.items.find(
          (i) =>
            i.isBlocking && i.status !== "completed" && i.status !== "waived",
        )?.label ?? null)
      : "Checklist à initialiser";
    tasks.push(
      prep(
        p,
        "preparation_waiting",
        p.detail!.subscription.plannedStartDate,
        missing,
      ),
    );
  }

  for (const c of [...input.completions].sort((a, b) =>
    (a.plannedEndDate ?? "").localeCompare(b.plannedEndDate ?? ""),
  )) {
    tasks.push({
      kind: "completion_due",
      customerId: c.customerId,
      name: c.customerName,
      subscriptionId: c.subscriptionId,
      requestId: null,
      offer: c.offer,
      at: c.plannedEndDate,
      days: null,
      item: null,
    });
  }

  // Stable order by kind (validated priority), keeping the within-kind order above.
  return tasks
    .map((t, i) => ({ t, i }))
    .sort(
      (a, b) =>
        todayTaskKinds.indexOf(a.t.kind) - todayTaskKinds.indexOf(b.t.kind) ||
        a.i - b.i,
    )
    .map(({ t }) => t);
}

/** Active clients grouped by the offer of their current subscription (UX-5 rule). */
export function clientsByOffer(overview: AdminCustomerOverviewResponse) {
  const map = new Map<
    string,
    { serviceName: string; serviceSlug: string; count: number }
  >();
  for (const row of overview.customers) {
    if (row.clientStatus !== "active" || !row.currentSubscription) continue;
    const key = row.currentSubscription.serviceSlug;
    const entry = map.get(key) ?? {
      serviceName: row.currentSubscription.serviceName,
      serviceSlug: key,
      count: 0,
    };
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort(
    (a, b) =>
      b.count - a.count || a.serviceName.localeCompare(b.serviceName, "fr"),
  );
}
