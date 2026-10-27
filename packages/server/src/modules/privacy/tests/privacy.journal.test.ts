import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { businessDateKey } from "@kfit/shared";
import { privacyPurgeJob } from "../jobs/privacy-purge.job.js";
import {
  PRIVACY_JOURNAL_FILE,
  createPrivacyJournal,
  mergeEvents,
  parseJournalLine,
  toJournalLine,
} from "../services/privacy-journal.js";
import { syncPrivacyJournal } from "../services/privacy-replay.js";

const event = (id: string, at: string) => ({
  eventId: id,
  subjectType: "customer" as const,
  subjectId: "11111111-1111-4111-8111-111111111111",
  executedAt: new Date(at),
  planVersion: 1,
  linkedSubjects: [
    {
      subjectType: "prospect" as const,
      subjectId: "22222222-2222-4222-8222-222222222222",
    },
  ],
});
const a = event(
    "33333333-3333-4333-8333-333333333333",
    "2026-10-25T10:00:00.000Z",
  ),
  b = event("44444444-4444-4444-8444-444444444444", "2026-10-25T09:00:00.000Z");

test("journal line holds exactly the D11 fields (IDs only) and round-trips", () => {
  const line = toJournalLine(a);
  assert.ok(line.endsWith("\n"));
  assert.deepEqual(Object.keys(JSON.parse(line)).sort(), [
    "eventId",
    "executedAt",
    "linkedSubjects",
    "planVersion",
    "subjectId",
    "subjectType",
  ]);
  assert.deepEqual(parseJournalLine(line), a);
  for (const bad of [
    "{",
    "{}",
    JSON.stringify({ ...JSON.parse(line), subjectType: "user" }),
    JSON.stringify({ ...JSON.parse(line), eventId: "x" }),
  ])
    assert.equal(parseJournalLine(bad), null);
});

test("journal ∪ DB merge dedupes by eventId and orders oldest first", () => {
  assert.deepEqual(
    mergeEvents([a], [b, { ...a, planVersion: 9 }]).map((e) => [
      e.eventId,
      e.planVersion,
    ]),
    [
      [b.eventId, 1],
      [a.eventId, 1],
    ],
  );
});

test("journal append is durable JSONL in the configured directory; disabled without a directory; sync appends only missing events", async () => {
  assert.equal(createPrivacyJournal(undefined), null);
  assert.equal(createPrivacyJournal(""), null);
  const dir = await mkdtemp(path.join(tmpdir(), "kfit-privacy-journal-"));
  try {
    const journal = createPrivacyJournal(path.join(dir, "nested"))!;
    assert.deepEqual(
      await journal.read(),
      { events: [], malformed: 0 },
      "missing file = empty journal",
    );
    await journal.append(a);
    await appendFile(
      path.join(dir, "nested", PRIVACY_JOURNAL_FILE),
      "not json\n",
    );
    const read = await journal.read();
    assert.deepEqual(read.events, [a]);
    assert.equal(read.malformed, 1);
    const sync = await syncPrivacyJournal({
      repository: {
        async executedEventsSince() {
          return [a, b];
        },
      },
      journal,
    });
    assert.deepEqual(sync, {
      dbEvents: 2,
      alreadyJournaled: 1,
      appended: 1,
      journalMalformed: 1,
    });
    assert.deepEqual(
      (await journal.read()).events.map((e) => e.eventId),
      [a.eventId, b.eventId],
    );
    const raw = await readFile(
      path.join(dir, "nested", PRIVACY_JOURNAL_FILE),
      "utf8",
    );
    assert.equal(raw.split("\n").filter(Boolean).length, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("purge job: daily 03:00 Africa/Libreville, one run per business date, batch 50, records the run (D3d)", async () => {
  const calls: string[] = [];
  const now = new Date("2026-10-25T02:30:00.000Z");
  const job = privacyPurgeJob(
    {
      async purgeDue(at, limit) {
        calls.push(`purge:${at.toISOString()}:${limit}`);
        return { scanned: 2, purged: 1, skippedHold: 1, failed: 0 };
      },
      async recordPurgeRun(counts) {
        calls.push(`audit:${JSON.stringify(counts)}`);
      },
    },
    async () => undefined,
    {
      async run(at, limit) {
        calls.push(`retention:${at.toISOString()}:${limit}`);
        return {
          outboxRedacted: 3,
          notificationsDeleted: 2,
          auditEventsDeleted: 1,
          accessEventsDeleted: 4,
          retentionStepsFailed: 0,
        };
      },
    },
    () => now,
  );
  assert.equal(job.jobKey, "privacy.purge");
  assert.equal(job.cron, "0 3 * * *");
  assert.equal(job.timezone, "Africa/Libreville");
  assert.equal(job.runKey?.(now), businessDateKey(now));
  const counts = {
    scanned: 2,
    purged: 1,
    skippedHold: 1,
    failed: 0,
    outboxRedacted: 3,
    notificationsDeleted: 2,
    auditEventsDeleted: 1,
    accessEventsDeleted: 4,
    retentionStepsFailed: 0,
  };
  assert.deepEqual(await job.work(), counts);
  assert.deepEqual(calls, [
    `purge:${now.toISOString()}:50`,
    `retention:${now.toISOString()}:50`,
    `audit:${JSON.stringify(counts)}`,
  ]);
});

test("RET-01 R6: a failed retention step still audits every count, then fails the run with RETENTION_STEP_FAILED", async () => {
  const audited: Array<Record<string, number>> = [];
  const job = privacyPurgeJob(
    {
      async purgeDue() {
        return { scanned: 0, purged: 0, skippedHold: 0, failed: 0 };
      },
      async recordPurgeRun(counts) {
        audited.push(counts);
      },
    },
    async () => undefined,
    {
      async run() {
        return {
          outboxRedacted: 5,
          notificationsDeleted: 0,
          auditEventsDeleted: 0,
          accessEventsDeleted: 0,
          retentionStepsFailed: 1,
        };
      },
    },
  );
  await assert.rejects(job.work(), { message: "RETENTION_STEP_FAILED" });
  assert.equal(audited[0]?.outboxRedacted, 5);
  assert.equal(audited[0]?.retentionStepsFailed, 1);
});
