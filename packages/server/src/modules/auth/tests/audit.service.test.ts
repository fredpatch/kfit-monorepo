import assert from "node:assert/strict";
import test from "node:test";
import { auditEvents } from "../../../db/schema/auth.js";
import { AuditService, hashAuditContext, type RecordAuditEventInput } from "../services/audit.service.js";

const auditHashPepper = "a-secure-test-audit-pepper-that-is-longer-than-32-characters";

test("audit context hashing is deterministic and never stores raw request context", () => {
  const rawIp = "192.0.2.10";
  const first = hashAuditContext(rawIp, auditHashPepper);
  const second = hashAuditContext(rawIp, auditHashPepper);

  assert.equal(first, second);
  assert.notEqual(first, rawIp);
  assert.match(first ?? "", /^[a-f0-9]{64}$/);
  assert.equal(hashAuditContext(null, auditHashPepper), null);
});

test("AuditService writes normalized audit events with hashed request metadata", async () => {
  const insertedValues: unknown[] = [];
  const fakeDb = {
    insert(table: unknown) {
      assert.equal(table, auditEvents);
      return {
        values(value: unknown) {
          insertedValues.push(value);
          return {
            returning: async () => [{ id: "00000000-0000-0000-0000-000000000001", ...(value as object) }],
          };
        },
      };
    },
  };

  const service = new AuditService(fakeDb as never, { auditHashPepper });
  const input: RecordAuditEventInput = {
    actorType: "user",
    actorUserId: "11111111-1111-1111-1111-111111111111",
    eventType: "auth.login",
    entityType: "auth_session",
    entityId: "22222222-2222-2222-2222-222222222222",
    result: "success",
    requestId: "33333333-3333-3333-3333-333333333333",
    ipAddress: "192.0.2.10",
    userAgent: "Mozilla/5.0",
    metadata: { trustedDevice: false },
  };

  const event = await service.record(input);
  const stored = insertedValues[0] as {
    ipHash: string;
    userAgentHash: string;
    metadataJson: { trustedDevice: boolean };
    actorUserId: string;
    eventType: string;
    result: string;
  };

  assert.ok(event);
  assert.equal(event.eventType, "auth.login");
  assert.equal(stored.actorUserId, input.actorUserId);
  assert.equal(stored.result, "success");
  assert.notEqual(stored.ipHash, input.ipAddress);
  assert.notEqual(stored.userAgentHash, input.userAgent);
  assert.equal(stored.metadataJson.trustedDevice, false);
});
