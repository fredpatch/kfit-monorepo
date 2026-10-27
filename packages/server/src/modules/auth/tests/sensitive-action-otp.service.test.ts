import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUserRecord } from "../services/auth-route.service.js";
import type { RecordAuditEventInput } from "../services/audit.service.js";
import type { OtpChallengeRecord } from "../services/otp-challenge.service.js";
import { SensitiveActionOtpService } from "../services/sensitive-action-otp.service.js";

const user: AuthUserRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "coach@kfit.local",
  passwordHash: "hash",
  status: "active",
  role: "coach",
};

const challenge: OtpChallengeRecord = {
  id: "33333333-3333-3333-3333-333333333333",
  userId: user.id,
  sessionId: "22222222-2222-2222-2222-222222222222",
  purpose: "sensitive_action",
  codeHash: "hash-only",
  expiresAt: new Date("2026-08-25T14:05:00.000Z"),
  attemptCount: 0,
  maxAttempts: 5,
  consumedAt: null,
  supersededAt: null,
  deliveryChannel: "email",
  createdAt: new Date("2026-08-25T14:00:00.000Z"),
  updatedAt: new Date("2026-08-25T14:00:00.000Z"),
};

const context = {
  userId: user.id,
  sessionId: "22222222-2222-2222-2222-222222222222",
  requestId: "req-1",
};

function createHarness(
  options: { existingUser?: AuthUserRecord | null; mailFails?: boolean } = {},
) {
  const issued: string[] = [];
  const sent: Array<{ to: string; code: string }> = [];
  const audits: RecordAuditEventInput[] = [];
  const service = new SensitiveActionOtpService(
    {
      async issue(input) {
        issued.push(`${input.purpose}:${input.userId}:${input.sessionId}`);
        return { challenge, code: "654321" };
      },
    },
    {
      async findById() {
        return options.existingUser === undefined ? user : options.existingUser;
      },
    },
    {
      async sendSensitiveActionCode(input) {
        if (options.mailFails) throw new Error("smtp down");
        sent.push({ to: input.to, code: input.code });
      },
    },
    {
      async record(input) {
        audits.push(input);
        return {};
      },
    },
  );
  return { service, issued, sent, audits };
}

test("sensitive-action OTP is issued for the session and e-mailed to the session's user", async () => {
  const harness = createHarness();
  const result = await harness.service.request(context);

  assert.deepEqual(result, { status: "sent", challenge });
  assert.deepEqual(harness.issued, [
    `sensitive_action:${user.id}:${context.sessionId}`,
  ]);
  assert.deepEqual(harness.sent, [{ to: "coach@kfit.local", code: "654321" }]);
  assert.deepEqual(
    harness.audits.map((audit) => [audit.eventType, audit.result]),
    [["auth.otp.delivered", "success"]],
  );
  assert.equal(
    JSON.stringify(harness.audits).includes("654321"),
    false,
    "code never reaches the audit log",
  );
});

test("a failed e-mail is audited and reported without exposing the code", async () => {
  const harness = createHarness({ mailFails: true });

  assert.deepEqual(await harness.service.request(context), {
    status: "delivery_failed",
  });
  assert.deepEqual(
    harness.audits.map((audit) => [audit.eventType, audit.metadata]),
    [
      [
        "auth.otp.delivery_failed",
        { purpose: "sensitive_action", reason: "mail_delivery_failed" },
      ],
    ],
  );
  assert.equal(
    JSON.stringify(harness.audits).includes("654321"),
    false,
    "code never reaches the audit log",
  );
});

test("no code is issued for a missing or inactive account", async () => {
  for (const existingUser of [null, { ...user, status: "locked" as const }]) {
    const harness = createHarness({ existingUser });
    assert.deepEqual(await harness.service.request(context), {
      status: "delivery_failed",
    });
    assert.equal(harness.issued.length, 0);
    assert.equal(harness.sent.length, 0);
  }
});
