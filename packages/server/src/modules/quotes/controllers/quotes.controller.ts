import type { QuoteAction, QuoteResult, QuotesService } from "../services/quotes.service.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";

export type QuoteControllerResult = HttpJsonResponse<unknown> | { status: number; binary: { bytes: Buffer; mimeType: string; filename: string } };
export class QuotesController {
  constructor(private readonly service: Pick<QuotesService, "execute">) {}
  async execute(context: AuthHttpRequestContext, id: string, action: QuoteAction, body: unknown): Promise<QuoteControllerResult> {
    const isPublic = action === "public-read" || action === "public-pdf" || action === "respond";
    if (!isPublic) {
      const auth = requireAuthenticatedSession(context); if (!auth.ok) return auth.response;
      if (auth.session.role !== "admin") return { status: 403, body: { error: "QUOTE_ADMIN_FORBIDDEN" } };
    }
    const result: QuoteResult = await this.service.execute(id, action, body, { userId: isPublic ? null : context.session?.userId ?? null, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null });
    if (result.ok) return "binary" in result ? { status: 200, binary: result.binary } : { status: 200, body: result.body };
    const status = result.error === "QUOTE_ROUTE_UNEXPECTED_FAILURE" ? 500 : result.error === "QUOTE_NOT_FOUND" ? 404 : result.error === "QUOTE_INVALID_INPUT" || result.error === "QUOTE_LINK_INVALID" ? 400 : result.error === "QUOTE_LINK_EXPIRED" ? 410 : result.error === "QUOTE_LINK_REVOKED" ? 403 : 409;
    return { status, body: { error: result.error } };
  }
}
