import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { services } from "../../../db/schema/catalogue.js";
import { appointments, followUps, progressMeasurements } from "../../../db/schema/coaching.js";
import { componentEvents, customers, subscriptionComponents, subscriptionPauses, subscriptions, subscriptionStatusHistory } from "../../../db/schema/customers.js";
import { documents, documentVersions, secureAccessTokens } from "../../../db/schema/documents.js";
import { installments, paymentAllocations, paymentEvents, paymentPlans, paymentProofs } from "../../../db/schema/finance.js";
import { notificationEmailOutbox, notifications } from "../../../db/schema/notifications.js";
import { consentDefinitions, consentRecords, medicalClearanceRecords, onboardingItems } from "../../../db/schema/onboarding.js";
import { anonymizationEvents, retentionHolds } from "../../../db/schema/operations.js";
import { contactAttempts, prospects, qualificationReviews, serviceRequests, waitlistEntries } from "../../../db/schema/prospects.js";
import { questionnaireAnswers, questionnaireQuestions, questionnaireSubmissions, questionnaireTemplates } from "../../../db/schema/questionnaires.js";
import { DrizzleCustomersRepository } from "../../customers/repositories/customers.repository.js";
import { DrizzleDashboardAlertsRepository } from "../../dashboard/repositories/alerts.repository.js";
import { DrizzleDashboardAnalyticsRepository } from "../../dashboard/repositories/analytics.repository.js";
import { DrizzleFinanceRepository } from "../../finance/repositories/finance.repository.js";
import { DrizzleAdminRequestsRepository } from "../../requests/repositories/admin-requests.repositories.js";
import { DrizzlePrivacyRepository, type PrivacyActor } from "../repositories/privacy.repository.js";
import { REDACTED_TEXT, pseudonymFor, whatsappPlaceholderFor } from "../services/privacy.policy.js";
import { privacyPurgeJob } from "../jobs/privacy-purge.job.js";
import { createPrivacyJournal, PRIVACY_JOURNAL_FILE } from "../services/privacy-journal.js";
import { runPrivacyReplay } from "../services/privacy-replay.js";
import { PrivacyService } from "../services/privacy.service.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const options = { auditHashPepper: "synthetic-privacy-audit" };
const userId = randomUUID(), serviceId = randomUUID(), templateId = randomUUID(), questionId = randomUUID(), questionId2 = randomUUID(), consentDefinitionId = randomUUID();
const actor: PrivacyActor = { userId, requestId: randomUUID(), ipAddress: "192.0.2.73", userAgent: `synthetic-privacy-${userId}` };
const repo = new DrizzlePrivacyRepository(db, options);
const created = { customers: [] as string[], prospects: [] as string[] };
const removed = new Set<string>();
const removeStoredObject = async (key: string) => { removed.add(key); };
let safe = false;
const startedAt = new Date();
const DAY = 86_400_000;

before(async () => {
  const target = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.port === "5433" && target.pathname === "/kfit_dev" && !target.search);
  safe = true;
  await db.insert(users).values({ id: userId, email: `privacy-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(services).values({ id: serviceId, name: "Synthetic Privacy Service", slug: `privacy-${serviceId}`, pricingMode: "quote", deliveryType: "time_based", capacityMode: "unlimited" });
  await db.insert(questionnaireTemplates).values({ id: templateId, templateKey: `privacy-${templateId}`, name: "Synthetic", category: "health", version: 1 });
  await db.insert(questionnaireQuestions).values([{ id: questionId, templateId, questionKey: "q1", label: "Synthetic question", questionType: "text" }, { id: questionId2, templateId, questionKey: "q2", label: "Synthetic list", questionType: "multi_choice" }]);
  await db.insert(consentDefinitions).values({ id: consentDefinitionId, consentType: `privacy-${consentDefinitionId}`, version: "1", title: "Synthetic", content: "Synthetic", contentHash: consentDefinitionId });
});

after(async () => {
  try {
    if (!safe) return;
    const custIds = created.customers, prosIds = created.prospects;
    const subIds = custIds.length ? (await db.select({ id: subscriptions.id }).from(subscriptions).where(inArray(subscriptions.customerId, custIds))).map((r) => r.id) : [];
    const reqIds = prosIds.length ? (await db.select({ id: serviceRequests.id }).from(serviceRequests).where(inArray(serviceRequests.prospectId, prosIds))).map((r) => r.id) : [];
    const docIds = subIds.length ? (await db.select({ id: documents.id }).from(documents).where(inArray(documents.ownerId, subIds))).map((r) => r.id) : [];
    const proofRows = custIds.length ? await db.select({ id: paymentProofs.id, documentId: paymentProofs.documentId }).from(paymentProofs).where(inArray(paymentProofs.customerId, custIds)) : [];
    const allDocs = [...docIds, ...proofRows.map((p) => p.documentId)];
    const ids = (values: string[]) => sql`${`{${values.join(",")}}`}::uuid[]`;
    await db.execute(sql`delete from notification_email_outbox where recipient_user_id = ${userId}`);
    await db.execute(sql`delete from notifications where recipient_user_id = ${userId}`);
    await db.execute(sql`delete from secure_access_tokens where resource_id = any(${ids([...subIds, ...reqIds, ...allDocs])})`);
    await db.execute(sql`delete from retention_holds where created_by_user_id = ${userId}`);
    await db.execute(sql`delete from anonymization_events where subject_id = any(${ids([...custIds, ...prosIds])})`);
    await db.execute(sql`delete from questionnaire_answers where question_id in (${questionId}, ${questionId2})`);
    await db.execute(sql`delete from questionnaire_submissions where template_id = ${templateId}`);
    await db.execute(sql`delete from consent_records where consent_definition_id = ${consentDefinitionId}`);
    for (const table of ["progress_measurements", "follow_ups", "appointments", "subscription_pauses", "subscription_status_history", "onboarding_items", "medical_clearance_records"]) {
      await db.execute(sql`delete from ${sql.raw(table)} where subscription_id = any(${ids(subIds)})`);
    }
    await db.execute(sql`delete from component_events where subscription_component_id in (select id from subscription_components where subscription_id = any(${ids(subIds)}))`);
    await db.execute(sql`delete from subscription_components where subscription_id = any(${ids(subIds)})`);
    await db.execute(sql`delete from payment_proofs where customer_id = any(${ids(custIds)})`);
    await db.execute(sql`delete from payment_allocations where subscription_id = any(${ids(subIds)})`);
    await db.execute(sql`delete from payment_events where customer_id = any(${ids(custIds)})`);
    await db.execute(sql`delete from installments where payment_plan_id in (select id from payment_plans where subscription_id = any(${ids(subIds)}))`);
    await db.execute(sql`delete from payment_plans where subscription_id = any(${ids(subIds)})`);
    await db.execute(sql`delete from document_versions where document_id = any(${ids(allDocs)})`);
    await db.execute(sql`delete from documents where id = any(${ids(allDocs)})`);
    await db.execute(sql`delete from subscriptions where id = any(${ids(subIds)})`);
    await db.execute(sql`delete from customers where id = any(${ids(custIds)})`);
    await db.execute(sql`delete from qualification_reviews where request_id = any(${ids(reqIds)})`);
    await db.execute(sql`delete from waitlist_entries where request_id = any(${ids(reqIds)})`);
    await db.execute(sql`delete from contact_attempts where prospect_id = any(${ids(prosIds)})`);
    await db.execute(sql`delete from service_requests where id = any(${ids(reqIds)})`);
    await db.execute(sql`delete from prospects where id = any(${ids(prosIds)})`);
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
    // System audit rows written by this suite (purge/replay runs); the dev DB had none before S7.3.
    await db.execute(sql`delete from audit_events where actor_type = 'system' and event_type in ('privacy.purge_run', 'privacy.replay_run') and created_at >= ${startedAt}`);
    await db.delete(questionnaireQuestions).where(inArray(questionnaireQuestions.id, [questionId, questionId2]));
    await db.delete(questionnaireTemplates).where(eq(questionnaireTemplates.id, templateId));
    await db.delete(consentDefinitions).where(eq(consentDefinitions.id, consentDefinitionId));
    await db.delete(services).where(eq(services.id, serviceId));
    await db.delete(users).where(eq(users.id, userId));
  } finally {
    await pool.end();
  }
});

type Fixture = Awaited<ReturnType<typeof seed>>;

/** One archived customer with its source prospect and a full graph of identity, health, notes, finance and documents. */
async function seed(input: { subscriptionStatus?: string; requestStatus?: string; archived?: boolean } = {}) {
  const tag = randomUUID().slice(0, 8);
  const customerId = randomUUID(), prospectId = randomUUID(), subscriptionId = randomUUID(), requestId = randomUUID();
  const name = `Synthetic Privacy Awa ${tag}`, whatsapp = `+24177${tag.replace(/\D/g, "0").slice(0, 6).padEnd(6, "1")}`, email = `privacy-${tag}@example.invalid`;
  created.prospects.push(prospectId); created.customers.push(customerId);
  await db.insert(prospects).values({ id: prospectId, fullName: name, whatsapp, email, city: "Libreville", archivedAt: null });
  await db.insert(serviceRequests).values({ id: requestId, reference: `REQ-PRIV-${tag}`, prospectId, serviceId, submissionToken: randomUUID(), status: input.requestStatus ?? "converted", objective: `objective of ${name}`, message: `message ${whatsapp}` });
  await db.insert(contactAttempts).values({ prospectId, requestId, channel: "whatsapp", direction: "outbound", outcome: "reached", occurredAt: new Date(), note: `called ${name}` });
  await db.insert(qualificationReviews).values({ requestId, version: 1, outcome: "qualified", suitabilityNote: `asthma ${name}`, conditionsJson: ["no running"], blockersJson: { knee: true } });
  await db.insert(waitlistEntries).values({ requestId, serviceId, priorityNote: `priority ${name}` });
  await db.insert(customers).values({ id: customerId, prospectId, fullName: name, whatsapp, email, city: "Libreville", country: "GA", archivedAt: input.archived === false ? null : new Date() });
  await db.insert(subscriptions).values({ id: subscriptionId, reference: `SUB-PRIV-${tag}`, customerId, serviceId, status: input.subscriptionStatus ?? "completed", agreedPriceXaf: 50000, createdByUserId: userId });
  const [submission] = await db.insert(questionnaireSubmissions).values({ subscriptionId, templateId, templateVersion: 1, revisionNumber: 1, source: "admin", status: "submitted" }).returning();
  await db.insert(questionnaireAnswers).values([{ submissionId: submission!.id, questionId, answerJson: { text: `diabetes ${name}` } }, { submissionId: submission!.id, questionId: questionId2, answerJson: ["insulin", name] }]);
  await db.insert(consentRecords).values({ customerId, subscriptionId, consentDefinitionId, decision: "accepted", capturedVia: "admin", verificationMetadataJson: { typedName: name } });
  await db.insert(medicalClearanceRecords).values({ subscriptionId, status: "required", triggerSource: "synthetic", note: `cardiology ${name}` });
  await db.insert(progressMeasurements).values({ subscriptionId, measuredAt: new Date(), weightKg: "71.5", waistCm: "80", hipsCm: "95", chestCm: "90", bodyFatEstimate: "22", feelingNote: `tired ${name}` });
  await db.insert(followUps).values({ subscriptionId, followUpType: "check_in", occurredAt: new Date(), note: `follow-up ${name}`, nextAction: `call ${whatsapp}` });
  await db.insert(appointments).values({ subscriptionId, scheduledStart: new Date(Date.now() - 2 * DAY), scheduledEnd: new Date(Date.now() - 2 * DAY + 3_600_000), rescheduleNote: `moved for ${name}`, locationOrChannel: `home of ${name}` });
  await db.insert(subscriptionPauses).values({ subscriptionId, startedAt: new Date(), reason: `hospital ${name}` });
  await db.insert(subscriptionStatusHistory).values({ subscriptionId, toStatus: "completed", reason: `done ${name}` });
  await db.insert(onboardingItems).values({ subscriptionId, itemType: "waiver", label: "Synthetic", waiverReason: `waived for ${name}` });
  const [component] = await db.insert(subscriptionComponents).values({ subscriptionId, componentType: "session", labelSnapshot: "Session", quantityEntitled: 4 }).returning();
  await db.insert(componentEvents).values({ subscriptionComponentId: component!.id, eventType: "consumed", quantity: 1, reason: `extra for ${name}` });
  const [plan] = await db.insert(paymentPlans).values({ subscriptionId, totalExpectedXaf: 50000, status: "active" }).returning();
  const [installment] = await db.insert(installments).values({ paymentPlanId: plan!.id, sequenceNumber: 1, amountXaf: 50000, dueDate: new Date() }).returning();
  const [payment] = await db.insert(paymentEvents).values({ customerId, eventType: "payment_received", amountXaf: 50000, paymentMethod: "mobile_money", occurredAt: new Date(), confirmedAt: new Date(), externalReference: `MOMO-${tag}`, metadataJson: { channel: "momo" } }).returning();
  await db.insert(paymentAllocations).values({ paymentEventId: payment!.id, subscriptionId, installmentId: installment!.id, amountXaf: 50000 });
  const [privateDoc] = await db.insert(documents).values({ ownerType: "subscription", ownerId: subscriptionId, documentType: "progress_photo", sensitivity: "sensitive_health", status: "available" }).returning();
  const storageKey = `privacy-${randomUUID()}.jpg`;
  const [version] = await db.insert(documentVersions).values({ documentId: privateDoc!.id, versionNumber: 1, storageKey, originalFilename: `${name}.jpg`, mimeType: "image/jpeg", sizeBytes: 10, sha256: "0".repeat(64), uploadedByType: "admin", malwareScanStatus: "clean" }).returning();
  await db.update(documents).set({ currentVersionId: version!.id }).where(eq(documents.id, privateDoc!.id));
  const proofProofId = randomUUID();
  const [proofDoc] = await db.insert(documents).values({ ownerType: "payment_proof", ownerId: proofProofId, documentType: "payment_proof", sensitivity: "private", status: "available" }).returning();
  await db.insert(paymentProofs).values({ id: proofProofId, customerId, subscriptionId, documentId: proofDoc!.id, submittedVia: "public_link", claimedAmountXaf: 50000, claimedPaymentMethod: "mobile_money", claimedOccurredAt: new Date(), customerMessage: `from ${name}`, reviewNote: `ok ${whatsapp}` });
  const [token] = await db.insert(secureAccessTokens).values({ tokenHash: randomUUID(), resourceType: "subscription", resourceId: subscriptionId, action: "payment_proof_upload", expiresAt: new Date(Date.now() + DAY) }).returning();
  const [notification] = await db.insert(notifications).values({ recipientUserId: userId, kind: "follow_up_overdue", severity: "warning", resourceType: "subscription", resourceId: subscriptionId, subscriptionId, customerId,
    title: `Suivi en retard — ${name}`, summary: `${name} attend`, customerDisplayName: name, deepLink: "/clients", dedupeKey: `privacy-${tag}`, firstDetectedAt: new Date(), lastDetectedAt: new Date() }).returning();
  await db.insert(notificationEmailOutbox).values([
    { notificationId: notification!.id, recipientUserId: userId, toEmail: "coach@example.invalid", subject: "Rappel", bodyText: `Rappel ${name}`, bodyHtml: `<p>${name}</p>`, messageKind: "reminder", dedupeKey: `privacy-${tag}-1`, nextAttemptAt: new Date(), status: "pending" },
    { notificationId: notification!.id, recipientUserId: userId, toEmail: "coach@example.invalid", subject: "Rappel", bodyText: `Rappel ${name}`, messageKind: "reminder", dedupeKey: `privacy-${tag}-2`, nextAttemptAt: new Date(), status: "sent" },
  ]);
  return { tag, customerId, prospectId, subscriptionId, requestId, name, whatsapp, email, privateDocId: privateDoc!.id, proofDocId: proofDoc!.id, storageKey, tokenId: token!.id, paymentId: payment!.id };
}

const financialSnapshot = async (f: Fixture) => JSON.stringify({
  subscription: await db.select().from(subscriptions).where(eq(subscriptions.id, f.subscriptionId)),
  plans: await db.select().from(paymentPlans).where(eq(paymentPlans.subscriptionId, f.subscriptionId)),
  installments: await db.execute(sql`select i.* from installments i join payment_plans p on p.id = i.payment_plan_id where p.subscription_id = ${f.subscriptionId} order by i.id`).then((r) => r.rows),
  payments: await db.select().from(paymentEvents).where(eq(paymentEvents.customerId, f.customerId)),
  allocations: await db.select().from(paymentAllocations).where(eq(paymentAllocations.subscriptionId, f.subscriptionId)),
  proofFinance: await db.select({ claimed: paymentProofs.claimedAmountXaf, method: paymentProofs.claimedPaymentMethod, at: paymentProofs.claimedOccurredAt, status: paymentProofs.status, doc: paymentProofs.documentId }).from(paymentProofs).where(eq(paymentProofs.customerId, f.customerId)),
});

/** Everything the plan rewrites, read back as JSON (for "replay twice = same state" and PII scans). */
const subjectState = async (f: Fixture) => JSON.stringify({
  customer: await db.select().from(customers).where(eq(customers.id, f.customerId)),
  prospect: await db.select().from(prospects).where(eq(prospects.id, f.prospectId)),
  requests: await db.select().from(serviceRequests).where(eq(serviceRequests.prospectId, f.prospectId)),
  answers: await db.execute(sql`select a.answer_json from questionnaire_answers a join questionnaire_submissions s on s.id = a.submission_id where s.subscription_id = ${f.subscriptionId} order by a.id`).then((r) => r.rows),
  measurements: await db.select().from(progressMeasurements).where(eq(progressMeasurements.subscriptionId, f.subscriptionId)),
  notifications: await db.select({ t: notifications.title, s: notifications.summary, n: notifications.customerDisplayName }).from(notifications).where(eq(notifications.customerId, f.customerId)),
  outbox: await db.execute(sql`select body_text, body_html, status from notification_email_outbox where dedupe_key like ${`privacy-${f.tag}-%`} order by dedupe_key`).then((r) => r.rows),
  documents: await db.select({ id: documents.id, status: documents.status }).from(documents).where(inArray(documents.id, [f.privateDocId, f.proofDocId])),
});

const anonymize = (f: Fixture, confirm = f.name, repository = repo) => repository.anonymize("customer", f.customerId, confirm, actor, new Date());

test("PostgreSQL archive: refused with an unfinished subscription or an open request, then idempotent (D1)", async () => {
  const active = await seed({ subscriptionStatus: "awaiting_payment", archived: false });
  assert.deepEqual(await repo.archive("customer", active.customerId, actor, new Date()), { ok: false, error: "PRIVACY_SUBJECT_HAS_ACTIVE_SUBSCRIPTION" });
  await db.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.id, active.subscriptionId));
  const first = await repo.archive("customer", active.customerId, actor, new Date());
  assert.ok(first.ok);
  const again = await repo.archive("customer", active.customerId, actor, new Date(Date.now() + 5000));
  assert.ok(again.ok && first.ok && again.archivedAt.getTime() === first.archivedAt.getTime(), "second archive keeps the first timestamp");
  const open = await seed({ requestStatus: "contacting" });
  assert.deepEqual(await repo.archive("prospect", open.prospectId, actor, new Date()), { ok: false, error: "PRIVACY_SUBJECT_HAS_OPEN_REQUEST" });
  assert.deepEqual(await repo.archive("prospect", randomUUID(), actor, new Date()), { ok: false, error: "PRIVACY_SUBJECT_NOT_FOUND" });
});

test("PostgreSQL anonymize refuses unarchived subjects and a wrong confirmation name", async () => {
  const f = await seed({ archived: false });
  assert.deepEqual(await anonymize(f), { ok: false, error: "PRIVACY_SUBJECT_NOT_ARCHIVED" });
  await db.update(customers).set({ archivedAt: new Date() }).where(eq(customers.id, f.customerId));
  assert.deepEqual(await anonymize(f, f.name.toLowerCase()), { ok: false, error: "PRIVACY_CONFIRMATION_MISMATCH" });
  assert.equal((await db.select().from(customers).where(eq(customers.id, f.customerId)))[0]?.fullName, f.name);
});

test("PostgreSQL anonymize wipes identity, health and notes, keeps finance byte-identical, cascades to the source prospect (D2, D8)", async () => {
  const f = await seed();
  const financeBefore = await financialSnapshot(f);
  const now = Date.now();
  const result = await anonymize(f);
  assert.ok(result.ok && !result.alreadyAnonymized);
  assert.equal(await financialSnapshot(f), financeBefore, "financial rows unchanged");

  const [customer] = await db.select().from(customers).where(eq(customers.id, f.customerId));
  assert.equal(customer?.fullName, pseudonymFor(f.customerId));
  assert.equal(customer?.whatsapp, whatsappPlaceholderFor(f.customerId));
  assert.equal(customer?.email, null); assert.equal(customer?.city, null); assert.equal(customer?.country, "GA"); assert.ok(customer?.anonymizedAt);
  const [prospect] = await db.select().from(prospects).where(eq(prospects.id, f.prospectId));
  assert.equal(prospect?.fullName, pseudonymFor(f.prospectId)); assert.equal(prospect?.whatsapp, whatsappPlaceholderFor(f.prospectId)); assert.ok(prospect?.anonymizedAt);
  const [request] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, f.requestId));
  assert.equal(request?.objective, null); assert.equal(request?.message, null);
  const [review] = await db.select().from(qualificationReviews).where(eq(qualificationReviews.requestId, f.requestId));
  assert.equal(review?.suitabilityNote, null); assert.equal(review?.conditionsJson, null);

  const answers = (await db.execute(sql`select a.answer_json from questionnaire_answers a join questionnaire_submissions s on s.id = a.submission_id where s.subscription_id = ${f.subscriptionId}`)).rows.map((r) => JSON.stringify(r.answer_json)).sort();
  assert.deepEqual(answers, ["[]", "{}"]);
  const [measure] = await db.select().from(progressMeasurements).where(eq(progressMeasurements.subscriptionId, f.subscriptionId));
  assert.equal(measure?.weightKg, null); assert.equal(measure?.bodyFatEstimate, null); assert.equal(measure?.feelingNote, null);
  assert.equal((await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.subscriptionId, f.subscriptionId)))[0]?.reason, REDACTED_TEXT);
  assert.equal((await db.select().from(consentRecords).where(eq(consentRecords.customerId, f.customerId)))[0]?.verificationMetadataJson, null);
  assert.equal((await db.select().from(consentRecords).where(eq(consentRecords.customerId, f.customerId)))[0]?.decision, "accepted", "consent fact kept");
  const [proof] = await db.select().from(paymentProofs).where(eq(paymentProofs.customerId, f.customerId));
  assert.equal(proof?.customerMessage, null); assert.equal(proof?.reviewNote, null);

  const [notification] = await db.select().from(notifications).where(eq(notifications.customerId, f.customerId));
  assert.equal(notification?.title, pseudonymFor(f.customerId)); assert.equal(notification?.customerDisplayName, pseudonymFor(f.customerId));
  const outbox = (await db.execute(sql`select body_text, body_html, status, last_error_code from notification_email_outbox where dedupe_key like ${`privacy-${f.tag}-%`} order by dedupe_key`)).rows;
  assert.deepEqual(outbox.map((r) => [r.body_text, r.body_html, r.status]), [[REDACTED_TEXT, null, "dead_letter"], [REDACTED_TEXT, null, "sent"]]);

  const [privateDoc] = await db.select().from(documents).where(eq(documents.id, f.privateDocId));
  assert.equal(privateDoc?.status, "pending_purge");
  assert.ok(Math.abs(privateDoc!.purgeAfter!.getTime() - (now + 30 * DAY)) < 60_000, "purge_after = now + 30 days (D3c)");
  assert.equal((await db.select().from(documents).where(eq(documents.id, f.proofDocId)))[0]?.status, "available", "proof file kept (D2c)");
  assert.ok((await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, f.tokenId)))[0]?.revokedAt, "secure link revoked");
});

test("PostgreSQL anonymize is atomic: a failure at the last insert leaves nothing changed", async () => {
  const f = await seed();
  const before = await subjectState(f);
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const failing = new Proxy(db, { get(target, key, receiver) {
    if (key !== "transaction") return Reflect.get(target, key, receiver);
    return <T>(work: (tx: Tx) => Promise<T>) => target.transaction((tx) => work(new Proxy(tx, { get(t, member, r) {
      if (member === "insert") return (table: Parameters<Tx["insert"]>[0]) => { if (table === anonymizationEvents) throw new Error("INJECTED_FAILURE"); return t.insert(table); };
      return Reflect.get(t, member, r);
    } })));
  } });
  await assert.rejects(anonymize(f, f.name, new DrizzlePrivacyRepository(failing, options)), /INJECTED_FAILURE/);
  assert.equal(await subjectState(f), before);
  assert.equal((await db.select().from(anonymizationEvents).where(eq(anonymizationEvents.subjectId, f.customerId))).length, 0);
});

test("PostgreSQL holds win: customer, prospect and document holds block anonymize; release unblocks (rule 5, D7)", async () => {
  for (const scope of ["customer", "prospect", "document"] as const) {
    const f = await seed();
    const scopeId = scope === "customer" ? f.customerId : scope === "prospect" ? f.prospectId : f.proofDocId;
    const hold = await repo.createHold({ scopeType: scope, scopeId, holdType: "legal", reason: `litige ${f.name}` }, actor, new Date());
    assert.ok(hold.ok, scope);
    assert.deepEqual(await repo.createHold({ scopeType: scope, scopeId, holdType: "legal", reason: "doublon" }, actor, new Date()), { ok: false, error: "PRIVACY_HOLD_ALREADY_ACTIVE" });
    assert.deepEqual(await anonymize(f), { ok: false, error: "PRIVACY_RETENTION_HOLD_ACTIVE" }, scope);
    if (!hold.ok) continue;
    assert.ok((await repo.releaseHold(hold.hold.id, actor, new Date())).ok);
    assert.deepEqual(await repo.releaseHold(hold.hold.id, actor, new Date()), { ok: false, error: "PRIVACY_HOLD_ALREADY_RELEASED" });
    assert.ok((await anonymize(f)).ok, `${scope} released → anonymize proceeds`);
  }
  assert.deepEqual(await repo.createHold({ scopeType: "customer", scopeId: randomUUID(), holdType: "legal", reason: "inconnu" }, actor, new Date()), { ok: false, error: "PRIVACY_SUBJECT_NOT_FOUND" });
});

test("PostgreSQL double submit is idempotent: one executed event, the second call returns it (D10)", async () => {
  const f = await seed();
  const [a, b] = await Promise.all([anonymize(f), anonymize(f)]);
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.equal(a.event.eventId, b.event.eventId);
  assert.deepEqual([a.alreadyAnonymized, b.alreadyAnonymized].sort(), [false, true]);
  assert.equal((await db.select().from(anonymizationEvents).where(eq(anonymizationEvents.subjectId, f.customerId))).length, 1);
  const third = await anonymize(f, "anything");
  assert.ok(third.ok && third.alreadyAnonymized, "already anonymized wins over the confirmation (name is now the pseudonym)");
});

test("PostgreSQL concurrent anonymize and hold create serialize on the subject lock", async () => {
  for (let i = 0; i < 3; i += 1) {
    const f = await seed();
    const [anon, hold] = await Promise.all([anonymize(f), repo.createHold({ scopeType: "customer", scopeId: f.customerId, holdType: "dispute", reason: "litige" }, actor, new Date())]);
    assert.ok(hold.ok, "the hold always lands");
    if (!hold.ok) continue;
    const [event] = await db.select().from(anonymizationEvents).where(eq(anonymizationEvents.subjectId, f.customerId));
    if (anon.ok) assert.ok(event && event.executedAt! <= new Date(hold.hold.startedAt), "anonymized first, hold after");
    else assert.deepEqual(anon, { ok: false, error: "PRIVACY_RETENTION_HOLD_ACTIVE" });
  }
});

test("PostgreSQL anonymized subject leaves lists, search, alerts and the request queue, but its payments still count (D5)", async () => {
  const f = await seed();
  await db.update(customers).set({ archivedAt: null }).where(eq(customers.id, f.customerId));
  const finance = new DrizzleFinanceRepository(db, options);
  const listed = async () => (await new DrizzleCustomersRepository(db, options).listActive()).some((c) => c.id === f.customerId);
  assert.ok(await listed(), "visible before");
  await db.update(customers).set({ archivedAt: new Date() }).where(eq(customers.id, f.customerId));
  assert.ok((await anonymize(f)).ok);
  assert.equal(await listed(), false);
  assert.equal((await new DrizzleCustomersRepository(db, options).searchActive(f.whatsapp)).length, 0);
  const alerts = await new DrizzleDashboardAlertsRepository(db, finance).snapshot(new Date());
  assert.equal(alerts.owners.some((o) => o.customerId === f.customerId), false);
  const queue = await new DrizzleAdminRequestsRepository(db, options).listQueue({});
  assert.equal(queue.some((r) => r.id === f.requestId), false, "anonymized prospect's request leaves the queue");
  const analytics = await new DrizzleDashboardAnalyticsRepository(db, finance).snapshot(new Date(Date.now() - 365 * DAY), new Date(Date.now() + DAY));
  const view = analytics.finance.find((v) => v.subscriptionId === f.subscriptionId);
  assert.ok(view && view.confirmedPaidXaf === 50000, "revenue aggregates still include the payment");
});

test("PostgreSQL purge: only after purge_after, storage before tombstone, idempotent, skips holds, proof files untouched (D3)", async () => {
  const f = await seed();
  assert.ok((await anonymize(f)).ok);
  const early = await repo.purgeDue(new Date(), 50, removeStoredObject, [f.privateDocId]);
  assert.deepEqual(early, { scanned: 0, purged: 0, skippedHold: 0, failed: 0 }, "nothing before purge_after");
  const later = new Date(Date.now() + 31 * DAY);
  const hold = await repo.createHold({ scopeType: "document", scopeId: f.privateDocId, holdType: "accounting", reason: "contrôle" }, actor, new Date());
  assert.deepEqual(await repo.purgeDue(later, 50, removeStoredObject, [f.privateDocId]), { scanned: 1, purged: 0, skippedHold: 1, failed: 0 });
  assert.equal(removed.has(f.storageKey), false);
  if (hold.ok) await repo.releaseHold(hold.hold.id, actor, new Date());
  assert.deepEqual(await repo.purgeDue(later, 50, removeStoredObject, [f.privateDocId]), { scanned: 1, purged: 1, skippedHold: 0, failed: 0 });
  assert.ok(removed.has(f.storageKey));
  const [doc] = await db.select().from(documents).where(eq(documents.id, f.privateDocId));
  assert.equal(doc?.status, "purged"); assert.equal(doc?.currentVersionId, null);
  assert.equal((await db.select().from(documentVersions).where(eq(documentVersions.documentId, f.privateDocId))).length, 0);
  assert.deepEqual(await repo.purgeDue(later, 50, removeStoredObject, [f.privateDocId]), { scanned: 0, purged: 0, skippedHold: 0, failed: 0 }, "idempotent");
  assert.equal((await db.select().from(documents).where(eq(documents.id, f.proofDocId)))[0]?.status, "available");
});

test("PostgreSQL replay after a simulated restore re-applies the plan; twice = same state (rule 7)", async () => {
  const f = await seed();
  const result = await anonymize(f);
  assert.ok(result.ok);
  if (!result.ok) return;
  const anonymized = await subjectState(f);
  // Simulated restore: the subject and its document come back as they were before the anonymization.
  await db.update(customers).set({ fullName: f.name, whatsapp: f.whatsapp, email: f.email, anonymizedAt: null }).where(eq(customers.id, f.customerId));
  await db.update(prospects).set({ fullName: f.name, whatsapp: f.whatsapp, anonymizedAt: null }).where(eq(prospects.id, f.prospectId));
  await db.update(documents).set({ status: "available", purgeAfter: null }).where(eq(documents.id, f.privateDocId));
  await db.update(notificationEmailOutbox).set({ bodyText: `Rappel ${f.name}` }).where(eq(notificationEmailOutbox.dedupeKey, `privacy-${f.tag}-2`));
  await db.delete(anonymizationEvents).where(eq(anonymizationEvents.id, result.event.eventId));
  assert.ok(await repo.replay(result.event, new Date()));
  const once = await subjectState(f);
  assert.ok(await repo.replay(result.event, new Date()));
  assert.equal(await subjectState(f), once, "replay twice = same state");
  assert.equal(once.replace(/"documents":.*$/, ""), anonymized.replace(/"documents":.*$/, ""), "same identity/health end state as the original run");
  assert.equal((await db.select().from(anonymizationEvents).where(eq(anonymizationEvents.id, result.event.eventId))).length, 1, "event row restored once");
  const [doc] = await db.select().from(documents).where(eq(documents.id, f.privateDocId));
  assert.equal(doc?.status, "pending_purge");
  assert.ok(doc!.purgeAfter! <= new Date(), "restored files are due at once");
});

test("PostgreSQL audit rows and anonymization metadata carry no name, WhatsApp or e-mail", async () => {
  const f = await seed();
  const hold = await repo.createHold({ scopeType: "customer", scopeId: f.customerId, holdType: "legal", reason: `motif ${f.name} ${f.whatsapp}` }, actor, new Date());
  if (hold.ok) await repo.releaseHold(hold.hold.id, actor, new Date());
  assert.ok((await anonymize(f)).ok);
  const audits = JSON.stringify(await db.select().from(auditEvents).where(and(eq(auditEvents.actorUserId, userId), inArray(auditEvents.eventType, ["privacy.subject_anonymized", "privacy.hold_created", "privacy.hold_released", "privacy.subject_archived"]))));
  const metadata = JSON.stringify(await db.select().from(anonymizationEvents).where(eq(anonymizationEvents.subjectId, f.customerId)));
  for (const text of [audits, metadata]) for (const pii of [f.name, f.whatsapp, f.email, "motif"]) assert.equal(text.includes(pii), false, `${pii} leaked`);
  assert.ok(audits.includes("privacy.subject_anonymized") && audits.includes("privacy.hold_created"));
});

test("PostgreSQL replay reads journal ∪ DB: an event lost with the restored DB is replayed from the journal, twice = same state (D11)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "kfit-privacy-it-"));
  try {
    const journal = createPrivacyJournal(dir)!;
    const failures: string[] = [];
    const service = new PrivacyService(repo, journal, (type) => failures.push(type));
    const f = await seed();
    const result = await service.anonymize("customer", f.customerId, f.name, actor);
    assert.ok(result.ok && !result.alreadyAnonymized); assert.deepEqual(failures, []);
    if (!result.ok) return;
    const raw = await readFile(path.join(dir, PRIVACY_JOURNAL_FILE), "utf8");
    assert.equal(raw.trim().split("\n").length, 1);
    for (const pii of [f.name, f.whatsapp, f.email]) assert.equal(raw.includes(pii), false, `${pii} in journal`);
    assert.ok(raw.includes(f.prospectId), "linked prospect recorded");

    const anonymized = await subjectState(f);
    // Restore from a backup taken before the anonymization: the subject is back and the DB event row is gone.
    await db.update(customers).set({ fullName: f.name, whatsapp: f.whatsapp, email: f.email, anonymizedAt: null }).where(eq(customers.id, f.customerId));
    await db.update(prospects).set({ fullName: f.name, whatsapp: f.whatsapp, anonymizedAt: null }).where(eq(prospects.id, f.prospectId));
    await db.update(documents).set({ status: "available", purgeAfter: null }).where(eq(documents.id, f.privateDocId));
    await db.delete(anonymizationEvents).where(eq(anonymizationEvents.id, result.event.eventId));
    const since = new Date(result.event.executedAt.getTime() - 1000);
    const deps = { repository: repo, journal, removeStoredObject };
    const first = await runPrivacyReplay(deps, since, new Date());
    assert.equal(first.fromJournalOnly, 1); assert.ok(first.replayed >= 1); assert.equal(first.missingSubject, 0);
    const once = await subjectState(f);
    assert.equal(once.replace(/"documents":.*$/, ""), anonymized.replace(/"documents":.*$/, ""));
    const second = await runPrivacyReplay(deps, since, new Date());
    assert.equal(second.fromJournalOnly, 0, "the replayed event is back in the DB");
    assert.equal(await subjectState(f), once, "replay twice = same state");
    assert.ok(removed.has(f.storageKey), "restored private file purged by the replay");
    const replayAudit = JSON.stringify(await db.execute(sql`select metadata_json from audit_events where event_type = 'privacy.replay_run' and created_at >= ${startedAt}`).then((r) => r.rows));
    for (const pii of [f.name, f.whatsapp, f.email]) assert.equal(replayAudit.includes(pii), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("PostgreSQL purge job (S7.2 runner work) purges a due document and audits counts only", async () => {
  const f = await seed();
  assert.ok((await anonymize(f)).ok);
  const later = new Date(Date.now() + 31 * DAY);
  // Scoped to this fixture's document so the job never touches other pending_purge rows of the dev database.
  const job = privacyPurgeJob({
    purgeDue: (now, limit, remove) => repo.purgeDue(now, limit, remove, [f.privateDocId]),
    recordPurgeRun: (counts) => repo.recordPurgeRun(counts),
  }, removeStoredObject, () => later);
  assert.deepEqual(await job.work(), { scanned: 1, purged: 1, skippedHold: 0, failed: 0 });
  const [audit] = (await db.execute(sql`select metadata_json from audit_events where event_type = 'privacy.purge_run' and created_at >= ${startedAt} order by created_at desc limit 1`)).rows;
  assert.deepEqual(audit?.metadata_json, { scanned: 1, purged: 1, skippedHold: 0, failed: 0 });
});
