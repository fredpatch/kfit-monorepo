import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import { documentApiRoutes } from "@kfit/shared";
import { db, pool } from "../../../db/client.js";
import { auditEvents, customers, documents, documentVersions, services, subscriptions, users } from "../../../db/schema/index.js";
import { assertLocalTestDatabase, testFixtureName, uniqueTestWhatsapp } from "../../../testing/integration-fixtures.js";
import { authCookieNames } from "../../auth/middleware/auth.cookies.js";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { DrizzleTestDataRepository } from "../../dev-tools/repositories/test-data.repository.js";
import { testDataFingerprint } from "../../dev-tools/services/test-data.policy.js";
import { DrizzlePrivacyRepository } from "../../privacy/repositories/privacy.repository.js";
import { DocumentsController } from "../controllers/documents.controller.js";
import { DrizzleDocumentsRepository } from "../repositories/documents.repository.js";
import { createExpressDocumentsRouter } from "../routes/express-documents.router.js";
import { PrivateDocumentStorage } from "../services/document-storage.service.js";
import { DocumentsService } from "../services/documents.service.js";

const options = { auditHashPepper: "synthetic-documents-archived-pepper", tokenPepper: "synthetic-documents-archived-token-pepper-12345", verificationPepper: "synthetic-documents-archived-code-pepper-123456" };
const userId = randomUUID(), serviceId = randomUUID();
const admin: AuthenticatedSessionContext = { userId, sessionId: randomUUID(), role: "admin" };
const csrf = "synthetic-documents-csrf";
const pdf = Buffer.from("%PDF-1.4\nsynthetic archived upload\n%%EOF\n");
const unused = async (): Promise<never> => { throw new Error("unused in this test"); };
let root = "", safe = false;
const scanner = createTcpServer((socket) => {
  // ClamAV INSTREAM stand-in: answers clean once the zero-length terminator arrives.
  let received = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    received = Buffer.concat([received, chunk]);
    if (received.length > 14 && received.subarray(-4).equals(Buffer.alloc(4))) socket.end("stream: OK\0");
  });
});

before(async () => {
  assertLocalTestDatabase(); safe = true;
  root = await mkdtemp(path.join(tmpdir(), "kfit-fix02-documents-"));
  scanner.listen(0, "127.0.0.1"); await once(scanner, "listening");
  await db.insert(users).values({ id: userId, email: `documents-archived-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(services).values({ id: serviceId, name: testFixtureName("Archived documents service"), slug: `archived-documents-${serviceId}`, pricingMode: "quote", deliveryType: "one_time", capacityMode: "unlimited" });
});

after(async () => {
  try {
    if (!safe) return;
    const purge = new DrizzleTestDataRepository(db, options);
    const result = await purge.purge(testDataFingerprint(await purge.classify()), testDataFingerprint, { userId, requestId: randomUUID(), ipAddress: null, userAgent: "documents-archived-test" });
    assert.equal(result.status, "purged");
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
    await db.delete(users).where(eq(users.id, userId));
  } finally {
    scanner.close();
    if (root) await rm(root, { recursive: true, force: true });
    await pool.end();
  }
});

async function withRouter(run: (url: string) => Promise<void>) {
  const storage = new PrivateDocumentStorage({ root, clamavHost: "127.0.0.1", clamavPort: (scanner.address() as AddressInfo).port });
  const service = new DocumentsService(new DrizzleDocumentsRepository(db, options), storage, { templateVersion: "synthetic", render: unused });
  const app = express();
  app.use(createExpressDocumentsRouter({ controller: new DocumentsController(service), resolveSession: () => admin }));
  const server = createHttpServer(app);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const upload = (url: string) => fetch(url, { method: "POST", body: pdf,
  headers: { "content-type": "application/pdf", "x-file-name": "plan.pdf", cookie: `${authCookieNames.csrfToken}=${csrf}`, "x-csrf-token": csrf } });
const storedFiles = async () => readdir(root).catch(() => [] as string[]);

test("FIX-02 D4: upload and add-version on an archived customer answer 409 CUSTOMER_ARCHIVED and leave no file in storage", async () => {
  const customerId = randomUUID(), subscriptionId = randomUUID(), documentId = randomUUID();
  await db.insert(customers).values({ id: customerId, fullName: testFixtureName(`Archived documents ${customerId.slice(0, 8)}`), whatsapp: uniqueTestWhatsapp() });
  await db.insert(subscriptions).values({ id: subscriptionId, reference: `SUB-DOCS-${subscriptionId}`, customerId, serviceId, status: "completed", agreedPriceXaf: 0, createdByUserId: userId });
  await db.insert(documents).values({ id: documentId, ownerType: "subscription", ownerId: subscriptionId, documentType: "meal_plan", status: "available" });
  await db.insert(documentVersions).values({ documentId, versionNumber: 1, storageKey: `${randomUUID()}.pdf`, originalFilename: "plan.pdf", mimeType: "application/pdf",
    sizeBytes: 10, sha256: "0".repeat(64), uploadedByType: "admin", malwareScanStatus: "clean" });
  const archived = await new DrizzlePrivacyRepository(db, options).archive("customer", customerId, { userId, requestId: randomUUID(), ipAddress: null, userAgent: null }, new Date());
  assert.ok(archived.ok, JSON.stringify(archived));
  assert.deepEqual(await storedFiles(), []);

  await withRouter(async (url) => {
    const created = await upload(url + documentApiRoutes.create.replace(":subscriptionId", subscriptionId) + "?type=meal_plan");
    assert.equal(created.status, 409);
    assert.deepEqual(await created.json(), { error: "CUSTOMER_ARCHIVED" });
    assert.deepEqual(await storedFiles(), [], "upload left no file");

    const version = await upload(url + documentApiRoutes.addVersion.replace(":documentId", documentId));
    assert.equal(version.status, 409);
    assert.deepEqual(await version.json(), { error: "CUSTOMER_ARCHIVED" });
    assert.deepEqual(await storedFiles(), [], "add-version left no file");
  });
});
