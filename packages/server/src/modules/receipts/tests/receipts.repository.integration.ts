import "dotenv/config";
import { assertLocalTestDatabase } from "../../../testing/integration-fixtures.js";
import { SubjectArchivedError } from "../../privacy/repositories/subject-freeze.js";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Receipt, ReceiptSnapshot } from "@kfit/shared";
import { db, pool } from "../../../db/client.js";
import { users, auditEvents } from "../../../db/schema/auth.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { services } from "../../../db/schema/catalogue.js";
import {
  receipts,
  businessDocumentCounters,
  paymentPlans,
  installments,
  paymentEvents,
  paymentAllocations,
} from "../../../db/schema/finance.js";
import {
  documents,
  documentVersions,
  secureAccessTokens,
  externalAccessEvents,
} from "../../../db/schema/documents.js";
import { DrizzleDocumentsRepository } from "../../documents/repositories/documents.repository.js";
import { DrizzleReceiptsRepository } from "../repositories/receipts.repository.js";
import { ReceiptsService } from "../services/receipts.service.js";
import type {
  ReceiptAction,
  ReceiptActor,
  ReceiptArtifacts,
  ReceiptResult,
} from "../services/receipts.types.js";
import { hashDocumentBearer } from "../../documents/services/document-token.crypto.js";
import { hashAuditContext } from "../../auth/services/audit.service.js";
import { DrizzleFinanceRepository } from "../../finance/repositories/finance.repository.js";
import { FinanceService } from "../../finance/services/finance.service.js";
const userId = randomUUID(),
  customerId = randomUUID(),
  serviceId = randomUUID(),
  subIds: string[] = [],
  year = 9300 + Math.floor(Math.random() * 300);
const base = new Date(`${year}-10-22T12:00:00.000Z`),
  options = {
    auditHashPepper: "synthetic-receipt-audit",
    tokenPepper: "synthetic-receipt-token",
  };
let offset = 0,
  safe = false;
const clock = () => new Date(base.getTime() + offset),
  tick = () => {
    offset += 1000;
    return clock();
  };
const actor: ReceiptActor = {
    userId,
    requestId: randomUUID(),
    ipAddress: "192.0.2.64",
    userAgent: `synthetic-receipts-${userId}`,
  },
  visitor = { ...actor, userId: null };
const files = new Map<string, Buffer>(),
  rendered: ReceiptSnapshot[] = [],
  tokenIds: string[] = [];
const artifacts: ReceiptArtifacts = {
  async render(s) {
    rendered.push(structuredClone(s));
    return Buffer.from("%PDF-synthetic-receipt\n" + JSON.stringify(s));
  },
  async persist(input) {
    const storageKey = randomUUID() + ".pdf";
    files.set(storageKey, input.bytes);
    return {
      storageKey,
      originalFilename: input.originalFilename,
      mimeType: "application/pdf",
      sizeBytes: input.bytes.length,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
    };
  },
  async read(key) {
    const bytes = files.get(key);
    assert.ok(bytes);
    return Buffer.from(bytes);
  },
  async remove(key) {
    files.delete(key);
  },
};
const repoAt = (port = artifacts, now = clock) =>
    new DrizzleReceiptsRepository(db, options, port, now),
  repo = repoAt();
const call = (
  id: string,
  action: ReceiptAction,
  body: unknown = {},
  caller = actor,
  repository = repo,
) => new ReceiptsService(repository).execute(id, action, body, caller);
const fail = (error: string) => ({ ok: false, error });
function receipt(result: ReceiptResult): Receipt {
  assert.ok(result.ok, JSON.stringify(result));
  if (!result.ok || !("body" in result) || !("receipt" in result.body))
    throw new Error("Missing receipt");
  return result.body.receipt;
}
const finance = () =>
  new FinanceService(new DrizzleFinanceRepository(db, options, clock));
const fa = { ...actor, userId };
before(async () => {
  assertLocalTestDatabase();
  // These isolated future partitions must be absent; never change another fixture's counter.
  assert.equal(
    (
      await db
        .select()
        .from(businessDocumentCounters)
        .where(
          and(
            eq(businessDocumentCounters.documentType, "receipt"),
            inArray(businessDocumentCounters.year, [year, year + 1]),
          ),
        )
    ).length,
    0,
  );
  safe = true;
  await db.insert(users).values({
    id: userId,
    email: `receipt-${userId}@example.invalid`,
    passwordHash: "synthetic",
    role: "admin",
    status: "active",
  });
  await db.insert(customers).values({
    id: customerId,
    fullName: "Synthetic Receipt Customer",
    whatsapp: "+241000006464",
  });
  await db.insert(services).values({
    id: serviceId,
    name: "Synthetic Receipt Service",
    slug: `receipt-${serviceId}`,
    pricingMode: "quote",
    deliveryType: "time_based",
    capacityMode: "unlimited",
  });
});
after(async () => {
  try {
    if (!safe) return;
    const rows = await db
        .select()
        .from(receipts)
        .where(eq(receipts.customerId, customerId)),
      ids = rows.map((r) => r.id),
      docIds = rows.map((r) => r.pdfDocumentId);
    const tokens = ids.length
      ? await db
          .select()
          .from(secureAccessTokens)
          .where(
            and(
              eq(secureAccessTokens.resourceType, "receipt"),
              inArray(secureAccessTokens.resourceId, ids),
            ),
          )
      : [];
    const tids = [...new Set([...tokenIds, ...tokens.map((t) => t.id)])];
    if (tids.length) {
      await db
        .delete(externalAccessEvents)
        .where(inArray(externalAccessEvents.secureAccessTokenId, tids));
      await db
        .delete(secureAccessTokens)
        .where(inArray(secureAccessTokens.id, tids));
    }
    await db
      .delete(externalAccessEvents)
      .where(
        eq(
          externalAccessEvents.userAgentHash,
          hashAuditContext(actor.userAgent, options.auditHashPepper)!,
        ),
      );
    if (ids.length) {
      await db.delete(receipts).where(inArray(receipts.id, ids));
      await db.delete(auditEvents).where(inArray(auditEvents.entityId, ids));
    }
    if (docIds.length) {
      await db
        .delete(documentVersions)
        .where(inArray(documentVersions.documentId, docIds));
      await db.delete(documents).where(inArray(documents.id, docIds));
    }
    if (subIds.length) {
      await db
        .delete(paymentAllocations)
        .where(inArray(paymentAllocations.subscriptionId, subIds));
      await db
        .delete(paymentEvents)
        .where(
          and(
            eq(paymentEvents.customerId, customerId),
            isNotNull(paymentEvents.correctionOfEventId),
          ),
        );
      await db
        .delete(paymentEvents)
        .where(eq(paymentEvents.customerId, customerId));
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
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(services).where(eq(services.id, serviceId));
    await db.delete(users).where(eq(users.id, userId));
    await db
      .delete(businessDocumentCounters)
      .where(
        and(
          eq(businessDocumentCounters.documentType, "receipt"),
          inArray(businessDocumentCounters.year, [year, year + 1]),
        ),
      );
  } finally {
    await pool.end();
  }
});
async function owner(status = "active") {
  const id = randomUUID();
  subIds.push(id);
  await db.insert(subscriptions).values({
    id,
    reference: `SUB-RECEIPT-${id}`,
    customerId,
    serviceId,
    status,
    agreedPriceXaf: 20000,
    durationValueSnapshot: 12,
    durationUnitSnapshot: "week",
    createdByUserId: userId,
  });
  const plan = await finance().execute(
    id,
    "create",
    {
      installments: [
        { amountXaf: 8000, dueDate: base.toISOString() },
        {
          amountXaf: 12000,
          dueDate: new Date(base.getTime() + 86400000).toISOString(),
        },
      ],
    },
    fa,
  );
  assert.ok(plan.ok);
  if (!plan.ok) throw new Error("Missing plan");
  const pid = plan.body.finance.plans[0]!.id;
  assert.ok((await finance().execute(pid, "activate", {}, fa)).ok);
  return id;
}
async function payment(subscriptionId?: string, amountXaf = 10000) {
  const sub = subscriptionId ?? (await owner());
  tick();
  const r = await finance().execute(
    sub,
    "record",
    {
      amountXaf,
      paymentMethod: "bank_transfer",
      occurredAt: clock().toISOString(),
      externalReference: "PRIVATE_RECEIPT_REF",
      idempotencyKey: randomUUID(),
    },
    fa,
  );
  assert.ok(r.ok && r.body.paymentEventId);
  if (!r.ok || !r.body.paymentEventId) throw new Error("Missing payment");
  return { id: r.body.paymentEventId, sub };
}
async function issue(p?: Awaited<ReturnType<typeof payment>>) {
  const source = p ?? (await payment());
  return { p: source, r: receipt(await call(source.id, "issue")) };
}
async function correct(p: { id: string }, amountXaf = 10000) {
  tick();
  const r = await finance().execute(
    p.id,
    "correct",
    {
      amountXaf,
      occurredAt: clock().toISOString(),
      idempotencyKey: randomUUID(),
    },
    fa,
  );
  assert.ok(r.ok);
  return r;
}
async function share(r?: Receipt, maxUses = 3) {
  const row = r ?? (await issue()).r,
    result = await call(row.id, "share", {
      expiresAt: new Date(clock().getTime() + 3600000).toISOString(),
      maxUses,
    });
  assert.ok(result.ok && "body" in result && "share" in result.body);
  if (!result.ok || !("body" in result) || !("share" in result.body))
    throw new Error("Missing token");
  tokenIds.push(result.body.share.tokenId);
  return { r: row, ...result.body.share };
}
const count = async (y = year) =>
  (
    await db
      .select()
      .from(businessDocumentCounters)
      .where(
        and(
          eq(businessDocumentCounters.documentType, "receipt"),
          eq(businessDocumentCounters.year, y),
        ),
      )
  )[0]?.lastValue ?? 0;
const raw = async (id: string) =>
  (await db.select().from(receipts).where(eq(receipts.id, id)))[0];
const sub = async (id: string) =>
  (await db.select().from(subscriptions).where(eq(subscriptions.id, id)))[0];
function auditFailure(prefix: string) {
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
                                    ...(v.eventType === prefix
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
  return new DrizzleReceiptsRepository(database, options, artifacts, clock);
}
test("PostgreSQL receipt preflight-safe fixture starts without receipt rows or counter", async () => {
  assert.equal(
    (
      await db
        .select()
        .from(receipts)
        .where(eq(receipts.customerId, customerId))
    ).length,
    0,
  );
  assert.equal(await count(), 0);
});
test("PostgreSQL valid receipt creates exact customer/payment/private immutable document and snapshot", async () => {
  const { p, r } = await issue();
  assert.equal(r.paymentEventId, p.id);
  assert.equal(r.customerId, customerId);
  assert.equal(r.receiptNumber, `REC-${year}-0001`);
  assert.equal(r.snapshot.balanceAfterPaymentXaf, 10000);
  assert.equal(r.snapshot.allocations.length, 2);
  const [d] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, r.pdfDocumentId));
  assert.equal(d?.ownerType, "receipt");
  assert.equal(d?.ownerId, r.id);
  assert.equal(d?.documentType, "payment_receipt");
  const [v] = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, r.pdfDocumentId));
  assert.ok(v);
  const bytes = files.get(v.storageKey);
  assert.ok(bytes);
  assert.equal(v.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(v.sizeBytes, bytes.length);
});
test("PostgreSQL receipt payment uniqueness is enforced by the database", async () => {
  const { r } = await issue(),
    row = await raw(r.id);
  assert.ok(row);
  await assert.rejects(
    db.insert(receipts).values({
      ...row,
      id: randomUUID(),
      receiptNumber: `SYNTHETIC-${randomUUID()}`,
    }),
  );
});
test("PostgreSQL concurrent same-payment issue creates one number/document/PDF and replays existing", async () => {
  const p = await payment(),
    before = await count(),
    fileCount = files.size,
    results = await Promise.all([call(p.id, "issue"), call(p.id, "issue")]),
    a = receipt(results[0]!),
    b = receipt(results[1]!);
  assert.equal(a.id, b.id);
  assert.equal(await count(), before + 1);
  assert.equal(files.size, fileCount + 1);
  assert.equal(
    (await db.select().from(receipts).where(eq(receipts.paymentEventId, p.id)))
      .length,
    1,
  );
});
test("PostgreSQL concurrent different payments receive sequential 0001 and 0002 in fresh annual partition", async () => {
  const a = await payment(),
    b = await payment(),
    next = repoAt(artifacts, () => new Date(`${year + 1}-10-22T12:00:00Z`));
  const rows = (
    await Promise.all([
      call(a.id, "issue", {}, actor, next),
      call(b.id, "issue", {}, actor, next),
    ])
  ).map(receipt);
  assert.deepEqual(rows.map((r) => r.receiptNumber).sort(), [
    `REC-${year + 1}-0001`,
    `REC-${year + 1}-0002`,
  ]);
  assert.equal(await count(year + 1), 2);
});
for (const stage of ["render", "scan", "storage"] as const)
  test(`PostgreSQL ${stage} failure rolls back counter/receipt/document without usable artifact`, async () => {
    const p = await payment(),
      before = await count(),
      size = files.size,
      port: ReceiptArtifacts = {
        ...artifacts,
        ...(stage === "render"
          ? {
              async render() {
                throw new Error("Synthetic render failure");
              },
            }
          : {
              async persist() {
                throw new Error(`Synthetic ${stage} failure`);
              },
            }),
      };
    assert.deepEqual(
      await call(p.id, "issue", {}, actor, repoAt(port)),
      fail("RECEIPT_PDF_FAILURE"),
    );
    assert.equal(await count(), before);
    assert.equal(files.size, size);
    assert.equal(
      (
        await db
          .select()
          .from(receipts)
          .where(eq(receipts.paymentEventId, p.id))
      ).length,
      0,
    );
  });
test("PostgreSQL issuance audit FK failure rolls back counter/receipt/document and compensates finalized file", async () => {
  const p = await payment(),
    before = await count(),
    size = files.size;
  await assert.rejects(
    call(p.id, "issue", {}, actor, auditFailure("receipt.issued")),
  );
  assert.equal(await count(), before);
  assert.equal(files.size, size);
  assert.equal(
    (await db.select().from(receipts).where(eq(receipts.paymentEventId, p.id)))
      .length,
    0,
  );
});
test("PostgreSQL receipt historical identity/snapshot/PDF survive customer changes and later payments", async () => {
  const { p, r } = await issue(),
    original = await raw(r.id),
    pdf = await call(r.id, "pdf");
  await db
    .update(customers)
    .set({ fullName: "Changed Synthetic Customer" })
    .where(eq(customers.id, customerId));
  await payment(p.sub, 3000);
  const fresh = receipt(await call(r.id, "read"));
  assert.deepEqual(await raw(r.id), original);
  assert.equal(fresh.snapshot.customerName, "Synthetic Receipt Customer");
  assert.deepEqual(await call(r.id, "pdf"), pdf);
  await db
    .update(customers)
    .set({ fullName: "Synthetic Receipt Customer" })
    .where(eq(customers.id, customerId));
});
test("PostgreSQL issue after a later payment reconstructs source balance rather than current balance", async () => {
  const a = await payment(undefined, 6000);
  await payment(a.sub, 4000);
  const r = receipt(await call(a.id, "issue"));
  assert.equal(r.snapshot.confirmedPaidAfterPaymentXaf, 6000);
  assert.equal(r.snapshot.balanceAfterPaymentXaf, 14000);
});
test("PostgreSQL historical prefix includes earlier corrections and ignores later corrections", async () => {
  const a = await payment(undefined, 8000);
  await correct(a, 3000);
  const b = await payment(a.sub, 4000);
  await correct(b, 1000);
  const r = receipt(await call(b.id, "issue"));
  assert.equal(r.snapshot.confirmedPaidAfterPaymentXaf, 9000);
  assert.equal(r.snapshot.balanceAfterPaymentXaf, 11000);
  assert.equal(r.correctionState, "partially_corrected");
});
test("PostgreSQL ambiguous same-confirmation timestamp fails safely before allocating number or PDF", async () => {
  const a = await payment(undefined, 4000),
    b = await payment(a.sub, 3000),
    [source] = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.id, a.id));
  assert.ok(source?.confirmedAt);
  await db
    .update(paymentEvents)
    .set({ confirmedAt: source.confirmedAt })
    .where(eq(paymentEvents.id, b.id));
  const before = await count(),
    size = files.size;
  assert.deepEqual(await call(a.id, "issue"), fail("RECEIPT_ISSUE_CONFLICT"));
  assert.equal(await count(), before);
  assert.equal(files.size, size);
});
test("PostgreSQL correction event cannot receive a receipt", async () => {
  const p = await payment(),
    result = await correct(p, 1000);
  assert.ok(result.ok && result.body.paymentEventId);
  if (result.ok && result.body.paymentEventId)
    assert.deepEqual(
      await call(result.body.paymentEventId, "issue"),
      fail("RECEIPT_INVALID_PAYMENT"),
    );
});
for (const invalid of [
  "unconfirmed",
  "no-allocations",
  "wrong-customer",
  "multiple-subscriptions",
] as const)
  test(`PostgreSQL ${invalid} source is ineligible for receipt`, async () => {
    const p = await payment();
    if (invalid === "unconfirmed")
      await db
        .update(paymentEvents)
        .set({ confirmedAt: null })
        .where(eq(paymentEvents.id, p.id));
    if (invalid === "no-allocations")
      await db
        .delete(paymentAllocations)
        .where(eq(paymentAllocations.paymentEventId, p.id));
    if (invalid === "wrong-customer") {
      const other = randomUUID();
      await db.insert(customers).values({
        id: other,
        fullName: "Synthetic Other",
        whatsapp: `+241${Date.now()}`,
      });
      try {
        await db
          .update(paymentEvents)
          .set({ customerId: other })
          .where(eq(paymentEvents.id, p.id));
        assert.deepEqual(
          await call(p.id, "issue"),
          fail("RECEIPT_INVALID_PAYMENT"),
        );
      } finally {
        await db
          .update(paymentEvents)
          .set({ customerId })
          .where(eq(paymentEvents.id, p.id));
        await db.delete(customers).where(eq(customers.id, other));
      }
      return;
    }
    if (invalid === "multiple-subscriptions") {
      const other = await owner(),
        [a] = await db
          .select()
          .from(paymentAllocations)
          .where(eq(paymentAllocations.paymentEventId, p.id));
      assert.ok(a);
      await db
        .update(paymentAllocations)
        .set({ subscriptionId: other })
        .where(eq(paymentAllocations.id, a.id));
    }
    assert.deepEqual(
      await call(p.id, "issue"),
      fail("RECEIPT_INVALID_PAYMENT"),
    );
  });
test("PostgreSQL receipt share stores exact scoped hash only and metadata is safe/non-consuming", async () => {
  const l = await share(),
    [t] = await db
      .select()
      .from(secureAccessTokens)
      .where(eq(secureAccessTokens.id, l.tokenId));
  assert.ok(t);
  assert.equal(t.tokenHash, hashDocumentBearer(l.token, options.tokenPepper));
  assert.equal(t.resourceId, l.r.id);
  assert.equal(t.action, "receipt_download");
  assert.ok(!JSON.stringify(t).includes(l.token));
  const result = await call(l.token, "public-read", {}, visitor);
  assert.ok(result.ok && "body" in result);
  if (result.ok && "body" in result)
    for (const field of [
      "customerId",
      "paymentEventId",
      "voidReason",
      "externalReference",
      "links",
      "snapshot",
    ])
      assert.ok(!Object.hasOwn(result.body, field));
  assert.equal(
    (
      await db
        .select()
        .from(secureAccessTokens)
        .where(eq(secureAccessTokens.id, l.tokenId))
    )[0]?.useCount,
    0,
  );
});
test("POL-01 D3: metadata counts remaining downloads down after each PDF, then the consumed link refuses the page", async () => {
  const l = await share(undefined, 3);
  const remaining = async () => {
    const r = await call(l.token, "public-read", {}, visitor);
    assert.ok(r.ok && "body" in r && "remainingDownloads" in r.body);
    return r.ok && "body" in r && "remainingDownloads" in r.body
      ? [r.body.remainingDownloads, r.body.canDownload]
      : null;
  };
  assert.deepEqual(await remaining(), [3, true]);
  for (const left of [2, 1]) {
    assert.ok((await call(l.token, "public-pdf", {}, visitor)).ok);
    assert.deepEqual(await remaining(), [left, true]);
  }
  assert.ok((await call(l.token, "public-pdf", {}, visitor)).ok);
  assert.deepEqual(
    await call(l.token, "public-read", {}, visitor),
    fail("RECEIPT_LINK_CONSUMED"),
  );
  assert.deepEqual(
    await call(l.token, "public-pdf", {}, visitor),
    fail("RECEIPT_LINK_CONSUMED"),
  );
});
test("PostgreSQL PDF consumes one use, metadata none, concurrent final use has one winner", async () => {
  const l = await share(undefined, 1);
  const results = await Promise.all([
    call(l.token, "public-pdf", {}, visitor),
    call(l.token, "public-pdf", {}, visitor),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.ok(results.some((r) => !r.ok && r.error === "RECEIPT_LINK_CONSUMED"));
  assert.deepEqual(
    await call(l.token, "public-read", {}, visitor),
    fail("RECEIPT_LINK_CONSUMED"),
  );
  assert.equal(
    (
      await db
        .select()
        .from(secureAccessTokens)
        .where(eq(secureAccessTokens.id, l.tokenId))
    )[0]?.useCount,
    1,
  );
});
for (const mode of ["expired", "revoked", "wrong-action"] as const)
  test(`PostgreSQL ${mode} receipt link rejects metadata/PDF and records access`, async () => {
    const l = await share();
    await db
      .update(secureAccessTokens)
      .set(
        mode === "expired"
          ? { expiresAt: new Date(base.getTime() - 1000) }
          : mode === "revoked"
            ? { revokedAt: clock() }
            : { action: "unrelated" },
      )
      .where(eq(secureAccessTokens.id, l.tokenId));
    const error =
      mode === "expired"
        ? "RECEIPT_LINK_EXPIRED"
        : mode === "revoked"
          ? "RECEIPT_LINK_REVOKED"
          : "RECEIPT_LINK_INVALID";
    for (const a of ["public-read", "public-pdf"] as const)
      assert.deepEqual(await call(l.token, a, {}, visitor), fail(error));
    assert.equal(
      (
        await db
          .select()
          .from(secureAccessTokens)
          .where(eq(secureAccessTokens.id, l.tokenId))
      )[0]?.useCount,
      0,
    );
  });
test("PostgreSQL failed private artifact download does not consume link and is access-audited", async () => {
  const l = await share(),
    broken = repoAt({
      ...artifacts,
      async read() {
        throw new Error("Synthetic missing file");
      },
    });
  assert.deepEqual(
    await call(l.token, "public-pdf", {}, visitor, broken),
    fail("RECEIPT_PDF_FAILURE"),
  );
  assert.equal(
    (
      await db
        .select()
        .from(secureAccessTokens)
        .where(eq(secureAccessTokens.id, l.tokenId))
    )[0]?.useCount,
    0,
  );
  assert.equal(
    (
      await db
        .select()
        .from(externalAccessEvents)
        .where(eq(externalAccessEvents.secureAccessTokenId, l.tokenId))
    )[0]?.result,
    "RECEIPT_PDF_FAILURE",
  );
});
test("PostgreSQL partial correction preserves receipt/PDF, updates read model and blocks void", async () => {
  const { p, r } = await issue(),
    original = await raw(r.id),
    pdf = await call(r.id, "pdf");
  await correct(p, 3000);
  const fresh = receipt(await call(r.id, "read"));
  assert.equal(fresh.correctionState, "partially_corrected");
  assert.equal(fresh.effectiveAmountXaf, 7000);
  assert.deepEqual(
    await call(r.id, "void", { voidReason: "Private partial" }),
    fail("RECEIPT_VOID_NOT_ALLOWED"),
  );
  assert.deepEqual(await raw(r.id), original);
  assert.deepEqual(await call(r.id, "pdf"), pdf);
});
test("PostgreSQL full correction permits explicit void, preserving number/snapshot/PDF and preventing reissue", async () => {
  const { p, r } = await issue(),
    original = await raw(r.id),
    pdf = await call(r.id, "pdf");
  await correct(p);
  const fresh = receipt(
    await call(r.id, "void", { voidReason: "PRIVATE_VOID_REASON" }),
  );
  assert.equal(fresh.state, "voided");
  assert.equal(fresh.correctionState, "fully_corrected");
  assert.equal(fresh.receiptNumber, r.receiptNumber);
  assert.deepEqual(fresh.snapshot, r.snapshot);
  assert.deepEqual(await call(r.id, "pdf"), pdf);
  assert.deepEqual(
    {
      ...(await raw(r.id)),
      voidedAt: original?.voidedAt,
      voidReason: original?.voidReason,
    },
    original,
  );
  const before = await count();
  assert.equal(receipt(await call(p.id, "issue")).id, r.id);
  assert.equal(await count(), before);
});
test("PostgreSQL concurrent void commands create exactly one transition/audit", async () => {
  const { p, r } = await issue();
  await correct(p);
  const results = await Promise.all([
    call(r.id, "void", { voidReason: "Synthetic A" }),
    call(r.id, "void", { voidReason: "Synthetic B" }),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.ok(results.some((r) => !r.ok && r.error === "RECEIPT_ALREADY_VOIDED"));
  assert.equal(
    (
      await db
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.entityId, r.id),
            eq(auditEvents.eventType, "receipt.voided"),
          ),
        )
    ).length,
    1,
  );
});
test("PostgreSQL issue versus correction serializes safely and preserves source-position snapshot", async () => {
  const p = await payment(),
    results = await Promise.all([call(p.id, "issue"), correct(p, 3000)]),
    r = receipt(results[0]!);
  assert.equal(r.snapshot.amountXaf, 10000);
  assert.equal(r.snapshot.confirmedPaidAfterPaymentXaf, 10000);
  assert.equal(r.snapshot.balanceAfterPaymentXaf, 10000);
  assert.equal(receipt(await call(r.id, "read")).effectiveAmountXaf, 7000);
});
test("PostgreSQL partial correction versus void cannot incorrectly allow a void", async () => {
  const { p, r } = await issue(),
    results = await Promise.all([
      correct(p, 3000),
      call(r.id, "void", { voidReason: "Synthetic" }),
    ]);
  assert.deepEqual(results[1], fail("RECEIPT_VOID_NOT_ALLOWED"));
  assert.equal(receipt(await call(r.id, "read")).state, "issued");
});
test("PostgreSQL full correction versus void has safe retry and exactly one eventual void", async () => {
  const { p, r } = await issue();
  await Promise.all([
    correct(p),
    call(r.id, "void", { voidReason: "Synthetic concurrent" }),
  ]);
  const result = await call(r.id, "void", { voidReason: "Synthetic retry" });
  assert.ok(result.ok || result.error === "RECEIPT_ALREADY_VOIDED");
  assert.equal(receipt(await call(r.id, "read")).state, "voided");
  assert.equal(
    (
      await db
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.entityId, r.id),
            eq(auditEvents.eventType, "receipt.voided"),
          ),
        )
    ).length,
    1,
  );
});
test("PostgreSQL public void metadata exposes Annulé state/current correction while serving original PDF", async () => {
  const { p, r } = await issue(),
    l = await share(r),
    pdf = await call(l.token, "public-pdf", {}, visitor);
  await correct(p);
  receipt(await call(r.id, "void", { voidReason: "PRIVATE_CUSTOMER_REASON" }));
  const result = await call(l.token, "public-read", {}, visitor);
  assert.ok(result.ok && "body" in result);
  if (result.ok && "body" in result) {
    assert.ok("state" in result.body);
    if ("state" in result.body) {
      assert.equal(result.body.state, "voided");
      assert.equal(result.body.correctionState, "fully_corrected");
    }
    assert.ok(!JSON.stringify(result.body).includes("PRIVATE_CUSTOMER_REASON"));
  }
  assert.deepEqual(await call(l.token, "public-pdf", {}, visitor), pdf);
});
for (const action of ["share", "void"] as const)
  test(`PostgreSQL ${action} audit failure rolls back business mutation`, async () => {
    const { p, r } = await issue();
    if (action === "void") await correct(p);
    const before = await raw(r.id),
      links = (
        await db
          .select()
          .from(secureAccessTokens)
          .where(eq(secureAccessTokens.resourceId, r.id))
      ).length;
    await assert.rejects(
      call(
        r.id,
        action,
        action === "share"
          ? { expiresAt: new Date(clock().getTime() + 60000).toISOString() }
          : { voidReason: "Synthetic rollback" },
        actor,
        auditFailure(
          action === "share" ? "receipt.link_issued" : "receipt.voided",
        ),
      ),
    );
    assert.deepEqual(await raw(r.id), before);
    assert.equal(
      (
        await db
          .select()
          .from(secureAccessTokens)
          .where(eq(secureAccessTokens.resourceId, r.id))
      ).length,
      links,
    );
  });
test("PostgreSQL generic receipt audits exclude PII, external reference, void reason and bearer", async () => {
  const { p, r } = await issue(),
    l = await share(r);
  await correct(p);
  receipt(await call(r.id, "void", { voidReason: "PRIVATE_AUDIT_REASON" }));
  await call(l.tokenId, "revoke");
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.entityId, r.id));
  assert.ok(rows.length >= 4);
  const allowed = new Set([
    "receiptId",
    "receiptNumber",
    "paymentEventId",
    "subscriptionId",
    "documentId",
    "documentVersionId",
    "amountXaf",
    "paymentMethod",
    "allocationCount",
    "fromState",
    "toState",
    "tokenId",
  ]);
  for (const row of rows) {
    assert.ok(Object.keys(row.metadataJson ?? {}).every((k) => allowed.has(k)));
    const value = JSON.stringify(row.metadataJson);
    for (const secret of [
      l.token,
      "Synthetic Receipt Customer",
      "PRIVATE_RECEIPT_REF",
      "PRIVATE_AUDIT_REASON",
    ])
      assert.ok(!value.includes(secret));
  }
});
for (const status of [
  "onboarding",
  "active",
  "paused",
  "completed",
  "cancelled",
])
  test(`PostgreSQL receipt issue/share/void preserve subscription ${status} row`, async () => {
    const id = await owner(status),
      p = await payment(id),
      before = await sub(id),
      { r } = await issue(p);
    await share(r);
    await correct(p);
    receipt(await call(r.id, "void", { voidReason: "Synthetic lifecycle" }));
    assert.deepEqual(await sub(id), before);
  });
test("PostgreSQL generic document mutation/sharing cannot alter receipt-owned historical artifact", async () => {
  const { r } = await issue(),
    [v] = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, r.pdfDocumentId));
  assert.ok(v);
  const docs = new DrizzleDocumentsRepository(
    db,
    { ...options, verificationPepper: "synthetic" },
    clock,
  );
  assert.deepEqual(
    await docs.execute(r.pdfDocumentId, { action: "archive" }, actor),
    { ok: false, error: "DOCUMENT_NOT_FOUND" },
  );
  assert.deepEqual(
    await docs.execute(
      v.id,
      {
        action: "issue-link",
        expiresAt: new Date(clock().getTime() + 10000),
        maxUses: 3,
      },
      actor,
    ),
    { ok: false, error: "DOCUMENT_NOT_FOUND" },
  );
});
test("PostgreSQL receipt list returns every receipt of the subscription with its detail", async () => {
  const a = await payment(),
    b = await payment(a.sub, 5000),
    ra = receipt(await call(a.id, "issue")),
    rb = receipt(await call(b.id, "issue"));
  const listed = await call(a.sub, "list");
  assert.ok(
    listed.ok && "body" in listed && "receipts" in listed.body,
    JSON.stringify(listed),
  );
  if (!listed.ok || !("body" in listed) || !("receipts" in listed.body))
    throw new Error("Missing receipts");
  assert.deepEqual(
    listed.body.receipts.map((r) => r.id).sort(),
    [ra.id, rb.id].sort(),
  );
  assert.ok(listed.body.receipts.every((r) => r.snapshot && r.receiptNumber));
});
test("ARCH-01 D1: no receipt is issued for an archived customer (CUSTOMER_ARCHIVED, was the S7.3b stop-gap)", async () => {
  const p = await payment(),
    before = await count();
  await db
    .update(customers)
    .set({ archivedAt: new Date() })
    .where(eq(customers.id, customerId));
  try {
    await assert.rejects(
      call(p.id, "issue"),
      (error: unknown) =>
        error instanceof SubjectArchivedError &&
        error.code === "CUSTOMER_ARCHIVED",
    );
    assert.equal(await count(), before);
  } finally {
    await db
      .update(customers)
      .set({ archivedAt: null })
      .where(eq(customers.id, customerId));
  }
});
test("ARCH-01 D4: a fully corrected receipt of an archived customer cannot be voided (unarchive first)", async () => {
  const { p, r } = await issue();
  await correct(p);
  await db
    .update(customers)
    .set({ archivedAt: new Date() })
    .where(eq(customers.id, customerId));
  try {
    await assert.rejects(
      call(r.id, "void", { voidReason: "Synthetic" }),
      (error: unknown) =>
        error instanceof SubjectArchivedError &&
        error.code === "CUSTOMER_ARCHIVED",
    );
    assert.equal((await raw(r.id))?.voidedAt, null);
  } finally {
    await db
      .update(customers)
      .set({ archivedAt: null })
      .where(eq(customers.id, customerId));
  }
});
