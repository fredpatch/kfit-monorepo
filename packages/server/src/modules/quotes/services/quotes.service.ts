import {
  quoteDecisions,
  type QuoteDecision,
  type QuoteErrorCode,
  type QuoteResponse,
  type QuotesResponse,
  type PublicQuoteResponse,
  type QuoteSnapshot,
} from "@kfit/shared";
import {
  financeDate,
  maximumXaf,
} from "../../finance/services/finance.policy.js";
import type { StoredDocumentFile } from "../../documents/services/document-storage.service.js";

export type QuoteActor = {
  userId: string | null;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};
export type Draft = { amountXaf: number; validUntil: Date; terms: string };
export type QuoteAction =
  | "list"
  | "read"
  | "create"
  | "version"
  | "edit"
  | "issue"
  | "pdf"
  | "share"
  | "revoke"
  | "synchronize"
  | "cancel"
  | "public-read"
  | "public-pdf"
  | "respond";
export type QuoteCommand =
  | { action: "create"; draft: Draft }
  | { action: "version"; draft: Draft }
  | { action: "edit"; draft: Draft }
  | {
      action: "invalid-public-input";
      event: "public-read" | "public-pdf" | "respond";
    }
  | { action: "share"; expiresAt: Date }
  | { action: "respond"; decision: QuoteDecision }
  | {
      [A in Exclude<
        QuoteAction,
        "create" | "version" | "edit" | "share" | "respond"
      >]: { action: A };
    }[Exclude<
      QuoteAction,
      "create" | "version" | "edit" | "share" | "respond"
    >];
export type QuoteResult =
  | { ok: false; error: QuoteErrorCode }
  | { ok: true; body: QuoteResponse | QuotesResponse | PublicQuoteResponse }
  | {
      ok: true;
      binary: { bytes: Buffer; mimeType: "application/pdf"; filename: string };
    };
export interface QuoteArtifacts {
  render(snapshot: QuoteSnapshot): Promise<Buffer>;
  persist(input: {
    bytes: Buffer;
    mimeType: string;
    originalFilename: string;
  }): Promise<StoredDocumentFile>;
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}
export interface QuotesRepository {
  execute(
    id: string,
    command: QuoteCommand,
    actor: QuoteActor,
  ): Promise<QuoteResult>;
}
export const quoteFailure = (error: QuoteErrorCode): QuoteResult => ({
  ok: false,
  error,
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class QuotesService {
  constructor(private readonly repository: QuotesRepository) {}
  async execute(
    id: string,
    action: QuoteAction,
    body: unknown,
    actor: QuoteActor,
  ): Promise<QuoteResult> {
    const isPublic =
      action === "public-read" ||
      action === "public-pdf" ||
      action === "respond";
    if (!(isPublic ? /^[A-Za-z0-9_-]{43}$/.test(id) : uuid.test(id))) {
      // Malformed bearers still reach the repository's failed-access audit path.
      if (
        action === "public-read" ||
        action === "public-pdf" ||
        action === "respond"
      )
        return this.repository.execute(
          "",
          { action: "invalid-public-input", event: action },
          actor,
        );
      return quoteFailure("QUOTE_INVALID_INPUT");
    }
    const invalid = () =>
      isPublic &&
      (action === "public-read" ||
        action === "public-pdf" ||
        action === "respond")
        ? this.repository.execute(
            id,
            { action: "invalid-public-input", event: action },
            actor,
          )
        : Promise.resolve(quoteFailure("QUOTE_INVALID_INPUT"));
    if (!body || typeof body !== "object" || Array.isArray(body))
      return invalid();
    const input = body as Record<string, unknown>;
    let command: QuoteCommand;
    if (action === "create" || action === "version" || action === "edit") {
      if (
        Object.keys(input).some(
          (k) => !["amountXaf", "validUntil", "terms"].includes(k),
        ) ||
        typeof input.amountXaf !== "number" ||
        !Number.isSafeInteger(input.amountXaf) ||
        input.amountXaf < 0 ||
        input.amountXaf > maximumXaf ||
        typeof input.terms !== "string" ||
        !input.terms.trim() ||
        input.terms.length > 10000 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.terms)
      )
        return quoteFailure("QUOTE_INVALID_INPUT");
      const validUntil = financeDate(input.validUntil);
      if (!validUntil) return quoteFailure("QUOTE_INVALID_INPUT");
      command = {
        action,
        draft: {
          amountXaf: input.amountXaf,
          validUntil,
          terms: input.terms.trim(),
        },
      };
    } else if (action === "share") {
      const expiresAt = financeDate(input.expiresAt);
      if (!expiresAt || Object.keys(input).some((k) => k !== "expiresAt"))
        return quoteFailure("QUOTE_INVALID_INPUT");
      command = { action, expiresAt };
    } else if (action === "respond") {
      const decision = quoteDecisions.find((d) => d === input.decision);
      if (!decision || Object.keys(input).some((k) => k !== "decision"))
        return invalid();
      command = { action, decision };
    } else {
      if (Object.keys(input).length) return invalid();
      command = { action };
    }
    return this.repository.execute(id, command, actor);
  }
}
