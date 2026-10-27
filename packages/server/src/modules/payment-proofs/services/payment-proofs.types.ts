import type {
  FinancePaymentMethod,
  PaymentProofErrorCode,
  PaymentProofResponse,
  PaymentProofsResponse,
  PaymentProofLinkResponse,
  PublicPaymentProofMetadata,
} from "@kfit/shared";
import type {
  StoredDocumentFile,
  PrivateDocumentStorage,
} from "../../documents/services/document-storage.service.js";
export type ProofActor = {
  userId: string | null;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};
export type ProofClaims = {
  claimedAmountXaf: number;
  claimedPaymentMethod: FinancePaymentMethod;
  claimedOccurredAt: Date;
  claimedExternalReference: string | null;
};
export type ProofFacts = {
  confirmedAmountXaf: number;
  confirmedPaymentMethod: FinancePaymentMethod;
  confirmedOccurredAt: Date;
  externalReference: string | null;
  reviewNote: string | null;
};
export type ProofCommand =
  | {
      [A in
        | "list"
        | "read"
        | "document"
        | "revoke-link"
        | "metadata"
        | "prepare-upload"]: { action: A };
    }[
      | "list"
      | "read"
      | "document"
      | "revoke-link"
      | "metadata"
      | "prepare-upload"]
  | { action: "issue-link"; expiresAt: Date; supersedesProofId: string | null }
  | {
      action: "upload-failed";
      error: PaymentProofErrorCode;
      event?: "view" | "upload";
    }
  | { action: "commit-upload"; claims: ProofClaims; file: StoredDocumentFile }
  | { action: "confirm"; facts: ProofFacts }
  | { action: "partially-confirm"; facts: ProofFacts }
  | {
      action: "request-correction";
      reviewNote: string | null;
      customerMessage: string | null;
    }
  | { action: "reject"; reviewNote: string | null }
  | { action: "mark-duplicate"; reviewNote: string | null };
export type ProofAction = Exclude<
  ProofCommand["action"],
  "prepare-upload" | "commit-upload" | "upload-failed"
>;
export type ProofResult =
  | { ok: false; error: PaymentProofErrorCode }
  | {
      ok: true;
      body:
        | PaymentProofResponse
        | PaymentProofsResponse
        | PaymentProofLinkResponse
        | PublicPaymentProofMetadata
        | { submitted: true }
        | { revoked: true };
    }
  | { ok: true; binary: { bytes: Buffer; mimeType: string; filename: string } };
export interface PaymentProofsRepository {
  execute(
    id: string,
    command: ProofCommand,
    actor: ProofActor,
  ): Promise<ProofResult>;
}
export type ProofStorage = Pick<
  PrivateDocumentStorage,
  "persist" | "read" | "remove"
>;
export const proofFailure = (error: PaymentProofErrorCode): ProofResult => ({
  ok: false,
  error,
});
export const proofUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function proofLineage(value: unknown): {
  valid: boolean;
  supersedesProofId: string | null;
} {
  if (value === null || value === undefined)
    return { valid: true, supersedesProofId: null };
  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => k !== "supersedesProofId")
  )
    return { valid: false, supersedesProofId: null };
  const id = "supersedesProofId" in value ? value.supersedesProofId : null;
  return id === null || (typeof id === "string" && proofUuid.test(id))
    ? { valid: true, supersedesProofId: id }
    : { valid: false, supersedesProofId: null };
}
