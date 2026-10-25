import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { addBusinessDays, businessDateKey, startOfBusinessDay } from "@kfit/shared";
import { db, pool } from "../../../db/client.js";
import { customers, subscriptions, subscriptionStatusHistory, subscriptionPauses } from "../../../db/schema/customers.js";
import { services, servicePolicies } from "../../../db/schema/catalogue.js";
import { appointments, followUps, subscriptionFollowUpCadenceHistory as history } from "../../../db/schema/coaching.js";
import { prospects, serviceRequests, contactAttempts, qualificationReviews } from "../../../db/schema/prospects.js";
import { installments, paymentPlans, paymentEvents, paymentAllocations, paymentProofs, quotes, receipts } from "../../../db/schema/finance.js";
import { documents } from "../../../db/schema/documents.js";
import { DrizzleFinanceRepository } from "../../finance/repositories/finance.repository.js";
import { DrizzleDashboardAnalyticsRepository } from "../repositories/analytics.repository.js";
import { DrizzleDashboardAlertsRepository } from "../repositories/alerts.repository.js";
import { DashboardAnalyticsService } from "../services/analytics.service.js";
import { analyticsBuckets } from "../services/analytics.policy.js";
import { buildTodayTasks } from "../services/today.policy.js";
import { DashboardAlertsService } from "../services/alerts.service.js";
import { TodayService } from "../services/today.service.js";
import { DrizzleTodayRepository } from "../repositories/today.repository.js";
import { DrizzleFollowUpsRepository } from "../../follow-ups/repositories/follow-ups.repository.js";
import { DrizzleOnboardingRepository } from "../../onboarding/repositories/onboarding.repository.js";
import { DrizzleAdminRequestsRepository } from "../../requests/repositories/admin-requests.repositories.js";

const now = new Date("2031-03-12T11:00:00Z"), weeks = analyticsBuckets("8w", now), day = startOfBusinessDay(now);
const customerId = randomUUID(), serviceId = randomUUID(), prospectId = randomUUID(), documentId = randomUUID();
const subIds: string[] = [], requestIds: string[] = [], eventIds: string[] = [], planIds: string[] = [];
const finance = new DrizzleFinanceRepository(db, { auditHashPepper: "synthetic-dashboard-pepper-at-least-32-characters" }, () => now);
const repository = new DrizzleDashboardAnalyticsRepository(db, finance), alertRepository = new DrizzleDashboardAlertsRepository(db, finance);
let safe = false, primary: string, overdueItem: string;
async function owner(known = true) {
  const id = randomUUID(); subIds.push(id);
  await db.insert(subscriptions).values({ id, reference: `SUB-DASHBOARD-${id}`, customerId, serviceId, status: "active", actualStartDate: weeks[0]!.start, createdAt: addBusinessDays(weeks[0]!.start, -1), agreedPriceXaf: 900 });
  await db.insert(subscriptionStatusHistory).values({ subscriptionId: id, fromStatus: null, toStatus: "active", changedAt: weeks[0]!.start });
  if (known) await db.insert(history).values({ subscriptionId: id, source: "service", effectiveFrequencyDays: 7, effectiveFrom: weeks[0]!.start });
  return id;
}
async function read(periode: "4w" | "8w" | "12m" = "8w") {
  const service = new DashboardAnalyticsService({ async snapshot(from, instant) {
    const source = await repository.snapshot(from, instant);
    return { ...source, subscriptions: source.subscriptions.filter(sub => sub.customerId === customerId), requests: source.requests.filter(request => requestIds.includes(request.id)), appointments: source.appointments.filter(row => subIds.includes(row.subscriptionId)), finance: source.finance.filter(view => subIds.includes(view.subscriptionId)) };
  } }, () => now);
  const result = await service.analytics({ periode }); assert.equal(result.status, "ok"); if (result.status !== "ok") throw new Error("Missing analytics"); return result.response;
}
async function request(at: Date, convertedSubscriptionId: string | null = null) {
  const id = randomUUID(); requestIds.push(id);
  await db.insert(serviceRequests).values({ id, reference: `REQ-DASH-${id}`, submissionToken: randomUUID(), prospectId, serviceId, status: convertedSubscriptionId ? "converted" : "submitted", submittedAt: at, convertedSubscriptionId });
  return id;
}
before(async () => {
  const target = new URL(process.env.DATABASE_URL ?? ""); assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.port === "5433" && target.pathname === "/kfit_dev"); safe = true;
  await db.insert(customers).values({ id: customerId, fullName: "Synthetic Dashboard", whatsapp: "+241000001772" });
  await db.insert(prospects).values({ id: prospectId, fullName: "Synthetic Dashboard Prospect", whatsapp: "+241000001773" });
  await db.insert(services).values({ id: serviceId, name: "Synthetic Dashboard Offer", slug: `dashboard-${serviceId}`, pricingMode: "quote", deliveryType: "time_based", capacityMode: "unlimited" });
  await db.insert(servicePolicies).values({ serviceId, followUpFrequencyDays: 7 });
  primary = await owner();
});
after(async () => {
  try {
    if (!safe) return;
    await db.delete(receipts).where(eq(receipts.customerId, customerId));
    await db.delete(paymentProofs).where(eq(paymentProofs.customerId, customerId)); await db.delete(quotes).where(eq(quotes.customerId, customerId));
    await db.delete(documents).where(eq(documents.id, documentId));
    if (subIds.length) {
      await db.delete(paymentAllocations).where(inArray(paymentAllocations.subscriptionId, subIds));
      if (eventIds.length) { await db.delete(paymentEvents).where(inArray(paymentEvents.correctionOfEventId, eventIds)); await db.delete(paymentEvents).where(inArray(paymentEvents.id, eventIds)); }
      if (planIds.length) { await db.delete(installments).where(inArray(installments.paymentPlanId, planIds)); await db.delete(paymentPlans).where(inArray(paymentPlans.id, planIds)); }
      await db.delete(history).where(inArray(history.subscriptionId, subIds)); await db.delete(subscriptionStatusHistory).where(inArray(subscriptionStatusHistory.subscriptionId, subIds)); await db.delete(subscriptionPauses).where(inArray(subscriptionPauses.subscriptionId, subIds));
      await db.delete(appointments).where(inArray(appointments.subscriptionId, subIds)); await db.delete(followUps).where(inArray(followUps.subscriptionId, subIds));
    }
    if (requestIds.length) {
      await db.delete(contactAttempts).where(inArray(contactAttempts.requestId, requestIds)); await db.delete(qualificationReviews).where(inArray(qualificationReviews.requestId, requestIds)); await db.delete(serviceRequests).where(inArray(serviceRequests.id, requestIds));
    }
    if (subIds.length) await db.delete(subscriptions).where(inArray(subscriptions.id, subIds));
    await db.delete(customers).where(eq(customers.id, customerId)); await db.delete(prospects).where(eq(prospects.id, prospectId));
    await db.delete(servicePolicies).where(eq(servicePolicies.serviceId, serviceId)); await db.delete(services).where(eq(services.id, serviceId));
  } finally { await pool.end(); }
});

test("PostgreSQL historical active client stock persists across weeks", async () => {
  const view = await read(); assert.deepEqual(view.trends.activeClients.points.map(point => point.value), Array(8).fill(1));
});
test("PostgreSQL multiple active subscriptions count one distinct customer", async () => {
  await owner(); assert.equal((await read()).trends.activeClients.points[7]!.value, 1);
});
test("PostgreSQL historical cadence stock uses exact week endpoints and known cadence", async () => {
  const points = (await read()).trends.followUpsOverdue.points;
  assert.equal(points[0]!.value, 0); assert.equal(points[1]!.value, 2); assert.ok(points.every(point => point.availability === "complete"));
});
test("PostgreSQL historical meaningful follow-up changes later stock only", async () => {
  await db.insert(followUps).values({ subscriptionId: primary, followUpType: "check_in", occurredAt: weeks[7]!.start, status: "done", completedAt: weeks[7]!.start, note: "PRIVATE HEALTH NOTE" });
  const points = (await read()).trends.followUpsOverdue.points; assert.equal(points[6]!.value, 2); assert.equal(points[7]!.value, 1);
});
test("PostgreSQL pause intervals freeze the owner cadence clock", async () => {
  const id = await owner(); await db.insert(subscriptionPauses).values({ subscriptionId: id, reason: "Synthetic pause", startedAt: addBusinessDays(weeks[0]!.start, 1), endedAt: addBusinessDays(weeks[7]!.start, -1) });
  await db.insert(subscriptionStatusHistory).values([{ subscriptionId: id, fromStatus: "active", toStatus: "paused", changedAt: addBusinessDays(weeks[0]!.start, 1) }, { subscriptionId: id, fromStatus: "paused", toStatus: "active", changedAt: addBusinessDays(weeks[7]!.start, -1) }]);
  const points = (await read()).trends.followUpsOverdue.points; assert.equal(points[6]!.value, 2); assert.equal(points[7]!.value, 1);
});
test("PostgreSQL unknown eligible history yields null, not a fabricated zero", async () => {
  const id = await owner(false); const view = await read(); assert.equal(view.trends.followUpsOverdue.points[7]!.availability, "unavailable"); assert.equal(view.trends.followUpsOverdue.points[7]!.value, null); assert.equal(view.trends.followUpsOverdue.delta, null);
  await db.insert(history).values({ subscriptionId: id, source: "none", effectiveFrequencyDays: null, effectiveFrom: weeks[0]!.start });
});
test("PostgreSQL weekly request bucket membership is half-open", async () => {
  await request(weeks[6]!.start); await request(weeks[7]!.start);
  const view = await read(); assert.equal(view.requests.buckets[6]!.count, 1); assert.equal(view.requests.buckets[7]!.count, 1); assert.equal(view.requests.totalRequests, 2);
});
test("PostgreSQL monthly buckets preserve real calendar boundaries and one current flag", async () => {
  const view = await read("12m"); assert.equal(view.requests.buckets.length, 12); assert.equal(view.requests.buckets.filter(bucket => bucket.isCurrent).length, 1); assert.equal(businessDateKey(new Date(view.requests.buckets.at(-1)!.start)), "2031-03-01"); assert.equal(view.requests.totalRequests, 2);
});
test("PostgreSQL contacted and authoritative qualification stages remain cumulative", async () => {
  const contacted = requestIds[0]!, qualified = requestIds[1]!;
  await db.insert(contactAttempts).values({ requestId: contacted, prospectId, channel: "whatsapp", direction: "outbound", outcome: "reached", occurredAt: now });
  await db.insert(qualificationReviews).values({ requestId: qualified, version: 1, outcome: "qualified_with_conditions" });
  const funnel = (await read()).requests.funnel; assert.equal(funnel.received, 2); assert.equal(funnel.contacted, 2); assert.equal(funnel.qualified, 1);
});
test("PostgreSQL later conversion remains in its submitted cohort", async () => {
  await db.update(serviceRequests).set({ status: "converted", convertedSubscriptionId: primary }).where(eq(serviceRequests.id, requestIds[1]!));
  const view = await read(); assert.equal(view.requests.funnel.converted, 1); assert.equal(view.requests.conversionRate, 0.5);
});
test("PostgreSQL sessions are attributed by completion, not scheduled start", async () => {
  await db.insert(appointments).values({ subscriptionId: primary, status: "completed", scheduledStart: weeks[5]!.start, scheduledEnd: addBusinessDays(weeks[5]!.start, 1), completedAt: weeks[7]!.start, createdAt: weeks[5]!.start });
  const points = (await read()).trends.sessionsCompleted.points; assert.equal(points[5]!.value, 0); assert.equal(points[7]!.value, 1);
});
test("PostgreSQL finance uses confirmed allocations, partial payments and effective corrections", async () => {
  const [plan] = await db.insert(paymentPlans).values({ subscriptionId: primary, totalExpectedXaf: 900, status: "active" }).returning(); assert.ok(plan); planIds.push(plan.id);
  const items = await db.insert(installments).values([-1, 0, 1].map((offset, index) => ({ paymentPlanId: plan.id, sequenceNumber: index + 1, amountXaf: 300, dueDate: addBusinessDays(day, offset) }))).returning(); overdueItem = items[0]!.id;
  const [payment] = await db.insert(paymentEvents).values({ customerId, eventType: "payment_received", amountXaf: 100, paymentMethod: "cash", occurredAt: weeks[6]!.start, confirmedAt: weeks[6]!.start, externalReference: "PRIVATE BANK REFERENCE" }).returning(); assert.ok(payment); eventIds.push(payment.id);
  await db.insert(paymentAllocations).values({ paymentEventId: payment.id, subscriptionId: primary, installmentId: overdueItem, amountXaf: 100 });
  assert.equal((await read()).finance.collectedXaf, 100);
  const [correction] = await db.insert(paymentEvents).values({ customerId, eventType: "payment_correction", amountXaf: 40, paymentMethod: "cash", occurredAt: now, confirmedAt: now, correctionOfEventId: payment.id }).returning(); assert.ok(correction); eventIds.push(correction.id);
  await db.insert(paymentAllocations).values({ paymentEventId: correction.id, subscriptionId: primary, installmentId: overdueItem, amountXaf: 40 });
  assert.deepEqual((await read()).finance, { collectedXaf: 60, overdueXaf: 240, dueXaf: 300, futureXaf: 300, outstandingXaf: 840 });
});
test("PostgreSQL superseded and cancelled plans never add current obligations", async () => {
  for (const status of ["superseded", "cancelled"]) {
    const [plan] = await db.insert(paymentPlans).values({ subscriptionId: primary, totalExpectedXaf: 1000, status }).returning(); assert.ok(plan); planIds.push(plan.id);
    await db.insert(installments).values({ paymentPlanId: plan.id, sequenceNumber: 1, amountXaf: 1000, dueDate: day });
  }
  const finance = (await read()).finance; assert.equal(finance.outstandingXaf, 840); assert.equal(finance.outstandingXaf, finance.overdueXaf + finance.dueXaf + finance.futureXaf);
});
test("PostgreSQL pending proof and quote evidence never count as collected money", async () => {
  const before = (await read()).finance;
  await db.insert(documents).values({ id: documentId, ownerType: "subscription", ownerId: primary, documentType: "payment_proof", status: "published" });
  await db.insert(paymentProofs).values({ customerId, subscriptionId: primary, documentId, submittedVia: "public_link", claimedAmountXaf: 900, claimedPaymentMethod: "cash", claimedOccurredAt: now, claimedExternalReference: "PRIVATE PROOF REF", reviewNote: "PRIVATE REVIEW NOTE" });
  await db.insert(quotes).values({ customerId, subscriptionId: primary, status: "changes_requested" });
  await db.insert(receipts).values({ receiptNumber: `SYNTHETIC-${randomUUID()}`, customerId, paymentEventId: eventIds[0]!, pdfDocumentId: documentId, snapshotJson: { synthetic: true } });
  assert.deepEqual((await read()).finance, before);
});
test("PostgreSQL alert source uses owner remaining obligations and pending evidence only", async () => {
  const source = await alertRepository.snapshot(now);
  const own = source.finance.find(view => view.subscriptionId === primary); assert.ok(own);
  assert.equal(own.activePaymentPlan?.installments.find(item => item.id === overdueItem)?.remainingXaf, 240);
  assert.ok(source.proofs.some(proof => proof.subscriptionId === primary)); assert.ok(source.quoteChanges.some(quote => quote.subscriptionId === primary));
  const safe = JSON.stringify({ proofs: source.proofs, quotes: source.quoteChanges }); assert.ok(!safe.includes("PRIVATE"));
});
test("PostgreSQL dashboard reads leave source rows and history unchanged and redact private content", async () => {
  const before = { history: await db.select().from(history).where(inArray(history.subscriptionId, subIds)), plans: await db.select().from(paymentPlans).where(inArray(paymentPlans.id, planIds)), proofs: await db.select().from(paymentProofs).where(eq(paymentProofs.customerId, customerId)) };
  const view = await read(); await alertRepository.snapshot(now);
  assert.deepEqual({ history: await db.select().from(history).where(inArray(history.subscriptionId, subIds)), plans: await db.select().from(paymentPlans).where(inArray(paymentPlans.id, planIds)), proofs: await db.select().from(paymentProofs).where(eq(paymentProofs.customerId, customerId)) }, before);
  assert.ok(!JSON.stringify(view).includes("PRIVATE"));
});
test("PostgreSQL correction of an older source payment does not create negative current-period collections", async () => {
  const [cancelled] = await db.select().from(paymentPlans).where(eq(paymentPlans.subscriptionId, primary));
  assert.ok(cancelled);
  const [target] = await db.select().from(installments).where(eq(installments.paymentPlanId, cancelled.id)); assert.ok(target);
  const [source] = await db.insert(paymentEvents).values({ customerId, eventType: "payment_received", amountXaf: 50, paymentMethod: "cash", occurredAt: weeks[0]!.start, confirmedAt: weeks[0]!.start }).returning(); assert.ok(source); eventIds.push(source.id);
  const [correction] = await db.insert(paymentEvents).values({ customerId, eventType: "payment_correction", amountXaf: 50, paymentMethod: "cash", occurredAt: now, confirmedAt: now, correctionOfEventId: source.id }).returning(); assert.ok(correction); eventIds.push(correction.id);
  await db.insert(paymentAllocations).values([{ paymentEventId: source.id, subscriptionId: primary, installmentId: target.id, amountXaf: 50 }, { paymentEventId: correction.id, subscriptionId: primary, installmentId: target.id, amountXaf: 50 }]);
  assert.equal((await read("4w")).finance.collectedXaf, 60); assert.equal((await read("8w")).finance.collectedXaf, 60);
});
test("PostgreSQL operational alerts reuse real current owner queues and source deep links", async () => {
  const preparing = randomUUID(); subIds.push(preparing);
  await db.insert(subscriptions).values({ id: preparing, reference: `SUB-DASHBOARD-${preparing}`, customerId, serviceId, status: "onboarding", agreedPriceXaf: 0, createdAt: now });
  const completing = await owner(); await db.update(subscriptions).set({ status: "completion_due" }).where(eq(subscriptions.id, completing));
  await db.insert(subscriptionStatusHistory).values({ subscriptionId: completing, fromStatus: "active", toStatus: "completion_due", changedAt: now });
  const options = { auditHashPepper: "synthetic-dashboard-pepper-at-least-32-characters" }, actor = { userId: randomUUID(), requestId: randomUUID(), ipAddress: null, userAgent: null };
  const todayRepository = new DrizzleTodayRepository(db), followUpRepository = new DrizzleFollowUpsRepository(db, options, () => now), onboardingRepository = new DrizzleOnboardingRepository(db, options), requestsRepository = new DrizzleAdminRequestsRepository(db, options);
  const today = new TodayService({
    listAppointments: (...args) => todayRepository.listAppointments(...args), countRequestsSubmittedSince: since => todayRepository.countRequestsSubmittedSince(since), countCompletedAppointmentsSince: since => todayRepository.countCompletedAppointmentsSince(since),
    async listSubscriptionsByStatus(statuses) { return (await todayRepository.listSubscriptionsByStatus(statuses)).filter(row => subIds.includes(row.id)); },
  }, {
    async followUpQueue(context) { const result = await followUpRepository.execute("", { action: "queue" }, context); assert.ok(result.ok && "items" in result.body); if (!result.ok || !("items" in result.body)) throw new Error("Queue unavailable"); return { ...result.body, items: result.body.items.filter(row => subIds.includes(row.subscriptionId)) }; },
    async customerOverview() { return { asOf: now.toISOString(), customers: [], counts: { all: 1, active: 1, overdue: 0, preparation: 1, paused: 0, former: 0 } }; },
    async catalogueOverview() { return { asOf: now.toISOString(), services: [] }; },
    async requests() { return (await requestsRepository.listQueue({})).filter(row => requestIds.includes(row.id)); },
    async onboarding(id, context) { const result = await onboardingRepository.execute(id, { action: "read" }, context); assert.equal(result.status, "ok"); return result.status === "ok" ? result.onboarding : null; },
    collections: at => alertRepository.snapshot(at),
  }, () => now);
  const result = await new DashboardAlertsService(alertRepository, today, () => now).alerts(actor);
  const own = result.alerts.filter(alert => alert.customerId === customerId || requestIds.includes(alert.requestId ?? ""));
  for (const kind of ["follow_up_overdue", "request_to_contact", "installment_overdue", "payment_proof_pending", "preparation_blocked", "completion_due", "quote_action_required"]) assert.ok(own.some(alert => alert.kind === kind), kind);
  assert.ok(own.filter(alert => alert.kind === "installment_overdue" || alert.kind === "payment_proof_pending").every(alert => alert.deepLink.endsWith("onglet=finance")));
  assert.ok(own.some(alert => alert.kind === "request_to_contact" && alert.deepLink.includes("/admin/demandes?demande=")));
  assert.ok(!JSON.stringify(own).includes("PRIVATE"));
});

test("POL-01 D5: an anonymized customer leaves the collections owners, so no finance task or alert is derived", async () => {
  const visible = await alertRepository.snapshot(now);
  assert.ok(visible.owners.some(row => row.customerId === customerId), "fixture customer is an owner before anonymization");
  await db.update(customers).set({ anonymizedAt: now }).where(eq(customers.id, customerId));
  try {
    const hidden = await alertRepository.snapshot(now);
    assert.ok(!hidden.owners.some(row => row.customerId === customerId));
    const tasks = buildTodayTasks({ now, endOfDay: now, followUps: [], offerOfSubscription: new Map(), requests: [], preparations: [], completions: [], collections: hidden });
    assert.ok(!tasks.some(task => task.customerId === customerId || subIds.includes(task.subscriptionId ?? "")));
  } finally { await db.update(customers).set({ anonymizedAt: null }).where(eq(customers.id, customerId)); }
});
