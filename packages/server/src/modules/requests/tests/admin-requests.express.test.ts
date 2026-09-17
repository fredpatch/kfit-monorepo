import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { adminRequestsApiRoutes, type AdminServiceRequestSummary } from "@kfit/shared";
import { createExpressAdminRequestsRouter } from "../routes/express-admin-requests.router.js";
import { AdminRequestsController } from "../controllers/admin-requests.controller.js";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { authCookieNames } from "../../auth/middleware/auth.cookies.js";

type AdminRequestsServiceFake = ConstructorParameters<typeof AdminRequestsController>[0];

const adminSession: AuthenticatedSessionContext = {
  userId: "11111111-1111-1111-1111-111111111111",
  sessionId: "22222222-2222-2222-2222-222222222222",
  role: "admin",
};

const coachSession: AuthenticatedSessionContext = {
  ...adminSession,
  role: "coach",
};

const summary: AdminServiceRequestSummary = {
  id: "33333333-3333-3333-3333-333333333333",
  reference: "REQ-ABC123",
  status: "submitted",
  submittedAt: "2026-09-17T08:00:00.000Z",
  prospect: { id: "44444444-4444-4444-4444-444444444444", fullName: "Awa Nguema", whatsapp: "+24106123456", email: null },
  service: { id: "55555555-5555-5555-5555-555555555555", name: "Coaching" },
  requestedVariant: null,
  lastContactAttemptAt: null,
  nextActionAt: null,
};

function makeService(overrides: Partial<AdminRequestsServiceFake> = {}): AdminRequestsServiceFake {
  return {
    async listQueue() {
      return [summary];
    },
    async getDetail(requestId: string) {
      if (requestId !== summary.id) return { status: "not_found" };
      return { status: "ok", detail: { ...summary, objective: null, preferredStartDate: null, message: null, duplicateOfRequestId: null, contactAttempts: [] } };
    },
    async logContactAttempt() {
      return {
        status: "ok",
        contactAttempt: {
          id: "66666666-6666-6666-6666-666666666666",
          channel: "phone_call",
          direction: "outbound",
          outcome: "callback_requested",
          note: null,
          occurredAt: "2026-09-17T09:00:00.000Z",
          nextActionAt: null,
          createdByUserId: adminSession.userId,
        },
        request: summary,
      };
    },
    async transitionStatus() {
      return { status: "ok", request: { ...summary, status: "contacting" } };
    },
    ...overrides,
  };
}

async function withTestServer<T>(
  controller: AdminRequestsController,
  run: (baseUrl: string) => Promise<T>,
  resolveSession: () => AuthenticatedSessionContext | null = () => null,
): Promise<T> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(createExpressAdminRequestsRouter({ controller, resolveSession }));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error("Test server did not expose a TCP address");

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function csrfHeaders() {
  const csrf = "csrf-token";
  return {
    "content-type": "application/json",
    cookie: `${authCookieNames.csrfToken}=${csrf}`,
    "x-csrf-token": csrf,
  };
}

function detailPath(requestId: string): string {
  return adminRequestsApiRoutes.detail.replace(":requestId", requestId);
}

function contactAttemptsPath(requestId: string): string {
  return adminRequestsApiRoutes.contactAttempts.replace(":requestId", requestId);
}

function statusPath(requestId: string): string {
  return adminRequestsApiRoutes.status.replace(":requestId", requestId);
}

test("admin requests routes require an authenticated admin session", async () => {
  const controller = new AdminRequestsController(makeService());

  await withTestServer(controller, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}${adminRequestsApiRoutes.queue}`);
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { error: "AUTH_SESSION_REQUIRED" });
  });

  await withTestServer(controller, async (baseUrl) => {
    const forbidden = await fetch(`${baseUrl}${adminRequestsApiRoutes.queue}`);
    assert.equal(forbidden.status, 403);
    assert.deepEqual(await forbidden.json(), { error: "REQUEST_ADMIN_FORBIDDEN" });
  }, () => coachSession);
});

test("admin requests mutation routes reject an authenticated non-admin coach session", async () => {
  const controller = new AdminRequestsController(makeService());

  await withTestServer(controller, async (baseUrl) => {
    const contactAttemptResponse = await fetch(`${baseUrl}${contactAttemptsPath(summary.id)}`, {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify({ channel: "phone_call", direction: "outbound", outcome: "reached" }),
    });
    assert.equal(contactAttemptResponse.status, 403);
    assert.deepEqual(await contactAttemptResponse.json(), { error: "REQUEST_ADMIN_FORBIDDEN" });

    const statusResponse = await fetch(`${baseUrl}${statusPath(summary.id)}`, {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify({ toStatus: "contacting" }),
    });
    assert.equal(statusResponse.status, 403);
    assert.deepEqual(await statusResponse.json(), { error: "REQUEST_ADMIN_FORBIDDEN" });
  }, () => coachSession);
});

test("admin requests queue and detail routes return data for an authenticated admin", async () => {
  const controller = new AdminRequestsController(makeService());

  await withTestServer(controller, async (baseUrl) => {
    const queue = await fetch(`${baseUrl}${adminRequestsApiRoutes.queue}`);
    assert.equal(queue.status, 200);
    assert.equal((await queue.json() as { requests: AdminServiceRequestSummary[] }).requests[0]?.reference, "REQ-ABC123");

    const detail = await fetch(`${baseUrl}${detailPath(summary.id)}`);
    assert.equal(detail.status, 200);

    const missing = await fetch(`${baseUrl}${detailPath("99999999-9999-9999-9999-999999999999")}`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "REQUEST_NOT_FOUND" });
  }, () => adminSession);
});

test("admin requests queue route rejects an unknown status filter", async () => {
  const controller = new AdminRequestsController(makeService());

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${adminRequestsApiRoutes.queue}?status=not_a_real_status`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "REQUEST_INVALID_INPUT", reason: "status_invalid" });
  }, () => adminSession);
});

test("admin requests mutation routes require same-origin CSRF and reject anonymous callers", async () => {
  const controller = new AdminRequestsController(makeService());

  await withTestServer(controller, async (baseUrl) => {
    const missingCsrf = await fetch(`${baseUrl}${contactAttemptsPath(summary.id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "phone_call", direction: "outbound", outcome: "reached" }),
    });
    assert.equal(missingCsrf.status, 403);
    assert.deepEqual(await missingCsrf.json(), { error: "AUTH_CSRF_INVALID" });
  }, () => adminSession);

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${statusPath(summary.id)}`, {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify({ toStatus: "contacting" }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "AUTH_SESSION_REQUIRED" });
  });
});

test("admin requests contact-attempt route logs an attempt for an authenticated admin with CSRF", async () => {
  const controller = new AdminRequestsController(makeService());

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${contactAttemptsPath(summary.id)}`, {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify({ channel: "phone_call", direction: "outbound", outcome: "callback_requested" }),
    });
    assert.equal(response.status, 201);
    const body = await response.json() as { contactAttempt: { channel: string } };
    assert.equal(body.contactAttempt.channel, "phone_call");
  }, () => adminSession);
});

test("admin requests status route transitions status for an authenticated admin with CSRF", async () => {
  const controller = new AdminRequestsController(makeService());

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${statusPath(summary.id)}`, {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify({ toStatus: "contacting" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { request: AdminServiceRequestSummary };
    assert.equal(body.request.status, "contacting");
  }, () => adminSession);
});

test("admin requests status route surfaces an invalid transition as a 409", async () => {
  const controller = new AdminRequestsController(makeService({
    async transitionStatus() {
      return { status: "invalid_transition" };
    },
  }));

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${statusPath(summary.id)}`, {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify({ toStatus: "qualified" }),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "REQUEST_INVALID_TRANSITION" });
  }, () => adminSession);
});

test("admin requests routes return a stable error on unexpected failures", async () => {
  const controller = new AdminRequestsController(makeService({
    async listQueue() {
      throw new Error("boom");
    },
  }));

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${adminRequestsApiRoutes.queue}`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "REQUEST_ROUTE_UNEXPECTED_FAILURE" });
  }, () => adminSession);
});
