import assert from "node:assert/strict";
import test from "node:test";
import type { OutboxRow } from "../repositories/notifications.repository.js";
import { NotificationJobsService } from "../services/notification-jobs.service.js";

const now = new Date("2026-10-24T10:00:00Z");
const row = (attemptCount: number): OutboxRow => ({ id: `row-${attemptCount}`, notificationId: null, recipientUserId: "u", toEmail: "coach@kfit.local", subject: "s", bodyText: "b", bodyHtml: null,
  messageKind: "digest", dedupeKey: `k${attemptCount}`, status: "sending", attemptCount, nextAttemptAt: now, lastAttemptAt: now, sentAt: null, providerMessageId: null, lastErrorCode: null, createdAt: now, updatedAt: now });

function harness(rows: OutboxRow[], send: () => Promise<{ messageId: string | null }>, withMail = true) {
  const calls: string[] = [];
  const repository = {
    async reconcile() { return { recipients: 0, opened: 0, refreshed: 0, resolved: 0, emailsQueued: 0 }; },
    async interruptStale() { return 0; },
    async claimDue() { return rows; },
    async markSent(id: string) { calls.push(`sent:${id}`); },
    async markFailed(id: string, code: string, next: Date | null) { calls.push(`failed:${id}:${code}:${next ? (next.getTime() - now.getTime()) / 60_000 : "dead"}`); },
  };
  return { calls, service: new NotificationJobsService(repository, async () => [], withMail ? { send } : null, () => now) };
}

test("SMTP failure schedules a bounded retry; the last attempt goes to dead letter", async () => {
  const { calls, service } = harness([row(1), row(5)], async () => { throw Object.assign(new Error("Greylisted <coach@kfit.local>"), { responseCode: 451 }); });
  assert.deepEqual(await service.deliver(), { claimed: 2, sent: 0, failed: 1, deadLettered: 1, interrupted: 0 });
  assert.deepEqual(calls, ["failed:row-1:SMTP_451:5", "failed:row-5:SMTP_451:dead"]);
});

test("missing SMTP configuration never throws and records NOT_CONFIGURED", async () => {
  const { calls, service } = harness([row(1)], async () => ({ messageId: "x" }), false);
  await service.deliver();
  assert.deepEqual(calls, ["failed:row-1:SMTP_NOT_CONFIGURED:5"]);
});

test("successful send marks the row sent once", async () => {
  const { calls, service } = harness([row(1)], async () => ({ messageId: "<m@kfit>" }));
  assert.equal((await service.deliver()).sent, 1);
  assert.deepEqual(calls, ["sent:row-1"]);
});
