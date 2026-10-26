import type { PrivacySubjectType, RetentionHoldScopeType, RetentionHoldType, UnarchiveReason } from "@kfit/shared";
import type { AnonymizeResult, DrizzlePrivacyRepository, PrivacyActor } from "../repositories/privacy.repository.js";
import type { PrivacyJournal } from "./privacy-journal.js";

export type PrivacyRepositoryPort = Pick<DrizzlePrivacyRepository, "archive" | "unarchive" | "anonymize" | "createHold" | "releaseHold" | "listHolds">;
/** Receives the error type only: journal failures must not leak paths or event content into logs. */
export type JournalFailureLog = (errorType: string) => void;

/** Orchestrates the privacy commands; the D11 journal append happens after the anonymization transaction committed. */
export class PrivacyService {
  constructor(
    private readonly repository: PrivacyRepositoryPort,
    private readonly journal: PrivacyJournal | null,
    private readonly onJournalFailure: JournalFailureLog,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  archive(subjectType: PrivacySubjectType, subjectId: string, actor: PrivacyActor) {
    return this.repository.archive(subjectType, subjectId, actor, this.clock());
  }

  unarchive(subjectType: PrivacySubjectType, subjectId: string, reason: UnarchiveReason, actor: PrivacyActor) {
    return this.repository.unarchive(subjectType, subjectId, reason, actor);
  }

  async anonymize(subjectType: PrivacySubjectType, subjectId: string, confirmName: string, actor: PrivacyActor): Promise<AnonymizeResult> {
    const result = await this.repository.anonymize(subjectType, subjectId, confirmName, actor, this.clock());
    if (result.ok && !result.alreadyAnonymized && this.journal) {
      // The DB event stays authoritative; `privacy:journal-sync` backfills a missed line.
      await this.journal.append(result.event).catch((error: unknown) => this.onJournalFailure(error instanceof Error ? error.name : typeof error));
    }
    return result;
  }

  createHold(input: { scopeType: RetentionHoldScopeType; scopeId: string; holdType: RetentionHoldType; reason: string }, actor: PrivacyActor) {
    return this.repository.createHold(input, actor, this.clock());
  }

  releaseHold(holdId: string, actor: PrivacyActor) {
    return this.repository.releaseHold(holdId, actor, this.clock());
  }

  listHolds(scopeType: RetentionHoldScopeType, scopeId: string) {
    return this.repository.listHolds(scopeType, scopeId);
  }
}
