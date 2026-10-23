import type { ReceiptResponse, ReceiptsResponse, ReceiptShareResponse, ReceiptSnapshot, PublicReceiptMetadata, ReceiptErrorCode } from "@kfit/shared";
import type { PrivateDocumentStorage } from "../../documents/services/document-storage.service.js";
export type ReceiptActor = { userId: string | null; requestId: string; ipAddress: string | null; userAgent: string | null };
export type ReceiptCommand = { action: "list" | "read" | "issue" | "pdf" | "revoke" | "public-read" | "public-pdf" }
  | { action: "share"; expiresAt: Date; maxUses: number } | { action: "void"; voidReason: string }
  | { action: "invalid-public-input"; event: "view" | "download" };
export type ReceiptAction = Exclude<ReceiptCommand["action"], "invalid-public-input">;
export type ReceiptResult = { ok: false; error: ReceiptErrorCode } | { ok: true; body: ReceiptResponse | ReceiptsResponse | ReceiptShareResponse | PublicReceiptMetadata | { revoked: true } }
  | { ok: true; binary: { bytes: Buffer; mimeType: string; filename: string } };
export interface ReceiptsRepository { execute(id: string, command: ReceiptCommand, actor: ReceiptActor): Promise<ReceiptResult> }
export type ReceiptArtifacts = Pick<PrivateDocumentStorage, "persist" | "read" | "remove"> & { render(snapshot: ReceiptSnapshot): Promise<Buffer> };
export const receiptFailure = (error: ReceiptErrorCode): ReceiptResult => ({ ok: false, error });
export const receiptUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class ReceiptDomainError extends Error { constructor(readonly code: ReceiptErrorCode) { super(code); } }
