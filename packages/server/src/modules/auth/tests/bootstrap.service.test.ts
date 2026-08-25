import assert from "node:assert/strict";
import test from "node:test";
import { BootstrapService, type BootstrapRepository } from "../services/bootstrap.service.js";
import { type AuthUserRecord } from "../services/auth-route.service.js";
import { type RecordAuditEventInput } from "../services/audit.service.js";
import { PasswordService } from "../services/password.service.js";

const user: AuthUserRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "coach@kfit.local",
  passwordHash: "hash-only",
  status: "active",
  role: "coach",
};

function makeService(existingUsers = 0) {
  const created: Array<{ email: string; passwordHash: string; role: "admin" | "coach" }> = [];
  const auditEvents: RecordAuditEventInput[] = [];

  const repository: BootstrapRepository = {
    async countUsers() {
      return existingUsers + created.length;
    },
    async createFirstUser(input) {
      created.push(input);
      return { ...user, email: input.email, passwordHash: input.passwordHash, role: input.role };
    },
  };

  const passwords = new PasswordService({
    saltBytes: 8,
    keyLength: 32,
    cost: 1024,
    blockSize: 8,
    parallelization: 1,
    minLength: 12,
  });

  return {
    created,
    auditEvents,
    service: new BootstrapService(
      repository,
      passwords,
      {
        async record(input) {
          auditEvents.push(input);
        },
      },
      { defaultRole: "coach" },
    ),
  };
}

test("BootstrapService reports whether first account creation is required", async () => {
  assert.deepEqual(await makeService(0).service.status(), { required: true });
  assert.deepEqual(await makeService(1).service.status(), { required: false });
});

test("BootstrapService creates the first user once with canonical email and hashed password", async () => {
  const { service, created, auditEvents } = makeService();

  const result = await service.create({
    email: " Coach@KFIT.Local ",
    password: "CorrectHorse9",
    requestId: "33333333-3333-3333-3333-333333333333",
  });

  assert.equal(result.status, "created");
  assert.equal(result.status === "created" ? result.user.email : null, "coach@kfit.local");
  assert.equal(created[0]?.email, "coach@kfit.local");
  assert.notEqual(created[0]?.passwordHash, "CorrectHorse9");
  assert.equal(auditEvents.some((event) => event.eventType === "auth.bootstrap.created"), true);

  const second = await service.create({ email: "other@kfit.local", password: "CorrectHorse9" });
  assert.deepEqual(second, { status: "already_completed" });
});

test("BootstrapService rejects weak passwords without creating a user", async () => {
  const { service, created, auditEvents } = makeService();

  const result = await service.create({ email: "coach@kfit.local", password: "weak" });

  assert.deepEqual(result, { status: "invalid_password", reason: "too_short" });
  assert.equal(created.length, 0);
  assert.equal(auditEvents[0]?.eventType, "auth.bootstrap.rejected");
});
