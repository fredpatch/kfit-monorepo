import "dotenv/config";
import { assertLocalTestDatabase } from "../../../testing/integration-fixtures.js";
import assert from "node:assert/strict";
import { createHash, randomUUID, createHmac } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import net, { type AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { before, after, test } from "node:test";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { PaymentProof, PaymentProofLinkResponse } from "@kfit/shared";
import { db, pool } from "../../../db/client.js";
import { users, auditEvents } from "../../../db/schema/auth.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { services } from "../../../db/schema/catalogue.js";
import {
  paymentProofs,
  paymentEvents,
  paymentAllocations,
  paymentPlans,
  installments,
} from "../../../db/schema/finance.js";
import {
  documents,
  documentVersions,
  secureAccessTokens,
  externalAccessEvents,
} from "../../../db/schema/documents.js";
import { PrivateDocumentStorage } from "../../documents/services/document-storage.service.js";
import { DrizzleDocumentsRepository } from "../../documents/repositories/documents.repository.js";
import {
  hashDocumentBearer,
  createDocumentBearer,
} from "../../documents/services/document-token.crypto.js";
import { FinanceService } from "../../finance/services/finance.service.js";
import { DrizzleFinanceRepository } from "../../finance/repositories/finance.repository.js";
import { DrizzlePaymentProofsRepository } from "../repositories/payment-proofs.repository.js";
import { PaymentProofsService } from "../services/payment-proofs.service.js";
import type {
  ProofAction,
  ProofActor,
  ProofResult,
} from "../services/payment-proofs.types.js";

const userId = randomUUID(),
  customerId = randomUUID(),
  serviceId = randomUUID(),
  subIds: string[] = [];
const now = new Date("2030-10-22T12:00:00Z"),
  at = (offset: number) => new Date(now.getTime() + offset);
const options = {
  auditHashPepper: "synthetic-proof-audit-pepper",
  tokenPepper: "synthetic-proof-token-pepper",
};
const actor = {
    userId,
    requestId: randomUUID(),
    ipAddress: "192.0.2.63",
    userAgent: `synthetic-proof-${userId}`,
  },
  visitor: ProofActor = { ...actor, userId: null };
let safe = false,
  root = "",
  storage: PrivateDocumentStorage,
  repo: DrizzlePaymentProofsRepository,
  scans = 0;
const scanner = net.createServer((socket) => {
  let buffer = Buffer.alloc(0),
    started = false;
  const chunks: Buffer[] = [];
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!started) {
      if (buffer.length < 10) return;
      assert.equal(buffer.subarray(0, 10).toString(), "zINSTREAM\0");
      buffer = buffer.subarray(10);
      started = true;
    }
    while (buffer.length >= 4) {
      const length = buffer.readUInt32BE(0);
      if (buffer.length < length + 4) return;
      if (length === 0) {
        scans++;
        const infected = Buffer.concat(chunks).includes(
          Buffer.from("synthetic-infected"),
        );
        socket.end(
          infected ? "stream: Synthetic.Test FOUND\0" : "stream: OK\0",
        );
        return;
      }
      chunks.push(buffer.subarray(4, length + 4));
      buffer = buffer.subarray(length + 4);
    }
  });
});
before(async () => {
  assertLocalTestDatabase();
  safe = true;
  root = await mkdtemp(path.join(os.tmpdir(), "kfit-proof-"));
  scanner.listen(0, "127.0.0.1");
  await once(scanner, "listening");
  storage = new PrivateDocumentStorage({
    root,
    clamavHost: "127.0.0.1",
    clamavPort: (scanner.address() as AddressInfo).port,
  });
  repo = repoAt();
  await db.insert(users).values({
    id: userId,
    email: `proof-${userId}@example.invalid`,
    passwordHash: "synthetic",
    role: "admin",
    status: "active",
  });
  await db.insert(customers).values({
    id: customerId,
    fullName: "Synthetic Proof Customer",
    whatsapp: "+241000006363",
  });
  await db.insert(services).values({
    id: serviceId,
    name: "Synthetic Proof Service",
    slug: `proof-${serviceId}`,
    pricingMode: "quote",
    deliveryType: "time_based",
    capacityMode: "unlimited",
  });
});
after(async () => {
  try {
    if (!safe) return;
    const proofs = subIds.length
      ? await db
          .select()
          .from(paymentProofs)
          .where(inArray(paymentProofs.subscriptionId, subIds))
      : [];
    const tokens = subIds.length
      ? await db
          .select()
          .from(secureAccessTokens)
          .where(inArray(secureAccessTokens.resourceId, subIds))
      : [];
    await db
      .delete(externalAccessEvents)
      .where(
        eq(
          externalAccessEvents.userAgentHash,
          createHmac("sha256", options.auditHashPepper)
            .update(actor.userAgent)
            .digest("hex"),
        ),
      );
    if (tokens.length) {
      await db.delete(externalAccessEvents).where(
        inArray(
          externalAccessEvents.secureAccessTokenId,
          tokens.map((t) => t.id),
        ),
      );
      await db.delete(secureAccessTokens).where(
        inArray(
          secureAccessTokens.id,
          tokens.map((t) => t.id),
        ),
      );
    }
    let remaining = [...proofs];
    while (remaining.length) {
      const parents = new Set(remaining.map((p) => p.supersedesProofId)),
        leaves = remaining.filter((p) => !parents.has(p.id));
      assert.ok(leaves.length);
      await db.delete(paymentProofs).where(
        inArray(
          paymentProofs.id,
          leaves.map((p) => p.id),
        ),
      );
      const removed = new Set(leaves.map((p) => p.id));
      remaining = remaining.filter((p) => !removed.has(p.id));
    }
    if (proofs.length) {
      const ids = proofs.map((p) => p.documentId);
      await db
        .delete(documentVersions)
        .where(inArray(documentVersions.documentId, ids));
      await db.delete(documents).where(inArray(documents.id, ids));
    }
    if (subIds.length) {
      const events = await db
        .selectDistinct({ id: paymentAllocations.paymentEventId })
        .from(paymentAllocations)
        .where(inArray(paymentAllocations.subscriptionId, subIds));
      await db
        .delete(paymentAllocations)
        .where(inArray(paymentAllocations.subscriptionId, subIds));
      if (events.length) {
        const ids = events.map((e) => e.id);
        await db
          .delete(paymentEvents)
          .where(
            and(
              inArray(paymentEvents.id, ids),
              isNotNull(paymentEvents.correctionOfEventId),
            ),
          );
        await db.delete(paymentEvents).where(inArray(paymentEvents.id, ids));
      }
      const plans = await db
        .select()
        .from(paymentPlans)
        .where(inArray(paymentPlans.subscriptionId, subIds));
      if (plans.length)
        await db.delete(installments).where(
          inArray(
            installments.paymentPlanId,
            plans.map((p) => p.id),
          ),
        );
      await db
        .delete(paymentPlans)
        .where(inArray(paymentPlans.subscriptionId, subIds));
      await db.delete(subscriptions).where(inArray(subscriptions.id, subIds));
    }
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
    if (proofs.length)
      await db.delete(auditEvents).where(
        inArray(
          auditEvents.entityId,
          proofs.map((p) => p.id),
        ),
      );
    if (tokens.length)
      await db.delete(auditEvents).where(
        inArray(
          auditEvents.entityId,
          tokens.map((t) => t.id),
        ),
      );
    await db.delete(services).where(eq(services.id, serviceId));
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(users).where(eq(users.id, userId));
  } finally {
    if (scanner.listening)
      await new Promise<void>((resolve, reject) =>
        scanner.close((error) => (error ? reject(error) : resolve())),
      );
    if (root) {
      const absolute = path.resolve(root),
        temporary = path.resolve(os.tmpdir());
      assert.equal(path.dirname(absolute), temporary);
      assert.ok(path.basename(absolute).startsWith("kfit-proof-"));
      await rm(absolute, { recursive: true, force: true });
    }
    await pool.end();
  }
});
const repoAt = (clock = () => new Date(now)) =>
  new DrizzlePaymentProofsRepository(db, options, storage, clock);
const serviceAt = (repository = repo) =>
  new PaymentProofsService(repository, storage);
const call = (
  id: string,
  action: ProofAction,
  body: unknown = {},
  caller: ProofActor = actor,
  repository = repo,
) => serviceAt(repository).execute(id, action, body, caller);
function proof(r: ProofResult): PaymentProof {
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok || !("body" in r) || !("proof" in r.body))
    throw new Error("Missing proof");
  return r.body.proof;
}
const fail = (error: string) => ({ ok: false, error });
const claims = (amount = 20000) => ({
  claimedAmountXaf: amount,
  claimedPaymentMethod: "mobile_money",
  claimedOccurredAt: at(-1000).toISOString(),
  claimedExternalReference: "Synthetic claimed reference",
});
const facts = (amount = 20000) => ({
  confirmedAmountXaf: amount,
  confirmedPaymentMethod: "cash",
  confirmedOccurredAt: now.toISOString(),
  externalReference: "Synthetic confirmed reference",
  reviewNote: "Synthetic private review note",
});
const payload = (marker: string = randomUUID()) => ({
  bytes: Buffer.from(`%PDF-1.7\nSynthetic ${marker}\n%%EOF`),
  mimeType: "application/pdf",
  originalFilename: "preuve-synthétique.pdf",
});
async function owner(amount = 20000, status = "active") {
  const id = randomUUID();
  subIds.push(id);
  await db.insert(subscriptions).values({
    id,
    reference: `SUB-PROOF-${id}`,
    customerId,
    serviceId,
    status,
    agreedPriceXaf: amount,
    createdByUserId: userId,
  });
  return id;
}
async function link(
  subscriptionId?: string,
  supersedesProofId: string | null = null,
  repository = repo,
): Promise<PaymentProofLinkResponse & { subscriptionId: string }> {
  const id = subscriptionId ?? (await owner()),
    r = await call(
      id,
      "issue-link",
      { expiresAt: at(3600000).toISOString(), supersedesProofId },
      actor,
      repository,
    );
  assert.ok(r.ok && "body" in r && "token" in r.body, JSON.stringify(r));
  if (!r.ok || !("body" in r) || !("token" in r.body))
    throw new Error("Missing proof link");
  return { ...r.body, subscriptionId: id };
}
async function upload(
  l?: Awaited<ReturnType<typeof link>>,
  amount = 20000,
  file = payload(),
) {
  const issued = l ?? (await link()),
    existing = new Set(
      (
        await db
          .select({ id: paymentProofs.id })
          .from(paymentProofs)
          .where(eq(paymentProofs.subscriptionId, issued.subscriptionId))
      ).map((p) => p.id),
    );
  const result = await serviceAt().upload(
    issued.token,
    claims(amount),
    file,
    visitor,
  );
  assert.ok(result.ok, JSON.stringify(result));
  const rows = await db
    .select()
    .from(paymentProofs)
    .where(eq(paymentProofs.subscriptionId, issued.subscriptionId))
    .orderBy(paymentProofs.submittedAt, paymentProofs.id);
  const row = rows.find(
    (p) =>
      !existing.has(p.id) &&
      p.supersedesProofId === issued.link.supersedesProofId,
  );
  assert.ok(row);
  return { issued, p: proof(await call(row.id, "read")), file };
}
const finance = () =>
  new FinanceService(new DrizzleFinanceRepository(db, options, () => now));
async function plan(id: string, amounts = [8000, 12000]) {
  const r = await finance().execute(
    id,
    "create",
    {
      installments: amounts.map((amountXaf, index) => ({
        amountXaf,
        dueDate: at(1000 + index * 1000).toISOString(),
      })),
    },
    actor,
  );
  assert.ok(r.ok);
  if (!r.ok) throw new Error("Missing plan");
  assert.ok(
    (
      await finance().execute(
        r.body.finance.plans[0]!.id,
        "activate",
        {},
        actor,
      )
    ).ok,
  );
}
const balance = (id: string) => finance().execute(id, "read", {}, actor);
const manual = (id: string, amount = 20000) =>
  finance().execute(
    id,
    "record",
    {
      amountXaf: amount,
      paymentMethod: "cash",
      occurredAt: now.toISOString(),
      idempotencyKey: randomUUID(),
    },
    actor,
  );
const sub = async (id: string) =>
  (await db.select().from(subscriptions).where(eq(subscriptions.id, id)))[0]!;
async function rawProof(id: string) {
  return (
    await db.select().from(paymentProofs).where(eq(paymentProofs.id, id))
  )[0]!;
}
function brokenAudit(prefix: string) {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const database = new Proxy(db, {
    get(target, key, receiver) {
      if (key === "transaction")
        return <T>(
          work: (tx: Tx) => Promise<T>,
          config?: Parameters<typeof db.transaction>[1],
        ) =>
          target.transaction(
            (tx) =>
              work(
                new Proxy(tx, {
                  get(transaction, member, txReceiver) {
                    if (member === "insert")
                      return (table: Parameters<Tx["insert"]>[0]) => {
                        const insert = transaction.insert(table);
                        if (table !== auditEvents) return insert;
                        return new Proxy(insert, {
                          get(builder, method, builderReceiver) {
                            if (method === "values")
                              return (v: Record<string, unknown>) =>
                                Reflect.apply(builder.values, builder, [
                                  {
                                    ...v,
                                    ...(typeof v.eventType === "string" &&
                                    v.eventType.startsWith(prefix)
                                      ? { actorUserId: randomUUID() }
                                      : {}),
                                  },
                                ]);
                            return Reflect.get(
                              builder,
                              method,
                              builderReceiver,
                            );
                          },
                        });
                      };
                    return Reflect.get(transaction, member, txReceiver);
                  },
                }),
              ),
            config,
          );
      return Reflect.get(target, key, receiver);
    },
  });
  return new DrizzlePaymentProofsRepository(
    database,
    options,
    storage,
    () => now,
  );
}

test("PostgreSQL proof link is hash-only, exact-scope, metadata is non-consuming and safe", async () => {
  const l = await link(),
    [token] = await db
      .select()
      .from(secureAccessTokens)
      .where(eq(secureAccessTokens.id, l.link.id));
  assert.ok(token);
  assert.equal(
    token.tokenHash,
    hashDocumentBearer(l.token, options.tokenPepper),
  );
  assert.ok(!JSON.stringify(token).includes(l.token));
  assert.equal(token.resourceId, l.subscriptionId);
  assert.equal(token.action, "payment_proof_upload");
  const r = await call(l.token, "metadata", {}, visitor);
  assert.ok(r.ok && "body" in r);
  if (!r.ok || !("body" in r)) throw new Error("Missing metadata");
  assert.deepEqual(
    Object.keys(r.body).sort(),
    [
      "subscriptionReference",
      "expiresAt",
      "customerMessage",
      "acceptedMimeTypes",
      "maxBytes",
    ].sort(),
  );
  assert.ok(!JSON.stringify(r.body).includes("Synthetic Proof Customer"));
  assert.equal(
    (
      await db
        .select()
        .from(secureAccessTokens)
        .where(eq(secureAccessTokens.id, l.link.id))
    )[0]?.useCount,
    0,
  );
});
test("PostgreSQL clean upload creates pending evidence/private document, consumes token and creates zero money", async () => {
  const l = await link(),
    before = await sub(l.subscriptionId),
    r = await upload(l);
  assert.equal(r.p.status, "pending_review");
  assert.equal(r.p.paymentEventId, null);
  assert.equal(r.p.confirmedAmountXaf, null);
  const [token] = await db
    .select()
    .from(secureAccessTokens)
    .where(eq(secureAccessTokens.id, l.link.id));
  assert.equal(token?.useCount, 1);
  assert.ok(token?.usedAt);
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, r.p.documentId));
  assert.equal(doc?.ownerType, "payment_proof");
  assert.equal(doc?.ownerId, r.p.id);
  assert.equal(doc?.sensitivity, "private");
  const view = await balance(l.subscriptionId);
  assert.ok(view.ok);
  if (view.ok) {
    assert.equal(view.body.finance.paymentHistory.length, 0);
    assert.equal(view.body.finance.confirmedPaidXaf, 0);
  }
  assert.deepEqual(await sub(l.subscriptionId), before);
});
test("PostgreSQL stored proof bytes match SHA-256/size and opaque storage key; admin download returns original bytes", async () => {
  const r = await upload(),
    [f] = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, r.p.documentVersionId));
  assert.ok(f);
  assert.match(f.storageKey, /^[0-9a-f-]{36}\.pdf$/);
  assert.ok(!f.storageKey.includes("preuve"));
  const bytes = await readFile(path.join(root, f.storageKey));
  assert.deepEqual(bytes, r.file.bytes);
  assert.equal((await stat(path.join(root, f.storageKey))).size, r.p.sizeBytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), r.p.sha256);
  const result = await call(r.p.id, "document");
  assert.ok(result.ok && "binary" in result);
  if (result.ok && "binary" in result)
    assert.deepEqual(result.binary.bytes, bytes);
});
test("PostgreSQL upload replay cannot create another proof/file and does not rescan", async () => {
  const r = await upload(),
    count = scans,
    files = await readdir(root);
  assert.deepEqual(
    await serviceAt().upload(r.issued.token, claims(), payload(), visitor),
    fail("PAYMENT_PROOF_LINK_CONSUMED"),
  );
  assert.equal(scans, count);
  assert.deepEqual(await readdir(root), files);
  assert.equal(
    (
      await db
        .select()
        .from(paymentProofs)
        .where(eq(paymentProofs.subscriptionId, r.issued.subscriptionId))
    ).length,
    1,
  );
});
for (const mode of ["expired", "revoked"] as const)
  test(`PostgreSQL ${mode} proof link rejects metadata/upload without scan`, async () => {
    const l = await link(),
      count = scans,
      repository = mode === "expired" ? repoAt(() => at(3600000)) : repo;
    if (mode === "revoked")
      assert.ok((await call(l.link.id, "revoke-link")).ok);
    const expected =
      mode === "expired"
        ? "PAYMENT_PROOF_LINK_EXPIRED"
        : "PAYMENT_PROOF_LINK_REVOKED";
    assert.deepEqual(
      await call(l.token, "metadata", {}, visitor, repository),
      fail(expected),
    );
    assert.deepEqual(
      await serviceAt(repository).upload(l.token, claims(), payload(), visitor),
      fail(expected),
    );
    assert.equal(scans, count);
  });
test("PostgreSQL wrong-action/unknown tokens are rejected with safe failed-access evidence", async () => {
  const id = await owner(),
    bearer = createDocumentBearer();
  await db.insert(secureAccessTokens).values({
    tokenHash: hashDocumentBearer(bearer, options.tokenPepper),
    resourceType: "subscription",
    resourceId: id,
    action: "onboarding_consent",
    expiresAt: at(10000),
    maxUses: 1,
  });
  assert.deepEqual(
    await call(bearer, "metadata", {}, visitor),
    fail("PAYMENT_PROOF_LINK_INVALID"),
  );
  assert.deepEqual(
    await call("malformed", "metadata", {}, visitor),
    fail("PAYMENT_PROOF_LINK_INVALID"),
  );
});
for (const mode of [
  "infected",
  "signature",
  "extension",
  "empty",
  "oversize",
] as const)
  test(`PostgreSQL ${mode} upload creates no proof/document and does not consume token`, async () => {
    const l = await link(),
      original = payload(
        mode === "infected" ? "synthetic-infected" : randomUUID(),
      ),
      files = await readdir(root);
    const data =
      mode === "signature"
        ? { ...original, mimeType: "image/jpeg", originalFilename: "proof.jpg" }
        : mode === "extension"
          ? { ...original, originalFilename: "proof.jpg" }
          : mode === "empty"
            ? { ...original, bytes: Buffer.alloc(0) }
            : mode === "oversize"
              ? { ...original, bytes: Buffer.alloc(10 * 1024 * 1024 + 1) }
              : original;
    assert.deepEqual(
      await serviceAt().upload(l.token, claims(), data, visitor),
      fail(
        mode === "infected"
          ? "PAYMENT_PROOF_MALWARE_DETECTED"
          : "PAYMENT_PROOF_UPLOAD_INVALID",
      ),
    );
    assert.equal(
      (
        await db
          .select()
          .from(paymentProofs)
          .where(eq(paymentProofs.subscriptionId, l.subscriptionId))
      ).length,
      0,
    );
    assert.deepEqual(await readdir(root), files);
    assert.equal(
      (
        await db
          .select()
          .from(secureAccessTokens)
          .where(eq(secureAccessTokens.id, l.link.id))
      )[0]?.useCount,
      0,
    );
  });
test("PostgreSQL full confirmation creates exactly one S6.1 payment with FIFO allocations and exact proof linkage", async () => {
  const r = await upload();
  await plan(r.issued.subscriptionId);
  const before = await sub(r.issued.subscriptionId),
    p = proof(await call(r.p.id, "confirm", facts()));
  assert.equal(p.status, "confirmed");
  assert.ok(p.paymentEventId);
  assert.equal(p.claimedPaymentMethod, "mobile_money");
  assert.equal(p.confirmedPaymentMethod, "cash");
  const view = await balance(r.issued.subscriptionId);
  assert.ok(view.ok);
  if (view.ok) {
    assert.equal(view.body.finance.confirmedPaidXaf, 20000);
    assert.equal(view.body.finance.paymentHistory.length, 1);
    assert.equal(view.body.finance.paymentHistory[0]?.id, p.paymentEventId);
    assert.deepEqual(
      view.body.finance.paymentHistory[0]?.allocations.map((a) => a.amountXaf),
      [8000, 12000],
    );
  }
  assert.deepEqual(await sub(r.issued.subscriptionId), before);
});
test("PostgreSQL partial confirmation creates only reviewed amount with no residual proof money", async () => {
  const r = await upload();
  await plan(r.issued.subscriptionId);
  const p = proof(await call(r.p.id, "partially-confirm", facts(6000)));
  assert.equal(p.status, "partially_confirmed");
  assert.equal(p.confirmedAmountXaf, 6000);
  const view = await balance(r.issued.subscriptionId);
  assert.ok(view.ok);
  if (view.ok) {
    assert.equal(view.body.finance.confirmedPaidXaf, 6000);
    assert.equal(view.body.finance.remainingXaf, 14000);
    assert.equal(view.body.finance.paymentHistory.length, 1);
  }
  assert.deepEqual(
    await call(p.id, "confirm", facts()),
    fail("PAYMENT_PROOF_INVALID_STATE"),
  );
});
for (const action of ["confirm", "partially-confirm"] as const)
  test(`PostgreSQL ${action} amount rule is explicit and rejects zero/full/greater partial amounts`, async () => {
    const r = await upload();
    await plan(r.issued.subscriptionId);
    const before = await rawProof(r.p.id),
      values = action === "confirm" ? [19999, 20001] : [20000, 20001];
    for (const amount of values)
      assert.deepEqual(
        await call(r.p.id, action, facts(amount)),
        fail("PAYMENT_PROOF_AMOUNT_INVALID"),
      );
    assert.deepEqual(await rawProof(r.p.id), before);
  });
test("PostgreSQL overpayment review rolls back proof and all finance facts", async () => {
  const id = await owner(10000),
    r = await upload(await link(id));
  await plan(id, [10000]);
  const before = await rawProof(r.p.id),
    view = await balance(id);
  assert.deepEqual(
    await call(r.p.id, "confirm", facts()),
    fail("PAYMENT_PROOF_FINANCE_CONFLICT"),
  );
  assert.deepEqual(await rawProof(r.p.id), before);
  assert.deepEqual(await balance(id), view);
});
test("PostgreSQL confirmation without eligible plan rejects while evidence remains pending", async () => {
  const r = await upload();
  assert.deepEqual(
    await call(r.p.id, "confirm", facts()),
    fail("PAYMENT_PROOF_FINANCE_CONFLICT"),
  );
  assert.equal((await rawProof(r.p.id)).status, "pending_review");
});
for (const [action, status] of [
  ["reject", "rejected"],
  ["mark-duplicate", "duplicate"],
  ["request-correction", "correction_requested"],
] as const)
  test(`PostgreSQL ${action} creates no money or subscription transition`, async () => {
    const r = await upload(),
      before = await sub(r.issued.subscriptionId),
      view = await balance(r.issued.subscriptionId);
    const p = proof(
      await call(r.p.id, action, {
        reviewNote: "Synthetic private",
        ...(action === "request-correction"
          ? { customerMessage: "Synthetic public correction" }
          : {}),
      }),
    );
    assert.equal(p.status, status);
    assert.equal(p.paymentEventId, null);
    assert.equal(p.confirmedAmountXaf, null);
    assert.deepEqual(await balance(r.issued.subscriptionId), view);
    assert.deepEqual(await sub(r.issued.subscriptionId), before);
  });
test("PostgreSQL correction replacement creates new evidence, preserves old bytes and separates messages", async () => {
  const r = await upload();
  proof(
    await call(r.p.id, "request-correction", {
      reviewNote: "DO_NOT_EXPOSE_PRIVATE",
      customerMessage: "Upload clearer evidence",
    }),
  );
  const before = await rawProof(r.p.id),
    l = await link(r.issued.subscriptionId, r.p.id);
  const metadata = await call(l.token, "metadata", {}, visitor);
  assert.ok(metadata.ok && "body" in metadata);
  if (metadata.ok && "body" in metadata) {
    assert.ok(
      JSON.stringify(metadata.body).includes("Upload clearer evidence"),
    );
    assert.ok(!JSON.stringify(metadata.body).includes("DO_NOT_EXPOSE_PRIVATE"));
  }
  const replaced = await upload(l),
    old = await rawProof(r.p.id);
  assert.equal(replaced.p.supersedesProofId, r.p.id);
  assert.equal(replaced.p.status, "pending_review");
  assert.equal(old.status, "superseded");
  assert.deepEqual({ ...old, status: before.status }, before);
  const dl = await call(r.p.id, "document");
  assert.ok(dl.ok && "binary" in dl);
  if (dl.ok && "binary" in dl) assert.deepEqual(dl.binary.bytes, r.file.bytes);
});
test("PostgreSQL identical SHA in correction lineage is rejected without consuming token or storing another file", async () => {
  const r = await upload();
  proof(await call(r.p.id, "request-correction", {}));
  const l = await link(r.issued.subscriptionId, r.p.id),
    files = await readdir(root);
  assert.deepEqual(
    await serviceAt().upload(l.token, claims(), r.file, visitor),
    fail("PAYMENT_PROOF_DUPLICATE_UPLOAD"),
  );
  assert.deepEqual(await readdir(root), files);
  assert.equal((await rawProof(r.p.id)).status, "correction_requested");
  assert.equal(
    (
      await db
        .select()
        .from(secureAccessTokens)
        .where(eq(secureAccessTokens.id, l.link.id))
    )[0]?.useCount,
    0,
  );
});
test("PostgreSQL same SHA outside correction lineage is not globally assumed duplicate money", async () => {
  const a = await upload(),
    b = await upload(await link(a.issued.subscriptionId), 20000, a.file);
  assert.notEqual(a.p.id, b.p.id);
  assert.equal(a.p.sha256, b.p.sha256);
  assert.equal(b.p.status, "pending_review");
});
test("PostgreSQL concurrent correction tokens create only one active replacement", async () => {
  const r = await upload();
  proof(await call(r.p.id, "request-correction", {}));
  const a = await link(r.issued.subscriptionId, r.p.id),
    b = await link(r.issued.subscriptionId, r.p.id);
  const results = await Promise.all([
    serviceAt().upload(a.token, claims(), payload(), visitor),
    serviceAt().upload(b.token, claims(), payload(), visitor),
  ]);
  assert.equal(results.filter((x) => x.ok).length, 1);
  assert.equal(
    (
      await db
        .select()
        .from(paymentProofs)
        .where(eq(paymentProofs.supersedesProofId, r.p.id))
    ).length,
    1,
  );
});
test("PostgreSQL later S6.1 payment correction preserves reviewed proof and original private evidence", async () => {
  const r = await upload();
  await plan(r.issued.subscriptionId);
  const p = proof(await call(r.p.id, "confirm", facts())),
    before = await rawProof(p.id);
  assert.ok(p.paymentEventId);
  assert.ok(
    (
      await finance().execute(
        p.paymentEventId,
        "correct",
        {
          amountXaf: 2000,
          occurredAt: now.toISOString(),
          idempotencyKey: randomUUID(),
        },
        actor,
      )
    ).ok,
  );
  assert.deepEqual(await rawProof(p.id), before);
});
test("PostgreSQL mandatory concurrent double review creates one payment and allocation set", async () => {
  const r = await upload();
  await plan(r.issued.subscriptionId);
  const results = await Promise.all([
    call(r.p.id, "confirm", facts()),
    call(r.p.id, "confirm", facts()),
  ]);
  assert.equal(results.filter((x) => x.ok).length, 1);
  assert.ok(
    results.some((x) => !x.ok && x.error === "PAYMENT_PROOF_INVALID_STATE"),
  );
  const view = await balance(r.issued.subscriptionId);
  assert.ok(view.ok);
  if (view.ok) {
    assert.equal(view.body.finance.paymentHistory.length, 1);
    assert.equal(view.body.finance.confirmedPaidXaf, 20000);
    assert.equal(view.body.finance.paymentHistory[0]?.allocations.length, 2);
  }
});
test("PostgreSQL mandatory proof confirmation vs manual payment race cannot over-allocate final 20000", async () => {
  const r = await upload();
  await plan(r.issued.subscriptionId);
  const before = await sub(r.issued.subscriptionId),
    results = await Promise.all([
      call(r.p.id, "confirm", facts()),
      manual(r.issued.subscriptionId),
    ]);
  assert.equal(results.filter((x) => x.ok).length, 1);
  const view = await balance(r.issued.subscriptionId);
  assert.ok(view.ok);
  if (view.ok) {
    assert.equal(view.body.finance.confirmedPaidXaf, 20000);
    assert.equal(view.body.finance.remainingXaf, 0);
    assert.equal(view.body.finance.paymentHistory.length, 1);
  }
  assert.deepEqual(await sub(r.issued.subscriptionId), before);
});
for (const prefix of ["finance.payment_recorded", "payment_proof.confirmed"])
  test(`PostgreSQL ${prefix} audit FK failure rolls back payment, allocations, caches and proof review`, async () => {
    const r = await upload();
    await plan(r.issued.subscriptionId);
    const before = await rawProof(r.p.id),
      view = await balance(r.issued.subscriptionId);
    await assert.rejects(
      call(r.p.id, "confirm", facts(), actor, brokenAudit(prefix)),
    );
    assert.deepEqual(await rawProof(r.p.id), before);
    assert.deepEqual(await balance(r.issued.subscriptionId), view);
  });
test("PostgreSQL upload audit failure rolls back proof/document/token and cleans physical file", async () => {
  const l = await link(),
    files = await readdir(root),
    r = await serviceAt(brokenAudit("payment_proof.submitted")).upload(
      l.token,
      claims(),
      payload(),
      visitor,
    );
  assert.deepEqual(r, fail("PAYMENT_PROOF_ROUTE_UNEXPECTED_FAILURE"));
  assert.deepEqual(await readdir(root), files);
  assert.equal(
    (
      await db
        .select()
        .from(paymentProofs)
        .where(eq(paymentProofs.subscriptionId, l.subscriptionId))
    ).length,
    0,
  );
  assert.equal(
    (
      await db
        .select()
        .from(secureAccessTokens)
        .where(eq(secureAccessTokens.id, l.link.id))
    )[0]?.useCount,
    0,
  );
});
for (const status of [
  "onboarding",
  "ready_to_start",
  "active",
  "paused",
  "completed",
  "cancelled",
])
  test(`PostgreSQL review preserves subscription ${status} lifecycle exactly`, async () => {
    const id = await owner(20000, status),
      r = await upload(await link(id));
    await plan(id);
    const before = await sub(id);
    proof(await call(r.p.id, "confirm", facts()));
    assert.deepEqual(await sub(id), before);
  });
test("PostgreSQL generic proof audits exclude references, notes, messages, filenames, customer PII and bearer", async () => {
  const r = await upload();
  await plan(r.issued.subscriptionId);
  proof(await call(r.p.id, "confirm", facts()));
  const rows = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityId, r.p.id)),
    allowed = new Set([
      "proofId",
      "subscriptionId",
      "documentId",
      "documentVersionId",
      "paymentEventId",
      "amountXaf",
      "paymentMethod",
      "fromStatus",
      "toStatus",
      "tokenId",
    ]);
  assert.ok(rows.length >= 2);
  for (const row of rows) {
    assert.ok(
      Object.keys(row.metadataJson ?? {}).every((key) => allowed.has(key)),
    );
    const value = JSON.stringify(row.metadataJson);
    for (const secret of [
      r.issued.token,
      facts().externalReference,
      facts().reviewNote,
      claims().claimedExternalReference,
      "Synthetic Proof Customer",
      r.file.originalFilename,
    ])
      assert.ok(!value.includes(secret));
  }
});
test("PostgreSQL payment proof cannot acquire public sharing or mutate artifact via personalized documents", async () => {
  const r = await upload(),
    docs = new DrizzleDocumentsRepository(
      db,
      { ...options, verificationPepper: "synthetic" },
      () => now,
    );
  assert.deepEqual(
    await docs.execute(r.p.documentId, { action: "archive" }, actor),
    { ok: false, error: "DOCUMENT_NOT_FOUND" },
  );
  assert.deepEqual(
    await docs.execute(
      r.p.documentVersionId,
      { action: "issue-link", expiresAt: at(10000), maxUses: 3 },
      actor,
    ),
    { ok: false, error: "DOCUMENT_NOT_FOUND" },
  );
});
test("PostgreSQL proof list returns every proof of the subscription with its detail", async () => {
  const id = await owner(),
    a = await upload(await link(id)),
    b = await upload(await link(id));
  const listed = await call(id, "list");
  assert.ok(
    listed.ok && "body" in listed && "proofs" in listed.body,
    JSON.stringify(listed),
  );
  if (!listed.ok || !("body" in listed) || !("proofs" in listed.body))
    throw new Error("Missing proofs");
  assert.deepEqual(
    listed.body.proofs.map((p) => p.id).sort(),
    [a.p.id, b.p.id].sort(),
  );
  assert.equal(listed.body.links.length, 2);
});
