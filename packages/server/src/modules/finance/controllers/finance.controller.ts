import type { FinanceResponse } from "@kfit/shared";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import { hasRole } from "../../auth/services/roles.js";
import type {
  AuthHttpRequestContext,
  HttpJsonResponse,
} from "../../auth/types/auth.http.types.js";
import type {
  FinanceCommand,
  FinanceService,
} from "../services/finance.service.js";
export class FinanceController {
  constructor(private readonly service: Pick<FinanceService, "execute">) {}
  async execute(
    context: AuthHttpRequestContext,
    id: string,
    action: FinanceCommand["action"],
    body: unknown,
  ): Promise<HttpJsonResponse<FinanceResponse | { error: string }>> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.session, "admin"))
      return { status: 403, body: { error: "FINANCE_ADMIN_FORBIDDEN" } };
    const result = await this.service.execute(id, action, body, {
      userId: auth.session.userId,
      requestId: context.requestId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });
    if (result.ok) return { status: 200, body: result.body };
    return {
      status:
        result.error === "FINANCE_NOT_FOUND"
          ? 404
          : result.error === "FINANCE_INVALID_INPUT" ||
              result.error === "FINANCE_INSTALLMENTS_TOTAL_MISMATCH"
            ? 400
            : 409,
      body: { error: result.error },
    };
  }
}
