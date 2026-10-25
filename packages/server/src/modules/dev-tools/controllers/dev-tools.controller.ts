import { parseTestDataPurgeInput, type DevToolsErrorCode } from "@kfit/shared";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import { devToolsAvailable } from "../services/dev-tools.guard.js";
import type { TestDataService } from "../services/test-data.service.js";

export type DevToolsAction = "test_data_analyse" | "test_data_purge";
const fail = (status: number, error: DevToolsErrorCode): HttpJsonResponse => ({ status, body: { error } });

/** TEST-01 D4/D6: admin only, and refused on every request unless the process runs outside production on local kfit_dev. */
export class DevToolsController {
  constructor(
    private readonly service: Pick<TestDataService, "analyse" | "purge">,
    private readonly available: () => boolean = () => devToolsAvailable(process.env),
  ) {}

  async handle(context: AuthHttpRequestContext, action: DevToolsAction, input: { body?: unknown }): Promise<HttpJsonResponse> {
    if (!this.available()) return fail(403, "DEV_TOOLS_UNAVAILABLE");
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (auth.session.role !== "admin") return fail(403, "DEV_TOOLS_ADMIN_FORBIDDEN");
    if (action === "test_data_analyse") return { status: 200, body: await this.service.analyse() };
    const parsed = parseTestDataPurgeInput(input.body);
    if (!parsed) return fail(400, "DEV_TOOLS_INVALID_INPUT");
    const result = await this.service.purge(parsed.fingerprint, { userId: auth.session.userId, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null });
    return result.status === "changed" ? fail(409, "DEV_TEST_DATA_CHANGED") : { status: 200, body: { counts: result.counts } };
  }
}
