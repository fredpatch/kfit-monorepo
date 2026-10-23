import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { ReceiptsService } from "../services/receipts.service.js";
import type { ReceiptAction, ReceiptResult } from "../services/receipts.types.js";
export type ReceiptControllerResult = HttpJsonResponse<unknown> | { status: number; binary: { bytes: Buffer; mimeType: string; filename: string } };
export class ReceiptsController {
  constructor(private readonly service: Pick<ReceiptsService, "execute">) {}
  private map(result: ReceiptResult): ReceiptControllerResult {
    if (result.ok) return "binary" in result ? { status: 200, binary: result.binary } : { status: 200, body: result.body };
    const e = result.error, status = e === "RECEIPT_ROUTE_UNEXPECTED_FAILURE" || e === "RECEIPT_PDF_FAILURE" ? 500 : e === "RECEIPT_NOT_FOUND" ? 404 : e === "RECEIPT_LINK_EXPIRED" ? 410
      : e === "RECEIPT_LINK_REVOKED" || e === "RECEIPT_ADMIN_FORBIDDEN" ? 403 : e === "RECEIPT_LINK_INVALID" || e === "RECEIPT_INVALID_INPUT" ? 400 : 409;
    return { status, body: { error: e } };
  }
  async execute(c: AuthHttpRequestContext, id: string, action: ReceiptAction, body: unknown): Promise<ReceiptControllerResult> {
    const publicAccess = action === "public-read" || action === "public-pdf";
    if (!publicAccess) { const auth = requireAuthenticatedSession(c); if (!auth.ok) return auth.response; if (auth.session.role !== "admin") return { status: 403, body: { error: "RECEIPT_ADMIN_FORBIDDEN" } }; }
    return this.map(await this.service.execute(id, action, body, { userId: publicAccess ? null : c.session?.userId ?? null, requestId: c.requestId, ipAddress: c.ipAddress ?? null, userAgent: c.userAgent ?? null }));
  }
}
