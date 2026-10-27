import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames } from "@kfit/shared";
import { logger } from "../../../logging/logger.js";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { PrivacyController } from "../controllers/privacy.controller.js";
import type { AnonymizeResult } from "../repositories/privacy.repository.js";
import { createExpressPrivacyRouter } from "../routes/express-privacy.router.js";
import { PrivacyService } from "../services/privacy.service.js";

const admin: AuthenticatedSessionContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  role: "admin",
};
const customerId = "33333333-3333-4333-8333-333333333333",
  holdId = "44444444-4444-4444-8444-444444444444",
  eventId = "55555555-5555-4555-8555-555555555555";
const anonymizedId = "77777777-7777-4777-8777-777777777777";
const csrf = "synthetic-privacy-csrf",
  now = new Date("2026-10-25T10:00:00.000Z");
const headers = {
  "content-type": "application/json",
  cookie: `${authCookieNames.csrfToken}=${csrf}`,
  "x-csrf-token": csrf,
};
const executed = {
  eventId,
  subjectType: "customer" as const,
  subjectId: customerId,
  executedAt: now,
  planVersion: 1,
  linkedSubjects: [],
};
const hold = {
  id: holdId,
  scopeType: "customer" as const,
  scopeId: customerId,
  holdType: "legal" as const,
  reason: "motif",
  status: "active" as const,
  startedAt: now.toISOString(),
  releasedAt: null,
};

type Options = {
  session?: AuthenticatedSessionContext | null;
  otpAt?: Date | null;
  anonymize?: AnonymizeResult;
  fail?: boolean;
};
async function withServer(
  run: (url: string, calls: string[], journal: string[]) => Promise<void>,
  options: Options = {},
) {
  const calls: string[] = [],
    journal: string[] = [];
  const repository = {
    async archive(type: string, id: string) {
      calls.push(`archive:${type}:${id}`);
      return id === customerId
        ? { ok: true as const, archivedAt: now, tokensRevoked: 0 }
        : { ok: false as const, error: "PRIVACY_SUBJECT_NOT_FOUND" as const };
    },
    async unarchive(type: string, id: string, reason: string) {
      calls.push(`unarchive:${type}:${id}:${reason}`);
      return id === customerId
        ? { ok: true as const }
        : id === anonymizedId
          ? { ok: false as const, error: "PRIVACY_SUBJECT_ANONYMIZED" as const }
          : {
              ok: false as const,
              error: "PRIVACY_SUBJECT_NOT_ARCHIVED" as const,
            };
    },
    async anonymize(type: string, id: string, confirmName: string) {
      if (options.fail)
        throw Object.assign(
          new Error(`duplicate key ${confirmName} +24177000000`),
          { code: "23505" },
        );
      calls.push(`anonymize:${type}:${id}`);
      return (
        options.anonymize ?? {
          ok: true as const,
          event: executed,
          alreadyAnonymized: false,
        }
      );
    },
    async createHold(input: { scopeType: string }) {
      calls.push(`hold:${input.scopeType}`);
      return { ok: true as const, hold };
    },
    async releaseHold(id: string) {
      calls.push(`release:${id}`);
      return id === holdId
        ? { ok: true as const, hold: { ...hold, status: "released" as const } }
        : { ok: false as const, error: "PRIVACY_HOLD_NOT_FOUND" as const };
    },
    async listHolds() {
      return [hold];
    },
  };
  const journalPort = {
    async append(e: { eventId: string }) {
      journal.push(e.eventId);
    },
    async read() {
      return { events: [], malformed: 0 };
    },
  };
  const service = new PrivacyService(
    repository,
    journalPort,
    () => undefined,
    () => now,
  );
  const controller = new PrivacyController(service, {
    lastConsumedAt: async () =>
      options.otpAt === undefined
        ? new Date(now.getTime() - 60_000)
        : options.otpAt,
    windowMs: 10 * 60_000,
    now: () => now,
  });
  const app = express();
  app.use(express.json());
  app.use(
    createExpressPrivacyRouter({
      controller,
      resolveSession: () =>
        options.session === undefined ? admin : options.session,
    }),
  );
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      calls,
      journal,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
const post = (
  url: string,
  body: unknown = {},
  extra: Record<string, string> = {},
) =>
  fetch(url, {
    method: "POST",
    headers: { ...headers, ...extra },
    body: JSON.stringify(body),
  });

for (const [session, expected] of [
  [null, 401],
  [{ ...admin, role: "coach" }, 403],
] as const)
  test(`privacy endpoints answer ${expected} without an admin session`, async () => {
    await withServer(
      async (url, calls) => {
        assert.equal(
          (
            await fetch(
              `${url}/admin/retention-holds?scopeType=customer&scopeId=${customerId}`,
            )
          ).status,
          expected,
        );
        for (const path of [
          `/admin/customers/${customerId}/archive`,
          `/admin/customers/${customerId}/anonymize`,
          "/admin/retention-holds",
          `/admin/retention-holds/${holdId}/release`,
        ]) {
          assert.equal(
            (await post(`${url}${path}`, { confirmName: "Awa" })).status,
            expected,
            path,
          );
        }
        assert.deepEqual(calls, []);
      },
      { session },
    );
  });

test("writes require CSRF and same origin; responses are no-store", async () => {
  await withServer(async (url, calls) => {
    assert.equal(
      (
        await fetch(`${url}/admin/customers/${customerId}/archive`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          `${url}/admin/customers/${customerId}/archive`,
          {},
          { origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    const ok = await post(`${url}/admin/customers/${customerId}/archive`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    assert.deepEqual(await ok.json(), {
      subjectType: "customer",
      subjectId: customerId,
      archivedAt: now.toISOString(),
    });
    assert.equal(
      (
        await post(
          `${url}/admin/prospects/66666666-6666-4666-8666-666666666666/archive`,
        )
      ).status,
      404,
    );
    assert.equal(
      (await post(`${url}/admin/customers/not-a-uuid/archive`)).status,
      400,
    );
    assert.equal(
      (await post(`${url}/admin/customers/${customerId}/archive`, { extra: 1 }))
        .status,
      400,
    );
    assert.deepEqual(calls, [
      `archive:customer:${customerId}`,
      "archive:prospect:66666666-6666-4666-8666-666666666666",
    ]);
  });
});

for (const [label, otpAt] of [
  ["missing", null],
  ["expired", new Date(now.getTime() - 11 * 60_000)],
] as const)
  test(`anonymize with a ${label} OTP is refused with 403 before the repository runs`, async () => {
    await withServer(
      async (url, calls, journal) => {
        const response = await post(
          `${url}/admin/customers/${customerId}/anonymize`,
          { confirmName: "Awa Ndong" },
        );
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), {
          error: "AUTH_FRESH_OTP_REQUIRED",
        });
        assert.deepEqual(calls, []);
        assert.deepEqual(journal, []);
      },
      { otpAt },
    );
  });

test("anonymize with a fresh OTP returns the event and journals it once; idempotent replies are not re-journaled (D10, D11)", async () => {
  await withServer(async (url, calls, journal) => {
    const response = await post(
      `${url}/admin/customers/${customerId}/anonymize`,
      { confirmName: "Awa Ndong" },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      anonymizationEventId: eventId,
      subjectType: "customer",
      subjectId: customerId,
      executedAt: now.toISOString(),
      alreadyAnonymized: false,
    });
    assert.deepEqual(journal, [eventId]);
    assert.equal(
      (await post(`${url}/admin/customers/${customerId}/anonymize`, {})).status,
      400,
      "confirmName required",
    );
    assert.deepEqual(calls, [`anonymize:customer:${customerId}`]);
  });
  await withServer(
    async (url, _calls, journal) => {
      assert.equal(
        (
          await post(`${url}/admin/customers/${customerId}/anonymize`, {
            confirmName: "x",
          })
        ).status,
        200,
      );
      assert.deepEqual(journal, []);
    },
    { anonymize: { ok: true, event: executed, alreadyAnonymized: true } },
  );
});

for (const [error, status] of [
  ["PRIVACY_CONFIRMATION_MISMATCH", 400],
  ["PRIVACY_SUBJECT_NOT_ARCHIVED", 409],
  ["PRIVACY_RETENTION_HOLD_ACTIVE", 409],
  ["PRIVACY_SUBJECT_NOT_FOUND", 404],
] as const) {
  test(`anonymize maps ${error} to ${status}`, async () => {
    await withServer(
      async (url) => {
        const response = await post(
          `${url}/admin/customers/${customerId}/anonymize`,
          { confirmName: "Awa Ndong" },
        );
        assert.equal(response.status, status);
        assert.deepEqual(await response.json(), { error });
      },
      { anonymize: { ok: false, error } },
    );
  });
}

test("holds: list validates the query, create returns 201, release maps 404", async () => {
  await withServer(async (url, calls) => {
    assert.equal(
      (
        await fetch(
          `${url}/admin/retention-holds?scopeType=customer&scopeId=${customerId}`,
        )
      ).status,
      200,
    );
    for (const query of [
      "scopeType=subscription&scopeId=" + customerId,
      "scopeType=customer",
      `scopeType=customer&scopeId=${customerId}&x=1`,
    ]) {
      assert.equal(
        (await fetch(`${url}/admin/retention-holds?${query}`)).status,
        400,
        query,
      );
    }
    assert.equal(
      (
        await post(`${url}/admin/retention-holds`, {
          scopeType: "customer",
          scopeId: customerId,
          holdType: "legal",
          reason: "motif légal",
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await post(`${url}/admin/retention-holds`, {
          scopeType: "customer",
          scopeId: customerId,
          holdType: "tax",
          reason: "motif",
        })
      ).status,
      400,
    );
    assert.equal(
      (await post(`${url}/admin/retention-holds/${holdId}/release`)).status,
      200,
    );
    assert.equal(
      (
        await post(
          `${url}/admin/retention-holds/77777777-7777-4777-8777-777777777777/release`,
        )
      ).status,
      404,
    );
    assert.deepEqual(calls, [
      "hold:customer",
      `release:${holdId}`,
      "release:77777777-7777-4777-8777-777777777777",
    ]);
  });
});

test("an unexpected failure answers a generic 500 and logs only the error type and SQLSTATE, never the typed name", async () => {
  const lines: string[] = [];
  const original = logger.error.bind(logger);
  (logger as unknown as { error: (message: string) => void }).error = (
    message: string,
  ) => {
    lines.push(message);
  };
  try {
    await withServer(
      async (url) => {
        const response = await post(
          `${url}/admin/customers/${customerId}/anonymize`,
          { confirmName: "Awa Secret Ndong" },
          { "x-request-id": "not-a-uuid" },
        );
        assert.equal(response.status, 500);
        const body = await response.text();
        assert.deepEqual(JSON.parse(body), {
          error: "PRIVACY_ROUTE_UNEXPECTED_FAILURE",
        });
      },
      { fail: true },
    );
  } finally {
    (logger as unknown as { error: typeof original }).error = original;
  }
  assert.deepEqual(lines, ["privacy anonymize_customer failed: Error (23505)"]);
});

test("ARCH-01 D6 unarchive: CSRF and same origin, reason from the closed list, anonymized and not-archived subjects answer 409", async () => {
  await withServer(async (url, calls) => {
    const path = `${url}/admin/customers/${customerId}/unarchive`;
    assert.equal(
      (
        await fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "returning_customer" }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          path,
          { reason: "returning_customer" },
          { origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    for (const body of [
      {},
      { reason: "other" },
      { reason: "returning_customer", note: "x" },
    ])
      assert.equal((await post(path, body)).status, 400, JSON.stringify(body));
    const ok = await post(path, { reason: "returning_customer" });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), {
      subjectType: "customer",
      subjectId: customerId,
      archivedAt: null,
    });
    const anonymized = await post(
      `${url}/admin/customers/${anonymizedId}/unarchive`,
      { reason: "archived_by_mistake" },
    );
    assert.equal(anonymized.status, 409);
    assert.deepEqual(await anonymized.json(), {
      error: "PRIVACY_SUBJECT_ANONYMIZED",
    });
    const notArchived = await post(
      `${url}/admin/prospects/66666666-6666-4666-8666-666666666666/unarchive`,
      { reason: "accounting_correction" },
    );
    assert.equal(notArchived.status, 409);
    assert.deepEqual(await notArchived.json(), {
      error: "PRIVACY_SUBJECT_NOT_ARCHIVED",
    });
    assert.deepEqual(calls, [
      `unarchive:customer:${customerId}:returning_customer`,
      `unarchive:customer:${anonymizedId}:archived_by_mistake`,
      "unarchive:prospect:66666666-6666-4666-8666-666666666666:accounting_correction",
    ]);
  });
});
