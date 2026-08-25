import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { createServerApp } from "../../dist/app.js";
import { AuthController } from "../../dist/modules/auth/controllers/auth.controller.js";
import { NodemailerAuthMailDelivery } from "../../dist/modules/auth/services/auth-mail.delivery.js";
import {
  InMemoryRecoveryRateLimiter,
  PasswordRecoveryService,
} from "../../dist/modules/auth/services/password-recovery.service.js";
import { OtpChallengeService } from "../../dist/modules/auth/services/otp-challenge.service.js";
import { PasswordService } from "../../dist/modules/auth/services/password.service.js";

const mailpitBaseUrl = (process.env.MAILPIT_API_URL || `http://127.0.0.1:${process.env.MAILPIT_UI_PORT || "8025"}`).replace(/\/$/, "");
const recipient = `kfit-recovery-${Date.now()}@example.test`;
const userId = randomUUID();
const pepper = "kfit-recovery-preflight-pepper-at-least-32-characters";
const tokenSecret = "kfit-recovery-preflight-token-secret-at-least-32-characters";
const audits = [];
const challenges = [];
let resetRedeemed = false;
let storedPasswordHash = "old-password-hash";

function matches(challenge, lookup) {
  return challenge.userId === (lookup.userId ?? null)
    && challenge.sessionId === (lookup.sessionId ?? null)
    && challenge.purpose === lookup.purpose;
}

const otpRepository = {
  async supersedeActive(input) {
    let count = 0;
    for (const challenge of challenges) {
      if (matches(challenge, input) && !challenge.consumedAt && !challenge.supersededAt) {
        challenge.supersededAt = input.supersededAt;
        challenge.updatedAt = input.supersededAt;
        count += 1;
      }
    }
    return count;
  },
  async create(input) {
    const createdAt = new Date();
    const challenge = {
      id: randomUUID(),
      userId: input.userId,
      sessionId: input.sessionId,
      purpose: input.purpose,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      attemptCount: 0,
      maxAttempts: input.maxAttempts,
      consumedAt: null,
      supersededAt: null,
      deliveryChannel: input.deliveryChannel,
      createdAt,
      updatedAt: createdAt,
    };
    challenges.push(challenge);
    return challenge;
  },
  async findLatest(input) {
    return [...challenges].reverse().find((challenge) => matches(challenge, input)) ?? null;
  },
  async incrementAttempt(input) {
    const challenge = challenges.find((item) => item.id === input.challengeId);
    assert.ok(challenge, "OTP challenge must exist before increment");
    challenge.attemptCount = input.attemptCount;
    challenge.updatedAt = input.updatedAt;
    return challenge;
  },
  async consume(input) {
    const challenge = challenges.find((item) => item.id === input.challengeId);
    assert.ok(challenge, "OTP challenge must exist before consumption");
    challenge.consumedAt = input.consumedAt;
    challenge.updatedAt = input.updatedAt;
    return challenge;
  },
};

const audit = {
  async record(input) {
    audits.push(input);
    return input;
  },
};

const user = {
  id: userId,
  email: recipient,
  passwordHash: storedPasswordHash,
  status: "active",
  role: "coach",
};

const recoveryRepository = {
  async findByEmail(email) {
    return email === recipient ? { ...user, passwordHash: storedPasswordHash } : null;
  },
  async completeReset(input) {
    if (resetRedeemed) return false;
    const challenge = challenges.find((item) => item.id === input.challengeId);
    if (
      !challenge?.consumedAt
      || challenge.userId !== input.userId
      || challenge.consumedAt.toISOString() !== input.verifiedAt
    ) return false;
    resetRedeemed = true;
    storedPasswordHash = input.passwordHash;
    return true;
  },
};

const smtpPort = Number(process.env.SMTP_PORT || "1025");
assert.ok(Number.isSafeInteger(smtpPort) && smtpPort > 0, "SMTP_PORT must be a positive integer");

const mail = new NodemailerAuthMailDelivery({
  host: process.env.SMTP_HOST || "127.0.0.1",
  port: smtpPort,
  secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
  from: process.env.SMTP_FROM || "K'FIT Dev <noreply@kfit.local>",
  ...(process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" } : {}),
});

const otp = new OtpChallengeService(otpRepository, audit, {
  otpPepper: pepper,
  otpTtlMs: 5 * 60_000,
  otpMaxAttempts: 5,
});

const recovery = new PasswordRecoveryService(
  recoveryRepository,
  otp,
  new PasswordService(),
  mail,
  audit,
  new InMemoryRecoveryRateLimiter({
    windowMs: 15 * 60_000,
    requestMax: 5,
    verifyMax: 10,
    resetMax: 5,
  }),
  {
    recoveryTokenSecret: tokenSecret,
    recoveryGrantTtlMs: 10 * 60_000,
  },
);

const controller = new AuthController({
  passwordRecoveryService: recovery,
  otpChallengeService: otp,
});

const app = createServerApp({
  authController: controller,
  resolveAuthSession: () => null,
});
const server = createServer(app);
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address === "object", "Recovery preflight server must expose a TCP address");
const baseUrl = `http://127.0.0.1:${address.port}`;

async function http(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: baseUrl,
    },
    body: JSON.stringify(body),
  });
}

async function findMail() {
  const deadline = Date.now() + 10_000;
  const query = encodeURIComponent(`to:${recipient}`);
  while (Date.now() < deadline) {
    const response = await fetch(`${mailpitBaseUrl}/api/v1/search?query=${query}&limit=1`);
    if (response.ok) {
      const body = await response.json();
      if (Array.isArray(body.messages) && body.messages[0]?.ID) return body.messages[0].ID;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Mailpit did not receive a recovery email for ${recipient}`);
}

try {
  const unknown = await http("/auth/recovery/request", { email: `missing-${recipient}` });
  assert.equal(unknown.status, 202);
  assert.deepEqual(await unknown.json(), { accepted: true });

  const requested = await http("/auth/recovery/request", { email: recipient });
  assert.equal(requested.status, 202);
  const requestedBody = await requested.json();
  assert.deepEqual(requestedBody, { accepted: true });
  assert.equal(/\b\d{6}\b/.test(JSON.stringify(requestedBody)), false, "HTTP response must not expose the OTP");

  const messageId = await findMail();
  const messageResponse = await fetch(`${mailpitBaseUrl}/api/v1/message/${encodeURIComponent(messageId)}`);
  assert.equal(messageResponse.status, 200);
  const message = await messageResponse.json();
  assert.equal(message.Subject, "K'FIT — Code de réinitialisation");
  const otpMatch = String(message.Text || "").match(/Code\s*:\s*(\d{6})/);
  assert.ok(otpMatch?.[1], "Recovery email must contain a six-digit OTP");
  const code = otpMatch[1];

  const verified = await http("/auth/recovery/verify", { email: recipient, code });
  assert.equal(verified.status, 200);
  const verifiedBody = await verified.json();
  assert.equal(typeof verifiedBody.resetToken, "string");
  assert.ok(verifiedBody.resetToken.length > 40);
  assert.equal(JSON.stringify(verifiedBody).includes(code), false, "Verify response must not echo the OTP");

  const reset = await http("/auth/recovery/reset", {
    resetToken: verifiedBody.resetToken,
    password: "CorrectHorse10",
  });
  assert.equal(reset.status, 200);
  assert.deepEqual(await reset.json(), { reset: true });
  assert.notEqual(storedPasswordHash, "CorrectHorse10");
  assert.notEqual(storedPasswordHash, "old-password-hash");

  const replay = await http("/auth/recovery/reset", {
    resetToken: verifiedBody.resetToken,
    password: "CorrectHorse11",
  });
  assert.equal(replay.status, 400);
  assert.deepEqual(await replay.json(), { error: "AUTH_RECOVERY_GRANT_INVALID" });

  assert.ok(audits.some((event) => event.eventType === "auth.password_recovery.delivered"));
  assert.ok(audits.some((event) => event.eventType === "auth.password_recovery.completed"));

  console.log("✓ unknown recovery request returns the neutral accepted response");
  console.log("✓ recovery request sends a real OTP email through SMTP to Mailpit");
  console.log("✓ HTTP responses never expose the OTP");
  console.log("✓ Mailpit message contains the expected French subject and six-digit code");
  console.log("✓ emailed OTP produces a short-lived reset grant through HTTP");
  console.log("✓ password reset succeeds once and replay is rejected");
  console.log("✓ recovery delivery and completion audit events are recorded");
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
