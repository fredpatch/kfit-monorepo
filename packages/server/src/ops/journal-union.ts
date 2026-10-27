import {
  parseJournalLine,
  toJournalLine,
} from "../modules/privacy/services/privacy-journal.js";

export type JournalUnion = {
  append: string[];
  counts: { live: number; bundle: number; appended: number; malformed: number };
};

const splitLines = (text: string) =>
  text.split("\n").filter((line) => line.trim() !== "");

/**
 * S7.4b B6.4: the live journal is never overwritten (it holds anonymizations made after the backup). Returns the bundle lines
 * whose eventId is missing from the live journal, ordered by executedAt, to append. Malformed lines are counted, never copied.
 */
export function unionJournal(
  liveText: string,
  bundleText: string,
): JournalUnion {
  const live = splitLines(liveText).map(parseJournalLine),
    bundle = splitLines(bundleText).map(parseJournalLine);
  const known = new Set(
    live.flatMap((event) => (event ? [event.eventId] : [])),
  );
  const missing = new Map<string, NonNullable<(typeof bundle)[number]>>();
  for (const event of bundle)
    if (event && !known.has(event.eventId) && !missing.has(event.eventId))
      missing.set(event.eventId, event);
  const append = [...missing.values()]
    .sort(
      (a, b) =>
        a.executedAt.getTime() - b.executedAt.getTime() ||
        a.eventId.localeCompare(b.eventId),
    )
    .map(toJournalLine);
  const liveMalformed = live.filter((event) => !event).length,
    bundleMalformed = bundle.filter((event) => !event).length;
  return {
    append,
    counts: {
      live: live.length - liveMalformed,
      bundle: bundle.length - bundleMalformed,
      appended: append.length,
      malformed: liveMalformed + bundleMalformed,
    },
  };
}
