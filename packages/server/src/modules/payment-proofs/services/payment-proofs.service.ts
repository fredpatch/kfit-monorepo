import {
  financePaymentMethods,
  type PaymentProofErrorCode,
} from "@kfit/shared";
import {
  financeDate,
  validXaf,
} from "../../finance/services/finance.policy.js";
import { DocumentStorageError } from "../../documents/services/document-storage.service.js";
import type { UploadPayload } from "../../documents/services/documents.service.js";
import {
  proofFailure,
  proofUuid,
  type ProofAction,
  type ProofActor,
  type ProofClaims,
  type ProofCommand,
  type ProofResult,
  type ProofStorage,
  type PaymentProofsRepository,
} from "./payment-proofs.types.js";
const object = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);
const fieldsOnly = (v: Record<string, unknown>, fields: string[]) =>
  Object.keys(v).every((k) => fields.includes(k));
function text(
  value: unknown,
  limit: number,
  reference = false,
): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.normalize("NFKC").trim();
  if (
    normalized.length > limit ||
    (reference
      ? /[\u0000-\u001f\u007f]/
      : /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
    ).test(normalized)
  )
    return undefined;
  return normalized || null;
}
export function parseProofClaims(body: unknown): ProofClaims | null {
  if (
    !object(body) ||
    !fieldsOnly(body, [
      "claimedAmountXaf",
      "claimedPaymentMethod",
      "claimedOccurredAt",
      "claimedExternalReference",
    ]) ||
    !validXaf(body.claimedAmountXaf)
  )
    return null;
  const method = financePaymentMethods.find(
      (m) => m === body.claimedPaymentMethod,
    ),
    date = financeDate(body.claimedOccurredAt),
    reference = text(body.claimedExternalReference, 200, true);
  return method && date && reference !== undefined
    ? {
        claimedAmountXaf: body.claimedAmountXaf,
        claimedPaymentMethod: method,
        claimedOccurredAt: date,
        claimedExternalReference: reference,
      }
    : null;
}
export function proofFileError(error: unknown): PaymentProofErrorCode {
  if (error instanceof DocumentStorageError)
    return error.code === "DOCUMENT_FILE_INFECTED"
      ? "PAYMENT_PROOF_MALWARE_DETECTED"
      : [
            "DOCUMENT_FILE_TOO_LARGE",
            "DOCUMENT_FILE_TYPE_UNSUPPORTED",
            "DOCUMENT_FILE_SIGNATURE_INVALID",
          ].includes(error.code)
        ? "PAYMENT_PROOF_UPLOAD_INVALID"
        : "PAYMENT_PROOF_ROUTE_UNEXPECTED_FAILURE";
  return "PAYMENT_PROOF_ROUTE_UNEXPECTED_FAILURE";
}
const bearer = (id: string) => (/^[A-Za-z0-9_-]{43}$/.test(id) ? id : "");
export class PaymentProofsService {
  constructor(
    private readonly repository: PaymentProofsRepository,
    private readonly storage: ProofStorage,
  ) {}
  async execute(
    id: string,
    action: ProofAction,
    body: unknown,
    actor: ProofActor,
  ): Promise<ProofResult> {
    if (action === "metadata") {
      if (!object(body) || Object.keys(body).length)
        return this.repository.execute(
          bearer(id),
          {
            action: "upload-failed",
            event: "view",
            error: "PAYMENT_PROOF_INVALID_INPUT",
          },
          actor,
        );
      return this.repository.execute(bearer(id), { action }, actor);
    }
    if (!proofUuid.test(id) || !object(body))
      return proofFailure("PAYMENT_PROOF_INVALID_INPUT");
    let command: ProofCommand;
    if (action === "issue-link") {
      const expiresAt = financeDate(body.expiresAt);
      if (
        !fieldsOnly(body, ["expiresAt", "supersedesProofId"]) ||
        !expiresAt ||
        (body.supersedesProofId !== undefined &&
          body.supersedesProofId !== null &&
          (typeof body.supersedesProofId !== "string" ||
            !proofUuid.test(body.supersedesProofId)))
      )
        return proofFailure("PAYMENT_PROOF_INVALID_INPUT");
      command = {
        action,
        expiresAt,
        supersedesProofId:
          typeof body.supersedesProofId === "string"
            ? body.supersedesProofId
            : null,
      };
    } else if (action === "confirm" || action === "partially-confirm") {
      const method = financePaymentMethods.find(
          (m) => m === body.confirmedPaymentMethod,
        ),
        date = financeDate(body.confirmedOccurredAt),
        reference = text(body.externalReference, 200, true),
        note = text(body.reviewNote, 2000);
      if (
        !fieldsOnly(body, [
          "confirmedAmountXaf",
          "confirmedPaymentMethod",
          "confirmedOccurredAt",
          "externalReference",
          "reviewNote",
        ]) ||
        !validXaf(body.confirmedAmountXaf) ||
        !method ||
        !date ||
        reference === undefined ||
        note === undefined
      )
        return proofFailure("PAYMENT_PROOF_INVALID_INPUT");
      command = {
        action,
        facts: {
          confirmedAmountXaf: body.confirmedAmountXaf,
          confirmedPaymentMethod: method,
          confirmedOccurredAt: date,
          externalReference: reference,
          reviewNote: note,
        },
      };
    } else if (
      action === "request-correction" ||
      action === "reject" ||
      action === "mark-duplicate"
    ) {
      const note = text(body.reviewNote, 2000),
        message = text(body.customerMessage, 2000);
      if (
        !fieldsOnly(
          body,
          action === "request-correction"
            ? ["reviewNote", "customerMessage"]
            : ["reviewNote"],
        ) ||
        note === undefined ||
        message === undefined
      )
        return proofFailure("PAYMENT_PROOF_INVALID_INPUT");
      command =
        action === "request-correction"
          ? { action, reviewNote: note, customerMessage: message }
          : { action, reviewNote: note };
    } else {
      if (Object.keys(body).length)
        return proofFailure("PAYMENT_PROOF_INVALID_INPUT");
      command = { action };
    }
    try {
      return await this.repository.execute(id, command, actor);
    } catch (error) {
      if (error instanceof DocumentStorageError)
        return proofFailure(proofFileError(error));
      throw error;
    }
  }
  async upload(
    id: string,
    body: unknown,
    payload: UploadPayload,
    actor: ProofActor,
  ): Promise<ProofResult> {
    const token = bearer(id),
      claims = parseProofClaims(body);
    if (!claims)
      return this.repository.execute(
        token,
        { action: "upload-failed", error: "PAYMENT_PROOF_INVALID_INPUT" },
        actor,
      );
    const ready = await this.repository.execute(
      token,
      { action: "prepare-upload" },
      actor,
    );
    if (!ready.ok) return ready;
    let key: string | null = null;
    try {
      const file = await this.storage.persist(payload);
      key = file.storageKey;
      const result = await this.repository.execute(
        token,
        { action: "commit-upload", claims, file },
        actor,
      );
      if (!result.ok) await this.storage.remove(key);
      return result;
    } catch (error) {
      if (key) await this.storage.remove(key);
      return this.repository.execute(
        token,
        { action: "upload-failed", error: proofFileError(error) },
        actor,
      );
    }
  }
}
