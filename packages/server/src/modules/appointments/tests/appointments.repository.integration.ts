import "dotenv/config";
import { assertLocalTestDatabase } from "../../../testing/integration-fixtures.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { appointments, appointmentEvents } from "../../../db/schema/coaching.js";
import { customers, subscriptions, subscriptionComponents, componentEvents } from "../../../db/schema/customers.js";
import { services, servicePolicies, serviceVariants } from "../../../db/schema/catalogue.js";
import { secureAccessTokens, externalAccessEvents } from "../../../db/schema/documents.js";
import { DrizzleAppointmentsRepository, hashAppointmentToken } from "../repositories/appointments.repository.js";
import { hashAuditContext } from "../../auth/services/audit.service.js";
import type { AppointmentCommand } from "../services/appointments.service.js";
import type { AppointmentDetail } from "@kfit/shared";

const userId = randomUUID(), customerId = randomUUID(), serviceIds: string[] = [], subIds: string[] = [];
const options = { auditHashPepper: "synthetic-appointment-test-pepper-at-least-32-characters" };
const actor = { userId, requestId: randomUUID(), ipAddress: "192.0.2.123", userAgent: "synthetic-appointment-test" };
const repo = new DrizzleAppointmentsRepository(db, options);
const when = (hours: number) => new Date(Date.now() + hours * 3600000);
let safe = false;
before(async () => {
  assertLocalTestDatabase(); safe = true;
  await db.insert(users).values({ id: userId, email: `appointments-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(customers).values({ id: customerId, fullName: "Synthetic Appointment Customer", whatsapp: "+241000008888" });
});
after(async () => {
  try {
    if (!safe) return;
    await db.delete(externalAccessEvents).where(eq(externalAccessEvents.ipHash, hashAuditContext(actor.ipAddress, options.auditHashPepper)!));
    const apps = subIds.length ? await db.select().from(appointments).where(inArray(appointments.subscriptionId, subIds)) : [];
    const appIds = apps.map(a => a.id);
    if (appIds.length) {
      await db.delete(auditEvents).where(inArray(auditEvents.entityId, appIds));
      await db.delete(secureAccessTokens).where(and(eq(secureAccessTokens.resourceType, "appointment"), inArray(secureAccessTokens.resourceId, appIds)));
      await db.delete(componentEvents).where(inArray(componentEvents.relatedAppointmentId, appIds));
      await db.delete(appointmentEvents).where(inArray(appointmentEvents.appointmentId, appIds));
      let pending = apps;
      while (pending.length) {
        const leaves = pending.filter(a => !pending.some(other => other.rescheduledFromAppointmentId === a.id)); assert.ok(leaves.length);
        await db.delete(appointments).where(inArray(appointments.id, leaves.map(a => a.id)));
        const removed = new Set(leaves.map(a => a.id)); pending = pending.filter(a => !removed.has(a.id));
      }
    }
    if (subIds.length) { await db.delete(subscriptionComponents).where(inArray(subscriptionComponents.subscriptionId, subIds)); await db.delete(subscriptions).where(inArray(subscriptions.id, subIds)); }
    if (serviceIds.length) { await db.delete(servicePolicies).where(inArray(servicePolicies.serviceId, serviceIds)); await db.delete(serviceVariants).where(inArray(serviceVariants.serviceId, serviceIds)); await db.delete(services).where(inArray(services.id, serviceIds)); }
    await db.delete(customers).where(eq(customers.id, customerId)); await db.delete(users).where(eq(users.id, userId));
  } finally { await pool.end(); }
});
type Config = { status?: string; notice?: number | null; late?: boolean; missed?: boolean; quantity?: number; consumed?: number };
async function owner(config: Config = {}) {
  const serviceId = randomUUID(), subId = randomUUID(), componentId = randomUUID(); serviceIds.push(serviceId); subIds.push(subId);
  await db.insert(services).values({ id: serviceId, name: "Synthetic Appointment Service", slug: `appointment-${serviceId}`, pricingMode: "quote", deliveryType: "time_based", capacityMode: "unlimited" });
  await db.insert(servicePolicies).values({ serviceId, lateCancelNoticeHours: config.notice === undefined ? 24 : config.notice, lateCancelConsumesComponent: config.late ?? true, missedConsumesComponent: config.missed ?? true });
  await db.insert(subscriptions).values({ id: subId, reference: `SUB-APPOINTMENT-${subId}`, customerId, serviceId, status: config.status ?? "active", agreedPriceXaf: 45000, actualStartDate: when(-24), createdByUserId: userId });
  await db.insert(subscriptionComponents).values({ id: componentId, subscriptionId: subId, componentType: "appointment", labelSnapshot: "Synthetic historical session", quantityEntitled: config.quantity ?? 3, quantityConsumed: config.consumed ?? 0, quantityOwedByCoach: 2 });
  return { serviceId, subId, componentId };
}
const run = (id: string, command: AppointmentCommand, repository = repo) => repository.execute(id, command, actor);
const reject = (error: string) => ({ ok: false, error });
async function detail(id: string): Promise<AppointmentDetail> { const result = await run(id, { action: "read" }); assert.ok(result.ok && "appointment" in result.body); if (!result.ok || !("appointment" in result.body) || !("events" in result.body.appointment)) throw new Error("Missing admin detail"); return result.body.appointment; }
async function schedule(o: Awaited<ReturnType<typeof owner>>, config: { start?: Date; end?: Date; linked?: boolean } = {}, repository = repo) {
  const result = await run(o.subId, { action: "schedule", start: config.start ?? when(2), end: config.end ?? when(3), componentId: config.linked === false ? null : o.componentId, location: "Synthetic meeting channel" }, repository);
  assert.ok(result.ok && "appointment" in result.body, JSON.stringify(result));
  if (!result.ok || !("appointment" in result.body) || !("events" in result.body.appointment)) throw new Error("Missing scheduled appointment"); return result.body.appointment;
}
async function issue(id: string, expiresAt = when(24), repository = repo) {
  const result = await run(id, { action: "response-link", expiresAt }, repository); assert.ok(result.ok && "token" in result.body);
  if (!result.ok || !("token" in result.body)) throw new Error("Missing response token"); return result.body.token;
}
const respond = (token: string, command: AppointmentCommand | null, repository = repo) => repository.publicAccess(token, command, { ...actor, userId: null });
async function counter(id: string) { const [row] = await db.select().from(subscriptionComponents).where(eq(subscriptionComponents.id, id)); assert.ok(row); return row; }
async function accounting(id: string) { return db.select().from(componentEvents).where(eq(componentEvents.relatedAppointmentId, id)); }
async function tokenRow(token: string) { const [row] = await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.tokenHash, hashAppointmentToken(token))); assert.ok(row); return row; }
async function appRow(id: string) { const [row] = await db.select().from(appointments).where(eq(appointments.id, id)); assert.ok(row); return row; }

test("PostgreSQL schedules active subscription atomically with snapshot, event and audit", async () => {
  const o = await owner(), app = await schedule(o); assert.equal(app.status, "scheduled"); assert.equal(app.customerResponseStatus, "pending"); assert.equal(app.component?.id, o.componentId); assert.deepEqual(app.policy, { lateCancelNoticeHours: 24, lateCancelConsumesComponent: true, missedConsumesComponent: true }); assert.equal(app.events.length, 1);
  const events = await db.select().from(auditEvents).where(eq(auditEvents.entityId, app.id)); assert.equal(events[0]?.eventType, "appointment.created");
});
for (const status of ["onboarding", "ready_to_start", "paused", "completion_due", "completed", "cancelled"]) test(`PostgreSQL rejects scheduling for ${status}`, async () => {
  const o = await owner({ status }); assert.deepEqual(await run(o.subId, { action: "schedule", start: when(2), end: when(3), componentId: null, location: null }), reject("APPOINTMENT_SUBSCRIPTION_NOT_ACTIVE"));
});
test("PostgreSQL rejects foreign and exhausted components", async () => {
  const o = await owner(), other = await owner();
  assert.deepEqual(await run(o.subId, { action: "schedule", start: when(2), end: when(3), componentId: other.componentId, location: null }), reject("APPOINTMENT_COMPONENT_INVALID"));
  await db.update(subscriptionComponents).set({ quantityConsumed: 3 }).where(eq(subscriptionComponents.id, o.componentId));
  assert.deepEqual(await run(o.subId, { action: "schedule", start: when(2), end: when(3), componentId: o.componentId, location: null }), reject("APPOINTMENT_COMPONENT_EXHAUSTED"));
});
test("PostgreSQL serializes exact duplicate scheduling intent with nullable component", async () => {
  for (const linked of [true, false]) { const o = await owner(), command: AppointmentCommand = { action: "schedule", start: when(2), end: when(3), componentId: linked ? o.componentId : null, location: null };
    const results = await Promise.all([run(o.subId, command), run(o.subId, command)]); assert.equal(results.filter(r => r.ok).length, 1); assert.ok(results.some(r => !r.ok && r.error === "APPOINTMENT_DUPLICATE_SLOT")); }
});
test("PostgreSQL variant policy resolves field fallback while variant false remains authoritative", async () => {
  const o = await owner(), variantId = randomUUID(); await db.insert(serviceVariants).values({ id: variantId, serviceId: o.serviceId, name: "Synthetic variant", slug: `appointment-${variantId}` });
  await db.insert(servicePolicies).values({ serviceId: o.serviceId, variantId, lateCancelNoticeHours: null, lateCancelConsumesComponent: false, missedConsumesComponent: false });
  await db.update(subscriptions).set({ variantId }).where(eq(subscriptions.id, o.subId)); const app = await schedule(o); assert.deepEqual(app.policy, { lateCancelNoticeHours: 24, lateCancelConsumesComponent: false, missedConsumesComponent: false });
});
test("PostgreSQL later catalogue edit cannot reinterpret late cancellation snapshot", async () => {
  const o = await owner(), app = await schedule(o), token = await issue(app.id);
  await db.update(servicePolicies).set({ lateCancelConsumesComponent: false, lateCancelNoticeHours: null }).where(eq(servicePolicies.serviceId, o.serviceId));
  assert.ok((await respond(token, { action: "decline" })).ok); assert.equal((await counter(o.componentId)).quantityConsumed, 1); assert.equal((await detail(app.id)).policy.lateCancelConsumesComponent, true);
});
test("PostgreSQL public confirmation consumes token with no component change", async () => {
  const o = await owner(), app = await schedule(o), token = await issue(app.id); assert.ok((await respond(token, { action: "confirm" })).ok);
  const updated = await detail(app.id); assert.equal(updated.status, "confirmed"); assert.equal(updated.customerResponseStatus, "confirmed"); assert.equal((await counter(o.componentId)).quantityConsumed, 0); assert.equal((await tokenRow(token)).useCount, 1);
});
test("PostgreSQL on-time customer decline never consumes entitlement", async () => {
  const o = await owner(), app = await schedule(o, { start: when(48), end: when(49) }), token = await issue(app.id); assert.ok((await respond(token, { action: "decline" })).ok);
  const row = await appRow(app.id); assert.equal(row.cancelledByType, "customer"); assert.equal(row.customerResponseStatus, "declined"); assert.ok(row.cancelledAt); assert.equal((await counter(o.componentId)).quantityConsumed, 0); assert.equal((await accounting(app.id)).length, 0); assert.equal((await tokenRow(token)).useCount, 1);
});
test("PostgreSQL late cancellation with disabled policy consumes nothing", async () => {
  const o = await owner({ late: false }), app = await schedule(o), token = await issue(app.id); assert.ok((await respond(token, { action: "decline" })).ok); assert.equal((await counter(o.componentId)).quantityConsumed, 0);
});
test("PostgreSQL null notice disables late penalty even with consuming flag", async () => {
  const o = await owner({ notice: null }), app = await schedule(o, { start: when(-2), end: when(-1) }), token = await issue(app.id); assert.ok((await respond(token, { action: "decline" })).ok); assert.equal((await counter(o.componentId)).quantityConsumed, 0);
});
test("PostgreSQL late consuming cancellation appends exactly one unit and rejects replay", async () => {
  const o = await owner(), app = await schedule(o), token = await issue(app.id);
  const results = await Promise.all([respond(token, { action: "decline" }), respond(token, { action: "decline" })]); assert.equal(results.filter(r => r.ok).length, 1); assert.ok(results.some(r => !r.ok && r.error === "APPOINTMENT_TOKEN_CONSUMED"));
  assert.equal((await counter(o.componentId)).quantityConsumed, 1); assert.equal((await accounting(app.id)).length, 1); assert.equal((await accounting(app.id))[0]?.eventType, "late_customer_cancel"); assert.equal((await tokenRow(token)).useCount, 1);
});
test("PostgreSQL coach cancellation never consumes under consuming policy", async () => {
  const o = await owner(), app = await schedule(o); assert.ok((await run(app.id, { action: "cancel", reason: "Synthetic private coach reason" })).ok); assert.equal((await counter(o.componentId)).quantityConsumed, 0); assert.equal((await appRow(app.id)).cancelledByType, "coach");
});
test("PostgreSQL future missed marking and early completion without override reject", async () => {
  const o = await owner(), app = await schedule(o); assert.deepEqual(await run(app.id, { action: "missed" }), reject("APPOINTMENT_TOO_EARLY")); assert.deepEqual(await run(app.id, { action: "complete", override: false, reason: null }), reject("APPOINTMENT_TOO_EARLY")); assert.equal((await counter(o.componentId)).quantityConsumed, 0);
});
test("PostgreSQL explicit early completion override consumes once and preserves owed counter", async () => {
  const o = await owner(), app = await schedule(o); assert.ok((await run(app.id, { action: "complete", override: true, reason: "Synthetic private override" })).ok); const c = await counter(o.componentId); assert.equal(c.quantityConsumed, 1); assert.equal(c.quantityOwedByCoach, 2); assert.ok((await appRow(app.id)).completedAt);
});
for (const missed of [true, false]) test(`PostgreSQL missed policy consumes ${missed ? "one" : "zero"} linked unit`, async () => {
  const o = await owner({ missed }), app = await schedule(o, { start: when(-2), end: when(-1) }); assert.ok((await run(app.id, { action: "missed" })).ok); assert.equal((await counter(o.componentId)).quantityConsumed, missed ? 1 : 0);
});
test("PostgreSQL concurrent duplicate completion cannot consume twice", async () => {
  const o = await owner(), app = await schedule(o, { start: when(-2), end: when(-1) }); const results = await Promise.all([run(app.id, { action: "complete", override: false, reason: null }), run(app.id, { action: "complete", override: false, reason: null })]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal((await counter(o.componentId)).quantityConsumed, 1); assert.equal((await accounting(app.id)).filter(e => e.eventType === "appointment_completed").length, 1);
});
test("PostgreSQL competing appointments cannot consume beyond final entitled unit", async () => {
  const o = await owner({ quantity: 1 }), a = await schedule(o, { start: when(-4), end: when(-3) }), b = await schedule(o, { start: when(-2), end: when(-1) });
  const results = await Promise.all([run(a.id, { action: "complete", override: false, reason: null }), run(b.id, { action: "complete", override: false, reason: null })]); assert.equal(results.filter(r => r.ok).length, 1); assert.ok(results.some(r => !r.ok && r.error === "APPOINTMENT_COMPONENT_EXHAUSTED")); assert.equal((await counter(o.componentId)).quantityConsumed, 1);
});
for (const action of ["complete", "missed", "decline"] as const) test(`PostgreSQL unlinked ${action} mutates no component`, async () => {
  const o = await owner(), app = await schedule(o, { linked: false, start: when(-2), end: when(-1) });
  const result = action === "decline" ? await respond(await issue(app.id), { action }) : await run(app.id, action === "complete" ? { action, override: false, reason: null } : { action }); assert.ok(result.ok); assert.equal((await counter(o.componentId)).quantityConsumed, 0); assert.equal((await accounting(app.id)).length, 0);
});
test("PostgreSQL restoration appends once without rewriting consumed event or appointment state", async () => {
  const o = await owner(), app = await schedule(o, { start: when(-2), end: when(-1) }); await run(app.id, { action: "complete", override: false, reason: null }); const consumed = await accounting(app.id), before = await appRow(app.id);
  const results = await Promise.all([run(app.id, { action: "restore-component", reason: "Synthetic restoration" }), run(app.id, { action: "restore-component", reason: "Duplicate restoration" })]); assert.equal(results.filter(r => r.ok).length, 1); assert.ok(results.some(r => !r.ok && r.error === "APPOINTMENT_COMPONENT_ALREADY_RESTORED"));
  assert.equal((await counter(o.componentId)).quantityConsumed, 0); assert.deepEqual(await appRow(app.id), before); const events = await accounting(app.id); assert.equal(events.length, 2); assert.deepEqual(events.find(e => e.id === consumed[0]!.id), consumed[0]); assert.equal(events.filter(e => e.eventType === "restoration").length, 1);
});
test("PostgreSQL restoration rejects an appointment that never consumed", async () => {
  const o = await owner(), app = await schedule(o); await run(app.id, { action: "cancel", reason: "Synthetic cancellation" }); assert.deepEqual(await run(app.id, { action: "restore-component", reason: "Synthetic restore" }), reject("APPOINTMENT_COMPONENT_NOT_CONSUMED")); assert.equal((await counter(o.componentId)).quantityConsumed, 0);
});
test("PostgreSQL public reschedule request stores note, consumes token and no entitlement", async () => {
  const o = await owner(), app = await schedule(o), token = await issue(app.id); assert.ok((await respond(token, { action: "request_reschedule", note: "Synthetic private customer note" })).ok); const updated = await appRow(app.id); assert.equal(updated.status, "reschedule_requested"); assert.equal(updated.customerResponseStatus, "reschedule_requested"); assert.equal(updated.rescheduleNote, "Synthetic private customer note"); assert.equal((await counter(o.componentId)).quantityConsumed, 0); assert.equal((await tokenRow(token)).useCount, 1);
});
test("PostgreSQL coach reschedule preserves source facts and snapshots and revokes source links", async () => {
  const o = await owner(), app = await schedule(o), token = await issue(app.id), original = await appRow(app.id);
  await db.update(servicePolicies).set({ lateCancelNoticeHours: 1, lateCancelConsumesComponent: false, missedConsumesComponent: false }).where(eq(servicePolicies.serviceId, o.serviceId));
  assert.ok((await run(app.id, { action: "reschedule", start: when(48), end: when(49), location: "Replacement synthetic channel" })).ok);
  const source = await appRow(app.id), replacementId = (await detail(app.id)).replacementAppointmentId; assert.ok(replacementId); const replacement = await appRow(replacementId);
  assert.equal(source.status, "rescheduled"); for (const field of ["scheduledStart", "scheduledEnd", "locationOrChannel", "customerResponseStatus"] as const) assert.deepEqual(source[field], original[field]);
  assert.equal(replacement.componentId, original.componentId); assert.equal(replacement.rescheduledFromAppointmentId, app.id); assert.equal(replacement.status, "scheduled"); assert.equal(replacement.customerResponseStatus, "pending");
  for (const field of ["lateCancelNoticeHoursSnapshot", "lateCancelConsumesComponentSnapshot", "missedConsumesComponentSnapshot"] as const) assert.equal(replacement[field], original[field]); assert.ok((await tokenRow(token)).revokedAt); assert.equal((await detail(replacement.id)).responseLinks.length, 0); assert.equal((await counter(o.componentId)).quantityConsumed, 0);
});
test("PostgreSQL concurrent reschedules create one replacement only", async () => {
  const o = await owner(), app = await schedule(o); const results = await Promise.all([run(app.id, { action: "reschedule", start: when(48), end: when(49) }), run(app.id, { action: "reschedule", start: when(50), end: when(51) })]); assert.equal(results.filter(r => r.ok).length, 1); assert.equal((await db.select().from(appointments).where(eq(appointments.rescheduledFromAppointmentId, app.id))).length, 1);
});
test("PostgreSQL nonactive lifecycle preserves reads/finalization but forbids replacement", async () => {
  const o = await owner(), app = await schedule(o, { start: when(-2), end: when(-1) }); await db.update(subscriptions).set({ status: "paused" }).where(eq(subscriptions.id, o.subId));
  assert.equal((await detail(app.id)).status, "scheduled"); assert.deepEqual(await run(app.id, { action: "reschedule", start: when(48), end: when(49) }), reject("APPOINTMENT_SUBSCRIPTION_NOT_ACTIVE")); assert.ok((await run(app.id, { action: "complete", override: false, reason: null })).ok);
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, o.subId)); assert.equal(sub?.status, "paused");
});
test("PostgreSQL public GET is safe/non-consuming and token is stored hash-only", async () => {
  const o = await owner(), app = await schedule(o), token = await issue(app.id); const result = await respond(token, null); assert.ok(result.ok && "appointment" in result.body); if (!result.ok || !("appointment" in result.body)) return;
  assert.deepEqual(Object.keys(result.body.appointment).sort(), ["serviceLabel", "scheduledStart", "scheduledEnd", "locationOrChannel", "availableActions"].sort()); const stored = await tokenRow(token); assert.match(stored.tokenHash, /^[0-9a-f]{64}$/); assert.equal(stored.usedAt, null); assert.equal(stored.useCount, 0);
});
test("PostgreSQL response link replacement explicitly revokes previous grant", async () => {
  const o = await owner(), app = await schedule(o), first = await issue(app.id); await issue(app.id); assert.deepEqual(await respond(first, { action: "confirm" }), reject("APPOINTMENT_TOKEN_REVOKED")); assert.equal((await appRow(app.id)).status, "scheduled");
});
test("PostgreSQL expired, unknown, wrong-scope and malformed attempts are externally recorded", async () => {
  const o = await owner(), app = await schedule(o), token = await issue(app.id), stored = await tokenRow(token); await db.update(secureAccessTokens).set({ expiresAt: when(-1) }).where(eq(secureAccessTokens.id, stored.id)); assert.deepEqual(await respond(token, null), reject("APPOINTMENT_TOKEN_EXPIRED"));
  await db.update(secureAccessTokens).set({ expiresAt: when(24), action: "wrong_scope" }).where(eq(secureAccessTokens.id, stored.id)); assert.deepEqual(await respond(token, null), reject("APPOINTMENT_TOKEN_INVALID"));
  assert.deepEqual(await respond("not-a-valid-token", null), reject("APPOINTMENT_TOKEN_INVALID"));
  const events = await db.select().from(externalAccessEvents).where(eq(externalAccessEvents.ipHash, hashAuditContext(actor.ipAddress, options.auditHashPepper)!)); assert.ok(events.some(e => e.secureAccessTokenId === null && e.result === "APPOINTMENT_TOKEN_INVALID")); assert.ok(events.some(e => e.result === "APPOINTMENT_TOKEN_EXPIRED"));
});
test("PostgreSQL component lock wait across token expiry rolls back appointment/accounting/token", async () => {
  const o = await owner(), app = await schedule(o), expiry = new Date(Date.now() + 1200), token = await issue(app.id, expiry);
  let release!: () => void, locked!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }), acquired = new Promise<void>(resolve => { locked = resolve; });
  const holder = db.transaction(async tx => { await tx.select().from(subscriptionComponents).where(eq(subscriptionComponents.id, o.componentId)).for("update"); locked(); await gate; }); await acquired;
  const response = respond(token, { action: "decline" });
  try { await new Promise(resolve => setTimeout(resolve, Math.max(0, expiry.getTime() - Date.now() + 100))); } finally { release(); await holder; }
  assert.deepEqual(await response, reject("APPOINTMENT_TOKEN_EXPIRED")); assert.equal((await appRow(app.id)).status, "scheduled"); assert.equal((await counter(o.componentId)).quantityConsumed, 0); assert.equal((await tokenRow(token)).useCount, 0); assert.equal((await accounting(app.id)).length, 0);
});
test("PostgreSQL notes and reasons never enter generic audit metadata", async () => {
  const o = await owner(), app = await schedule(o); await respond(await issue(app.id), { action: "request_reschedule", note: "Synthetic private customer note" });
  const other = await schedule(o, { start: when(4), end: when(5) }); await run(other.id, { action: "complete", override: true, reason: "Synthetic private override" }); await run(other.id, { action: "restore-component", reason: "Synthetic private restoration" });
  const audits = await db.select().from(auditEvents).where(inArray(auditEvents.entityId, [app.id, other.id])); for (const a of audits) { const metadata = JSON.stringify(a.metadataJson); assert.ok(!metadata.includes("Synthetic")); assert.ok(!metadata.includes("reason")); assert.ok(!metadata.includes("note")); }
});
function auditFailureRepository() {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const database = new Proxy(db, { get(target, key, receiver) {
    if (key === "transaction") return <T>(work: (tx: Tx) => Promise<T>, config?: Parameters<typeof db.transaction>[1]) => target.transaction(tx => work(new Proxy(tx, { get(transaction, member, txReceiver) {
      if (member === "insert") return (table: Parameters<Tx["insert"]>[0]) => {
        const insert = transaction.insert(table); if (table !== auditEvents) return insert;
        return new Proxy(insert, { get(builder, method, builderReceiver) {
          if (method === "values") return (value: Record<string, unknown>) => Reflect.apply(builder.values, builder, [{ ...value, actorUserId: randomUUID() }]); return Reflect.get(builder, method, builderReceiver);
        } });
      }; return Reflect.get(transaction, member, txReceiver);
    } })), config); return Reflect.get(target, key, receiver);
  } }); return new DrizzleAppointmentsRepository(database, options);
}
for (const action of ["schedule", "confirm", "cancel", "reschedule", "complete", "missed", "restore-component", "response-link", "decline", "request_reschedule"] as const) test(`PostgreSQL real audit FK failure rolls back ${action} and all authoritative effects`, async () => {
  const o = await owner(), broken = auditFailureRepository();
  if (action === "schedule") { await assert.rejects(schedule(o, {}, broken)); assert.equal((await db.select().from(appointments).where(eq(appointments.subscriptionId, o.subId))).length, 0); return; }
  const app = await schedule(o, { start: when(-2), end: when(-1) });
  if (action === "restore-component") assert.ok((await run(app.id, { action: "complete", override: false, reason: null })).ok);
  const token = action === "decline" || action === "request_reschedule" || action === "response-link" || action === "reschedule" ? await issue(app.id) : null;
  const before = await detail(app.id), component = await counter(o.componentId), accountingBefore = await accounting(app.id), originalToken = token ? await tokenRow(token) : null;
  let command: AppointmentCommand;
  if (action === "cancel" || action === "restore-component") command = { action, reason: "Synthetic rollback reason" };
  else if (action === "complete") command = { action, override: false, reason: null };
  else if (action === "reschedule") command = { action, start: when(48), end: when(49) };
  else if (action === "response-link") command = { action, expiresAt: when(48) };
  else if (action === "request_reschedule") command = { action, note: "Synthetic rollback note" };
  else command = { action };
  await assert.rejects(action === "decline" || action === "request_reschedule" ? respond(token!, command, broken) : run(app.id, command, broken));
  assert.deepEqual(await detail(app.id), before); assert.deepEqual(await counter(o.componentId), component); assert.deepEqual(await accounting(app.id), accountingBefore); if (token) assert.deepEqual(await tokenRow(token), originalToken);
});
