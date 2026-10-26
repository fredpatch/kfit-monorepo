import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { CustomersService } from "../services/customers.service.js";

export type CustomerAction = "list" | "search" | "create" | "detail" | "analytics" | "overview" | "archived";

export class CustomersController {
  constructor(private readonly service: Pick<CustomersService, "listActive" | "listArchived" | "search" | "createManual" | "getDetail" | "getAnalytics" | "getOverview">) {}

  async handle(context: AuthHttpRequestContext, action: CustomerAction, input?: unknown): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (auth.session.role !== "admin") return { status: 403, body: { error: "CUSTOMER_ADMIN_FORBIDDEN" } };
    if (action === "list") return { status: 200, body: { customers: await this.service.listActive() } };
    if (action === "overview") return { status: 200, body: await this.service.getOverview() };
    if (action === "archived") return { status: 200, body: { customers: await this.service.listArchived() } };
    if (action === "detail") {
      const result = await this.service.getDetail(input);
      if (result.status === "ok") return { status: 200, body: result.detail };
      return result.status === "not_found"
        ? { status: 404, body: { error: "CUSTOMER_NOT_FOUND" } }
        : { status: 400, body: { error: "CUSTOMER_INVALID_INPUT", reason: result.reason } };
    }
    if (action === "analytics") {
      const { customerId, query } = (input ?? {}) as { customerId?: unknown; query?: { periode?: unknown; abonnement?: unknown } };
      const result = await this.service.getAnalytics(customerId, query ?? {});
      if (result.status === "ok") return { status: 200, body: { analytics: result.analytics } };
      return result.status === "not_found"
        ? { status: 404, body: { error: "CUSTOMER_NOT_FOUND" } }
        : { status: 400, body: { error: "CUSTOMER_INVALID_INPUT", reason: result.reason } };
    }
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
