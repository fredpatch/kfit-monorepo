import { and, eq, isNotNull, ne } from "drizzle-orm";
import { financeEventTypes, financePaymentMethods, type FinanceDetail, type FinancePaymentEvent, type FinancePlan, type FinancePlanStatus } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { subscriptions } from "../../../db/schema/customers.js";
import { installments, paymentAllocations, paymentEvents, paymentPlans } from "../../../db/schema/finance.js";
import { AuditService, type AuditMetadata } from "../../auth/services/audit.service.js";
import { financeFailure, type FinanceActor, type FinanceCommand, type FinanceRepository, type FinanceResult } from "../services/finance.service.js";
import { allocateFifo, financialStatus, installmentStatus, sumXaf, FinanceInvariantError } from "../services/finance.policy.js";

type Database = typeof appDb;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Subscription = typeof subscriptions.$inferSelect;
const validPlanStatus = (value: string): FinancePlanStatus => {
  if (value === "draft" || value === "active" || value === "superseded" || value === "settled" || value === "cancelled") return value;
  throw new FinanceInvariantError();
};
function databaseFailure(error: unknown): { code: string; constraint: string | null } | null {
  if (!error || typeof error !== "object") return null;
  if ("code" in error && typeof error.code === "string") return { code: error.code, constraint: "constraint" in error && typeof error.constraint === "string" ? error.constraint : null };
  return "cause" in error && error.cause !== error ? databaseFailure(error.cause) : null;
}
export class DrizzleFinanceRepository implements FinanceRepository {
  constructor(private readonly database: Database, private readonly options: { auditHashPepper: string }, private readonly clock: () => Date = () => new Date()) {}
  private async read(tx: Tx, sub: Subscription, now: Date): Promise<FinanceDetail> {
    const plans = await tx.select().from(paymentPlans).where(eq(paymentPlans.subscriptionId, sub.id)).orderBy(paymentPlans.createdAt, paymentPlans.id);
    const schedule = await tx.select({ item: installments }).from(installments).innerJoin(paymentPlans, eq(paymentPlans.id, installments.paymentPlanId))
      .where(eq(paymentPlans.subscriptionId, sub.id)).orderBy(installments.dueDate, installments.sequenceNumber, installments.id);
    const itemMap = new Map(schedule.map(({ item }) => [item.id, item]));
    const rows = await tx.select({ allocation: paymentAllocations, event: paymentEvents }).from(paymentAllocations)
      .innerJoin(paymentEvents, eq(paymentEvents.id, paymentAllocations.paymentEventId))
      .where(and(eq(paymentAllocations.subscriptionId, sub.id), isNotNull(paymentEvents.confirmedAt)))
      .orderBy(paymentEvents.confirmedAt, paymentEvents.id, paymentAllocations.createdAt, paymentAllocations.id);
    const events = new Map<string, FinancePaymentEvent>();
    for (const { event, allocation } of rows) {
      const eventType = financeEventTypes.find(t => t === event.eventType), method = financePaymentMethods.find(m => m === event.paymentMethod);
      const item = allocation.installmentId ? itemMap.get(allocation.installmentId) : null;
      if (!eventType || !method || !event.confirmedAt || !item || allocation.extraId || event.customerId !== sub.customerId || event.currency !== "XAF") throw new FinanceInvariantError();
      let dto = events.get(event.id);
      if (!dto) {
        dto = { id: event.id, eventType, amountXaf: event.amountXaf, currency: "XAF", paymentMethod: method, occurredAt: event.occurredAt.toISOString(),
          confirmedAt: event.confirmedAt.toISOString(), confirmedByUserId: event.confirmedByUserId, correctionOfEventId: event.correctionOfEventId,
          externalReference: event.externalReference, correctableXaf: 0, allocations: [] };
        events.set(event.id, dto);
      }
      dto.allocations.push({ id: allocation.id, subscriptionId: sub.id, installmentId: item.id, paymentPlanId: item.paymentPlanId, amountXaf: allocation.amountXaf, createdAt: allocation.createdAt.toISOString() });
    }
    const history = [...events.values()];
    for (const event of history) {
      if (sumXaf(event.allocations.map(a => a.amountXaf)) !== event.amountXaf) throw new FinanceInvariantError();
      if (event.eventType === "payment_correction") {
        const original = event.correctionOfEventId ? events.get(event.correctionOfEventId) : null;
        if (!original || original.eventType !== "payment_received") throw new FinanceInvariantError();
        if (event.allocations.some(a => !original.allocations.some(originalAllocation => originalAllocation.installmentId === a.installmentId))) throw new FinanceInvariantError();
      } else if (event.correctionOfEventId) throw new FinanceInvariantError();
    }
    for (const event of history) if (event.eventType === "payment_received") event.correctableXaf = sumXaf([event.amountXaf, ...history.filter(e => e.correctionOfEventId === event.id).map(e => -e.amountXaf)]);
    const paidByItem = new Map<string, number[]>();
    for (const event of history) for (const allocation of event.allocations) {
      const values = paidByItem.get(allocation.installmentId) ?? [];
      values.push(event.eventType === "payment_received" ? allocation.amountXaf : -allocation.amountXaf); paidByItem.set(allocation.installmentId, values);
    }
    const confirmedPaidXaf = sumXaf(history.map(event => event.eventType === "payment_received" ? event.amountXaf : -event.amountXaf));
    if (confirmedPaidXaf > sub.agreedPriceXaf || sub.currency !== "XAF") throw new FinanceInvariantError();
    const remainingXaf = sub.agreedPriceXaf - confirmedPaidXaf;
    const dto: FinancePlan[] = plans.map(plan => ({ id: plan.id, status: validPlanStatus(plan.status), totalExpectedXaf: plan.totalExpectedXaf,
      revisedFromPlanId: plan.revisedFromPlanId, createdAt: plan.createdAt.toISOString(),
      installments: schedule.filter(({ item }) => item.paymentPlanId === plan.id).map(({ item }) => {
        const paidXaf = sumXaf(paidByItem.get(item.id) ?? []);
        if (paidXaf > item.amountXaf) throw new FinanceInvariantError();
        return { id: item.id, sequenceNumber: item.sequenceNumber, amountXaf: item.amountXaf, dueDate: item.dueDate.toISOString(), paidXaf,
          remainingXaf: item.amountXaf - paidXaf, effectiveStatus: installmentStatus(item.amountXaf, paidXaf, item.dueDate, now) };
      }),
      availableCommands: plan.status === "draft" ? ["activate", "cancel"] : plan.status === "active" ? remainingXaf > 0 ? ["revise", "cancel"] : ["cancel"] : [] }));
    for (const plan of dto) if (sumXaf(plan.installments.map(i => i.amountXaf)) !== plan.totalExpectedXaf) throw new FinanceInvariantError();
    const active = dto.filter(plan => plan.status === "active"); if (active.length > 1) throw new FinanceInvariantError();
    const activePaymentPlan = active[0] ?? null;
    const coveredXaf = activePaymentPlan ? sumXaf(activePaymentPlan.installments.map(i => i.remainingXaf)) : 0;
    const scheduleRequiresRevision = remainingXaf > 0 && (!activePaymentPlan || coveredXaf !== remainingXaf);
    return { subscriptionId: sub.id, subscriptionStatus: sub.status, asOf: now.toISOString(), currency: "XAF", agreedAmountXaf: sub.agreedPriceXaf,
      confirmedPaidXaf, remainingXaf, financialStatus: financialStatus(sub.agreedPriceXaf, confirmedPaidXaf), scheduleRequiresRevision,
      hasOverdueInstallment: Boolean(activePaymentPlan?.installments.some(i => i.effectiveStatus === "overdue")), activePaymentPlan, plans: dto, paymentHistory: history,
      canCreatePlan: !activePaymentPlan && !dto.some(p => p.status === "draft") && (remainingXaf > 0 || dto.length === 0),
      canRecordPayment: remainingXaf > 0 && Boolean(activePaymentPlan) && !scheduleRequiresRevision };
  }
  private audit(tx: Tx, actor: FinanceActor, eventType: string, entityId: string, metadata: AuditMetadata) {
    return new AuditService(tx, this.options).record({ actorType: "user", actorUserId: actor.userId, eventType, entityType: "finance", entityId, result: "success",
      requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent, metadata });
  }
  private async refreshCaches(tx: Tx, sub: Subscription, now: Date) {
    const view = await this.read(tx, sub, now);
    for (const plan of view.plans) {
      for (const item of plan.installments) {
        const status = item.remainingXaf === 0 ? "paid" : item.paidXaf > 0 ? "partially_paid" : "upcoming";
        await tx.update(installments).set({ status, updatedAt: now }).where(and(eq(installments.id, item.id), ne(installments.status, status)));
      }
      if (plan.status === "active" && view.remainingXaf === 0 && plan.installments.every(item => item.remainingXaf === 0)) await tx.update(paymentPlans).set({ status: "settled" }).where(eq(paymentPlans.id, plan.id));
    }
  }
  async execute(id: string, command: FinanceCommand, actor: FinanceActor): Promise<FinanceResult> {
    try {
      if (command.action === "read") return await this.database.transaction(async tx => {
        const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id));
        return sub ? { ok: true, body: { finance: await this.read(tx, sub, this.clock()) } } : financeFailure("FINANCE_NOT_FOUND");
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
      return await this.database.transaction(async tx => {
        let subscriptionId = id;
        if (command.action === "activate" || command.action === "revise" || command.action === "cancel") {
          const [plan] = await tx.select({ subscriptionId: paymentPlans.subscriptionId }).from(paymentPlans).where(eq(paymentPlans.id, id));
          if (!plan) return financeFailure("FINANCE_NOT_FOUND"); subscriptionId = plan.subscriptionId;
        } else if (command.action === "correct") {
          const scopes = await tx.selectDistinct({ subscriptionId: paymentAllocations.subscriptionId }).from(paymentAllocations).where(eq(paymentAllocations.paymentEventId, id));
          if (scopes.length !== 1) return financeFailure(scopes.length ? "FINANCE_CORRECTION_INVALID" : "FINANCE_NOT_FOUND"); subscriptionId = scopes[0]!.subscriptionId;
        }
        const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).for("update");
        if (!sub) return financeFailure("FINANCE_NOT_FOUND");
        // All finance writers use parent -> plan -> installment -> target event ordering.
        await tx.select({ id: paymentPlans.id }).from(paymentPlans).where(eq(paymentPlans.subscriptionId, sub.id)).orderBy(paymentPlans.id).for("update");
        await tx.select({ id: installments.id }).from(installments).innerJoin(paymentPlans, eq(paymentPlans.id, installments.paymentPlanId))
          .where(eq(paymentPlans.subscriptionId, sub.id)).orderBy(installments.dueDate, installments.sequenceNumber, installments.id).for("update");
        const now = this.clock();
        let view = await this.read(tx, sub, now);
        if (command.action === "record" || command.action === "correct") {
          const [prior] = await tx.select().from(paymentEvents).where(eq(paymentEvents.commandKey, command.idempotencyKey));
          if (prior) {
            const owned = view.paymentHistory.find(event => event.id === prior.id);
            const same = owned && prior.customerId === sub.customerId && prior.amountXaf === command.amountXaf && prior.occurredAt.getTime() === command.occurredAt.getTime()
              && (command.action === "record" ? prior.eventType === "payment_received" && prior.paymentMethod === command.paymentMethod && prior.externalReference === command.externalReference
                : prior.eventType === "payment_correction" && prior.correctionOfEventId === id);
            return same ? { ok: true, body: { finance: view, paymentEventId: prior.id, replayed: true } } : financeFailure("FINANCE_DUPLICATE_PAYMENT");
          }
        }
        if (command.action === "create" || command.action === "revise") {
          const parentIds = new Set(view.plans.map(plan => plan.revisedFromPlanId));
          const previous = command.action === "revise" ? view.plans.find(plan => plan.id === id) : view.plans.find(plan => plan.status !== "draft" && !parentIds.has(plan.id));
          if (command.action === "create" && !view.canCreatePlan) return financeFailure(view.activePaymentPlan ? "FINANCE_PLAN_ALREADY_ACTIVE" : "FINANCE_INVALID_STATE");
          if (command.action === "revise" && (previous?.status !== "active" || view.remainingXaf === 0)) return financeFailure("FINANCE_INVALID_STATE");
          if (sumXaf(command.installments.map(item => item.amountXaf)) !== view.remainingXaf) return financeFailure("FINANCE_INSTALLMENTS_TOTAL_MISMATCH");
          if (view.remainingXaf > 0 && command.installments.length === 0) return financeFailure("FINANCE_INSTALLMENTS_TOTAL_MISMATCH");
          if (command.action === "revise") await tx.update(paymentPlans).set({ status: "superseded" }).where(eq(paymentPlans.id, id));
          const toStatus = command.action === "revise" ? "active" : "draft";
          const [plan] = await tx.insert(paymentPlans).values({ subscriptionId: sub.id, totalExpectedXaf: view.remainingXaf, status: toStatus, revisedFromPlanId: previous?.id ?? null, createdAt: now }).returning();
          if (!plan) throw new FinanceInvariantError();
          if (command.installments.length) await tx.insert(installments).values(command.installments.map((item, index) => ({ paymentPlanId: plan.id, sequenceNumber: index + 1, amountXaf: item.amountXaf, dueDate: item.dueDate, createdAt: now, updatedAt: now })));
          await this.audit(tx, actor, command.action === "revise" ? "finance.payment_plan_revised" : "finance.payment_plan_created", plan.id,
            { subscriptionId: sub.id, paymentPlanId: plan.id, ...(previous ? { revisedFromPlanId: previous.id } : {}), amountXaf: view.remainingXaf, currency: "XAF", fromStatus: command.action === "revise" ? "active" : null, toStatus });
        } else if (command.action === "activate" || command.action === "cancel") {
          const plan = view.plans.find(plan => plan.id === id);
          if (!plan || !plan.availableCommands.includes(command.action)) return financeFailure("FINANCE_INVALID_STATE");
          if (command.action === "activate") {
            if (view.activePaymentPlan) return financeFailure("FINANCE_PLAN_ALREADY_ACTIVE");
            if (plan.totalExpectedXaf !== view.remainingXaf) return financeFailure("FINANCE_PLAN_TOTAL_MISMATCH");
          }
          const toStatus = command.action === "cancel" ? "cancelled" : view.remainingXaf === 0 ? "settled" : "active";
          await tx.update(paymentPlans).set({ status: toStatus }).where(eq(paymentPlans.id, id));
          await this.audit(tx, actor, command.action === "cancel" ? "finance.payment_plan_cancelled" : "finance.payment_plan_activated", id,
            { subscriptionId: sub.id, paymentPlanId: id, fromStatus: plan.status, toStatus });
        } else if (command.action === "record") {
          if (command.amountXaf > view.remainingXaf) return financeFailure("FINANCE_PAYMENT_EXCEEDS_OUTSTANDING");
          if (!view.canRecordPayment || !view.activePaymentPlan) return financeFailure(view.activePaymentPlan ? "FINANCE_PLAN_TOTAL_MISMATCH" : "FINANCE_INVALID_STATE");
          const targets = allocateFifo(command.amountXaf, view.activePaymentPlan.installments);
          const [event] = await tx.insert(paymentEvents).values({ customerId: sub.customerId, eventType: "payment_received", amountXaf: command.amountXaf,
            currency: "XAF", paymentMethod: command.paymentMethod, externalReference: command.externalReference, occurredAt: command.occurredAt,
            confirmedAt: now, confirmedByUserId: actor.userId, commandKey: command.idempotencyKey }).returning();
          if (!event) throw new FinanceInvariantError();
          await tx.insert(paymentAllocations).values(targets.map(target => ({ paymentEventId: event.id, subscriptionId: sub.id, installmentId: target.installmentId, amountXaf: target.amountXaf, createdAt: now })));
          await this.refreshCaches(tx, sub, now);
          await this.audit(tx, actor, "finance.payment_recorded", event.id, { subscriptionId: sub.id, paymentEventId: event.id, paymentPlanId: view.activePaymentPlan.id,
            amountXaf: event.amountXaf, currency: "XAF", paymentMethod: command.paymentMethod, allocationCount: targets.length });
          return { ok: true, body: { finance: await this.read(tx, sub, now), paymentEventId: event.id } };
        } else if (command.action === "correct") {
          const [target] = await tx.select().from(paymentEvents).where(eq(paymentEvents.id, id)).for("update");
          const original = view.paymentHistory.find(event => event.id === id);
          if (!target || !original || original.eventType !== "payment_received" || command.amountXaf > original.correctableXaf) return financeFailure("FINANCE_CORRECTION_INVALID");
          const reversed = view.paymentHistory.filter(event => event.correctionOfEventId === id).flatMap(event => event.allocations);
          const candidates = original.allocations.map(allocation => {
            const item = view.plans.flatMap(plan => plan.installments).find(item => item.id === allocation.installmentId);
            if (!item) throw new FinanceInvariantError();
            return { id: allocation.installmentId, sequenceNumber: item.sequenceNumber, dueDate: item.dueDate,
              remainingXaf: sumXaf([allocation.amountXaf, ...reversed.filter(a => a.installmentId === allocation.installmentId).map(a => -a.amountXaf)]) };
          });
          // Compensate latest original targets first, preserving earlier FIFO settlement where possible.
          const targets = allocateFifo(command.amountXaf, candidates, true);
          const [event] = await tx.insert(paymentEvents).values({ customerId: sub.customerId, eventType: "payment_correction", amountXaf: command.amountXaf,
            currency: "XAF", paymentMethod: original.paymentMethod, occurredAt: command.occurredAt, confirmedAt: now, confirmedByUserId: actor.userId,
            correctionOfEventId: id, commandKey: command.idempotencyKey }).returning();
          if (!event) throw new FinanceInvariantError();
          await tx.insert(paymentAllocations).values(targets.map(target => ({ paymentEventId: event.id, subscriptionId: sub.id, installmentId: target.installmentId, amountXaf: target.amountXaf, createdAt: now })));
          await this.refreshCaches(tx, sub, now);
          await this.audit(tx, actor, "finance.payment_corrected", event.id, { subscriptionId: sub.id, paymentEventId: event.id, correctionOfEventId: id,
            amountXaf: event.amountXaf, currency: "XAF", allocationCount: targets.length });
          return { ok: true, body: { finance: await this.read(tx, sub, now), paymentEventId: event.id } };
        }
        view = await this.read(tx, sub, now);
        return { ok: true, body: { finance: view } };
      });
    } catch (error) {
      if (error instanceof FinanceInvariantError) return financeFailure("FINANCE_INVALID_STATE");
      const failure = databaseFailure(error);
      if (failure?.code === "23505" && failure.constraint === "payment_events_command_key_uq") return financeFailure("FINANCE_DUPLICATE_PAYMENT");
      if (failure?.code === "23505" && failure.constraint === "payment_plans_one_active_uq") return financeFailure("FINANCE_PLAN_ALREADY_ACTIVE");
      if (failure?.code === "40001" || failure?.code === "40P01") return financeFailure("FINANCE_CONCURRENCY_CONFLICT");
      throw error;
    }
  }
}
