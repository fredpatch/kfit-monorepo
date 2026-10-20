import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { CustomersService } from "../services/customers.service.js";

export class CustomersController {
  constructor(private readonly service: Pick<CustomersService, "listActive" | "search" | "createManual">) {}

  async handle(context: AuthHttpRequestContext, action: "list" | "search" | "create", input?: unknown): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (auth.session.role !== "admin") return { status: 403, body: { error: "CUSTOMER_ADMIN_FORBIDDEN" } };
    if (action === "list") return { status: 200, body: { customers: await this.service.listActive() } };
    if (action === "search") {
      const result = await this.service.search(input);
      return result.status === "ok"
        ? { status: 200, body: { customers: result.customers } }
        : { status: 400, body: { error: "CUSTOMER_INVALID_INPUT", reason: result.reason } };
    }
    const result = await this.service.createManual(input, {
      userId: auth.session.userId, requestId: context.requestId,
      ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null,
    });
    switch (result.status) {
      case "ok": return { status: 201, body: { customer: result.customer } };
      case "duplicate": return { status: 409, body: { error: "CUSTOMER_DUPLICATE_WHATSAPP" } };
      case "invalid": return { status: 400, body: { error: "CUSTOMER_INVALID_INPUT", reason: result.reason } };
    }
  }
}
