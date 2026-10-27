import type {
  DrizzlePrivacyRepository,
  RemoveStoredObject,
} from "../repositories/privacy.repository.js";
import { mergeEvents, type PrivacyJournal } from "./privacy-journal.js";

type ReplayRepository = Pick<
  DrizzlePrivacyRepository,
  | "executedEventsSince"
  | "replay"
  | "subjectDocumentIds"
  | "purgeDue"
  | "recordReplayRun"
>;
export type PrivacyReplayCounts = {
  events: number;
  fromJournalOnly: number;
  replayed: number;
  missingSubject: number;
  purged: number;
  skippedHold: number;
  purgeFailed: number;
  journalMalformed: number;
};

/**
 * Rule 7 / D11: re-applies every executed event since `since` from journal ∪ DB (dedupe by eventId), oldest first, then purges
 * the subject's documents restored from a backup. Idempotent: running it twice gives the same end state. Counts only.
 */
export async function runPrivacyReplay(
  deps: {
    repository: ReplayRepository;
    journal: PrivacyJournal | null;
    removeStoredObject: RemoveStoredObject;
  },
  since: Date,
  now: Date,
): Promise<PrivacyReplayCounts> {
  const journal = deps.journal
    ? await deps.journal.read()
    : { events: [], malformed: 0 };
  const fromDb = await deps.repository.executedEventsSince(since);
  const fromJournal = journal.events.filter(
    (event) => event.executedAt >= since,
  );
  const dbIds = new Set(fromDb.map((event) => event.eventId));
  const events = mergeEvents(fromJournal, fromDb);
  const counts: PrivacyReplayCounts = {
    events: events.length,
    fromJournalOnly: fromJournal.filter((e) => !dbIds.has(e.eventId)).length,
    replayed: 0,
    missingSubject: 0,
    purged: 0,
    skippedHold: 0,
    purgeFailed: 0,
    journalMalformed: journal.malformed,
  };
  for (const event of events) {
    if (!(await deps.repository.replay(event, now))) {
      counts.missingSubject += 1;
      continue;
    }
    counts.replayed += 1;
    const documentIds = await deps.repository.subjectDocumentIds(event);
    const purge = await deps.repository.purgeDue(
      now,
      Math.max(documentIds.length, 1),
      deps.removeStoredObject,
      documentIds,
    );
    counts.purged += purge.purged;
    counts.skippedHold += purge.skippedHold;
    counts.purgeFailed += purge.failed;
  }
  await deps.repository.recordReplayRun(counts);
  return counts;
}

/** D11: appends the DB events missing from the journal (dedupe by eventId). */
export async function syncPrivacyJournal(deps: {
  repository: Pick<DrizzlePrivacyRepository, "executedEventsSince">;
  journal: PrivacyJournal;
}): Promise<{
  dbEvents: number;
  alreadyJournaled: number;
  appended: number;
  journalMalformed: number;
}> {
  const journal = await deps.journal.read();
  const known = new Set(journal.events.map((event) => event.eventId));
  const dbEvents = await deps.repository.executedEventsSince(new Date(0));
  let appended = 0;
  for (const event of dbEvents) {
    if (known.has(event.eventId)) continue;
    await deps.journal.append(event);
    known.add(event.eventId);
    appended += 1;
  }
  return {
    dbEvents: dbEvents.length,
    alreadyJournaled: dbEvents.length - appended,
    appended,
    journalMalformed: journal.malformed,
  };
}
