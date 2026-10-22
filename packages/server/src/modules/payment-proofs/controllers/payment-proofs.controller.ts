import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { UploadPayload } from "../../documents/services/documents.service.js";
import type { PaymentProofsService } from "../services/payment-proofs.service.js";
import type { ProofAction, ProofActor, ProofResult } from "../services/payment-proofs.types.js";
export type ProofControllerResult = HttpJsonResponse<unknown> | { status: number; binary: { bytes: Buffer; mimeType: string; filename: string } };
export class PaymentProofsController {
  constructor(private readonly service: Pick<PaymentProofsService, "execute" | "upload">) {}
  private actor(c: AuthHttpRequestContext, publicAccess = false): ProofActor { return { userId: publicAccess ? null : c.session?.userId ?? null, requestId: c.requestId, ipAddress: c.ipAddress ?? null, userAgent: c.userAgent ?? null }; }
  private map(result: ProofResult): ProofControllerResult {
    if (result.ok) return "binary" in result ? { status: 200, binary: result.binary } : { status: 200, body: result.body };
    const e = result.error, status = e === "PAYMENT_PROOF_ROUTE_UNEXPECTED_FAILURE" ? 500 : e === "PAYMENT_PROOF_NOT_FOUND" ? 404 : e === "PAYMENT_PROOF_LINK_EXPIRED" ? 410
      : e === "PAYMENT_PROOF_LINK_REVOKED" || e === "PAYMENT_PROOF_ADMIN_FORBIDDEN" ? 403 : ["PAYMENT_PROOF_INVALID_INPUT", "PAYMENT_PROOF_LINK_INVALID", "PAYMENT_PROOF_UPLOAD_INVALID", "PAYMENT_PROOF_MALWARE_DETECTED"].includes(e) ? 400 : 409;
    return { status, body: { error: e } };
  }
  async execute(c: AuthHttpRequestContext, id: string, action: ProofAction, body: unknown): Promise<ProofControllerResult> {
    if (action !== "metadata") { const auth = requireAuthenticatedSession(c); if (!auth.ok) return auth.response; if (auth.session.role !== "admin") return { status: 403, body: { error: "PAYMENT_PROOF_ADMIN_FORBIDDEN" } }; }
    return this.map(await this.service.execute(id, action, body, this.actor(c, action === "metadata")));
  }
  async upload(c: AuthHttpRequestContext, id: string, body: unknown, payload: UploadPayload) { return this.map(await this.service.upload(id, body, payload, this.actor(c, true))); }
}
