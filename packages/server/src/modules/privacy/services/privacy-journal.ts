import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { privacySubjectTypes, type PrivacySubjectType } from "@kfit/shared";
import { resolveConfiguredPath } from "../../../config/paths.js";
import type {
  ExecutedPrivacyEvent,
  LinkedSubject,
} from "../repositories/privacy.repository.js";

/*
 * D11 off-database journal: one JSON line per executed anonymization, IDs only (no PII), fsynced. It lives outside the
 * database so a restore from an older backup can still replay events executed after that backup.
 */
export const PRIVACY_JOURNAL_FILE = "privacy-journal.jsonl";
export const PRIVACY_JOURNAL_DIR_ENV = "KFIT_PRIVACY_JOURNAL_DIR";

type JournalLine = {
  eventId: string;
  subjectType: PrivacySubjectType;
  subjectId: string;
  executedAt: string;
  planVersion: number;
  linkedSubjects: LinkedSubject[];
};

export type PrivacyJournal = {
  append(event: ExecutedPrivacyEvent): Promise<void>;
  /** Parsed events (malformed lines skipped and counted) plus the event ids already present. */
  read(): Promise<{ events: ExecutedPrivacyEvent[]; malformed: number }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toJournalLine(event: ExecutedPrivacyEvent): string {
  const line: JournalLine = {
    eventId: event.eventId,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    executedAt: event.executedAt.toISOString(),
    planVersion: event.planVersion,
    linkedSubjects: event.linkedSubjects.map(({ subjectType, subjectId }) => ({
      subjectType,
      subjectId,
    })),
  };
  return `${JSON.stringify(line)}\n`;
}

export function parseJournalLine(raw: string): ExecutedPrivacyEvent | null {
  try {
    const line = JSON.parse(raw) as Partial<JournalLine>;
    const executedAt = new Date(line.executedAt ?? "");
    const linked = Array.isArray(line.linkedSubjects)
      ? line.linkedSubjects
      : [];
    const subjectOk = (type: unknown, id: unknown) =>
      (privacySubjectTypes as readonly unknown[]).includes(type) &&
      typeof id === "string" &&
      uuidPattern.test(id);
    if (
      typeof line.eventId !== "string" ||
      !uuidPattern.test(line.eventId) ||
      !subjectOk(line.subjectType, line.subjectId) ||
      !Number.isFinite(executedAt.getTime()) ||
      !Number.isSafeInteger(line.planVersion) ||
      !linked.every((s) => subjectOk(s?.subjectType, s?.subjectId))
    )
      return null;
    return {
      eventId: line.eventId,
      subjectType: line.subjectType!,
      subjectId: line.subjectId!,
      executedAt,
      planVersion: line.planVersion!,
      linkedSubjects: linked,
    };
  } catch {
    return null;
  }
}

/** Null when the directory is not configured: the journal is then disabled (dev warns at startup). Relative = from the repository root (FIX-03 F1). */
export function createPrivacyJournal(
  configured: string | undefined,
): PrivacyJournal | null {
  const directory = resolveConfiguredPath(configured);
  if (!directory) return null;
  const file = path.join(directory, PRIVACY_JOURNAL_FILE);
  return {
    async append(event) {
      await mkdir(directory, { recursive: true });
      const handle = await open(file, "a");
      try {
        await handle.write(toJournalLine(event));
        await handle.sync();
      } finally {
        await handle.close();
      }
    },
    async read() {
      let text = "";
      try {
        text = await readFile(file, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          return { events: [], malformed: 0 };
        throw error;
      }
      const lines = text.split("\n").filter((line) => line.trim() !== "");
      const events = lines
        .map(parseJournalLine)
        .filter((event): event is ExecutedPrivacyEvent => event !== null);
      return { events, malformed: lines.length - events.length };
    },
  };
}

/** journal ∪ DB, deduplicated by eventId, oldest first (D11). */
export function mergeEvents(
  ...sources: ExecutedPrivacyEvent[][]
): ExecutedPrivacyEvent[] {
  const byId = new Map<string, ExecutedPrivacyEvent>();
  for (const source of sources)
    for (const event of source)
      if (!byId.has(event.eventId)) byId.set(event.eventId, event);
  return [...byId.values()].sort(
    (a, b) =>
      a.executedAt.getTime() - b.executedAt.getTime() ||
      a.eventId.localeCompare(b.eventId),
  );
}
