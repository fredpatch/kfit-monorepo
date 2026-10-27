import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { AuthRole } from "@kfit/shared";
import { AppointmentsController } from "../../appointments/controllers/appointments.controller.js";
import { CatalogueController } from "../../catalogue/controllers/catalogue.controller.js";
import { ConsentController } from "../../consents/controllers/consent.controller.js";
import { CustomersController } from "../../customers/controllers/customers.controller.js";
import { DashboardAnalyticsController } from "../../dashboard/controllers/analytics.controller.js";
import { TodayController } from "../../dashboard/controllers/today.controller.js";
import { DevToolsController } from "../../dev-tools/controllers/dev-tools.controller.js";
import { DocumentsController } from "../../documents/controllers/documents.controller.js";
import { FinanceController } from "../../finance/controllers/finance.controller.js";
import { FollowUpsController } from "../../follow-ups/controllers/follow-ups.controller.js";
import { NotificationsController } from "../../notifications/controllers/notifications.controller.js";
import { OnboardingController } from "../../onboarding/controllers/onboarding.controller.js";
import { PaymentProofsController } from "../../payment-proofs/controllers/payment-proofs.controller.js";
import { PrivacyController } from "../../privacy/controllers/privacy.controller.js";
import { ProgressController } from "../../progress/controllers/progress.controller.js";
import { QuestionnaireController } from "../../questionnaires/controllers/questionnaire.controller.js";
import { QuotesController } from "../../quotes/controllers/quotes.controller.js";
import { ReceiptsController } from "../../receipts/controllers/receipts.controller.js";
import { AdminRequestsController } from "../../requests/controllers/admin-requests.controller.js";
import { RequestConversionController } from "../../requests/controllers/request-conversion.controller.js";
import { SubscriptionsController } from "../../subscriptions/controllers/subscriptions.controller.js";
import { SupervisionController } from "../../supervision/controllers/supervision.controller.js";
import { signAccessToken, verifyAccessToken } from "../services/crypto/jwt.crypto.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../types/auth.http.types.js";

const id = "11111111-1111-1111-1111-111111111111";
const secret = "synthetic-role01-access-secret-0123456789";

test("ROLE-01 R1: the access token accepts superadmin and refuses an unknown role", () => {
  const token = signAccessToken({ userId: id, sessionId: id, role: "superadmin", secret, ttlMs: 60_000 });
  assert.equal(verifyAccessToken(token, secret)?.role, "superadmin");

  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, sid: id, role: "owner", iat: now, exp: now + 60 })}`;
  const forged = `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
  assert.equal(verifyAccessToken(forged, secret), null);
});

/** Any service call means the role guard let the request through. */
const PASSED = new Error("guard passed");
function stub<T>(): T {
  const handler: ProxyHandler<() => void> = { get: (_target, key) => (key === "then" ? undefined : new Proxy(() => undefined, handler)), apply: () => { throw PASSED; } };
  return new Proxy(() => undefined, handler) as unknown as T;
}
const context = (role: AuthRole): AuthHttpRequestContext => ({ requestId: id, method: "POST", path: "/", cookies: {}, headers: {}, session: { userId: id, sessionId: id, role } });
type Guarded = { module: string; forbidden: string; required: "admin" | "superadmin"; call: (context: AuthHttpRequestContext) => Promise<HttpJsonResponse | unknown> };

/** ROLE-01 R2: one representative guarded entry point per controller, with its unchanged refusal code. */
const guarded: Guarded[] = [
  { module: "appointments", forbidden: "APPOINTMENT_ADMIN_FORBIDDEN", required: "admin", call: (c) => new AppointmentsController(stub()).admin(c, id, "reschedule", {}) },
  { module: "catalogue", forbidden: "CATALOGUE_ADMIN_FORBIDDEN", required: "admin", call: (c) => new CatalogueController(stub(), stub()).listAdminServices(c) },
  { module: "catalogue content", forbidden: "CATALOGUE_ADMIN_FORBIDDEN", required: "admin", call: (c) => new CatalogueController(stub(), stub()).content(c, "deliverability", { serviceId: id }, {}) },
  { module: "consents", forbidden: "CONSENT_ADMIN_FORBIDDEN", required: "admin", call: (c) => new ConsentController(stub(), stub(), stub()).execute(c, id, "read", {}) },
  { module: "consent definitions", forbidden: "CONSENT_ADMIN_FORBIDDEN", required: "admin", call: (c) => new ConsentController(stub(), stub(), stub()).definitions(c, "definitions_list", {}) },
  { module: "customers", forbidden: "CUSTOMER_ADMIN_FORBIDDEN", required: "admin", call: (c) => new CustomersController(stub()).handle(c, "list") },
  { module: "dashboard analytics", forbidden: "DASHBOARD_ADMIN_FORBIDDEN", required: "admin", call: (c) => new DashboardAnalyticsController(stub(), stub()).handle(c, "alerts", {}) },
  { module: "dashboard today", forbidden: "DASHBOARD_ADMIN_FORBIDDEN", required: "admin", call: (c) => new TodayController(stub()).handle(c, "today") },
  { module: "dev-tools", forbidden: "DEV_TOOLS_ADMIN_FORBIDDEN", required: "admin", call: (c) => new DevToolsController(stub(), () => true).handle(c, "test_data_analyse", {}) },
  { module: "documents", forbidden: "DOCUMENT_ADMIN_FORBIDDEN", required: "admin", call: (c) => new DocumentsController(stub()).generateSummary(c, id) },
  { module: "finance", forbidden: "FINANCE_ADMIN_FORBIDDEN", required: "admin", call: (c) => new FinanceController(stub()).execute(c, id, "read", {}) },
  { module: "follow-ups", forbidden: "FOLLOW_UP_ADMIN_FORBIDDEN", required: "admin", call: (c) => new FollowUpsController(stub()).execute(c, id, "queue", {}) },
  { module: "notifications", forbidden: "NOTIFICATION_ADMIN_FORBIDDEN", required: "admin", call: (c) => new NotificationsController(stub(), stub()).handle(c, "unread_count", {}) },
  { module: "onboarding", forbidden: "ONBOARDING_ADMIN_FORBIDDEN", required: "admin", call: (c) => new OnboardingController(stub()).execute(c, id, "read", {}) },
  { module: "payment-proofs", forbidden: "PAYMENT_PROOF_ADMIN_FORBIDDEN", required: "admin", call: (c) => new PaymentProofsController(stub()).execute(c, id, "list", {}) },
  { module: "privacy", forbidden: "PRIVACY_ADMIN_FORBIDDEN", required: "admin", call: (c) => new PrivacyController(stub(), stub()).handle(c, "holds_list", {}) },
  { module: "progress", forbidden: "PROGRESS_ADMIN_FORBIDDEN", required: "admin", call: (c) => new ProgressController(stub()).execute(c, id, "progress", {}) },
  { module: "questionnaires", forbidden: "QUESTIONNAIRE_ADMIN_FORBIDDEN", required: "admin", call: (c) => new QuestionnaireController(stub(), stub(), stub()).admin(c, "read", {}, id) },
  { module: "quotes", forbidden: "QUOTE_ADMIN_FORBIDDEN", required: "admin", call: (c) => new QuotesController(stub()).execute(c, id, "list", {}) },
  { module: "receipts", forbidden: "RECEIPT_ADMIN_FORBIDDEN", required: "admin", call: (c) => new ReceiptsController(stub()).execute(c, id, "list", {}) },
  { module: "admin requests", forbidden: "REQUEST_ADMIN_FORBIDDEN", required: "admin", call: (c) => new AdminRequestsController(stub()).listQueue(c, undefined) },
  { module: "request conversion", forbidden: "REQUEST_ADMIN_FORBIDDEN", required: "admin", call: (c) => new RequestConversionController(stub()).convert(c, id, {}) },
  { module: "subscriptions", forbidden: "SUBSCRIPTION_ADMIN_FORBIDDEN", required: "admin", call: (c) => new SubscriptionsController(stub()).execute(c, id, "read", {}) },
  { module: "supervision", forbidden: "SUPERVISION_SUPERADMIN_FORBIDDEN", required: "superadmin", call: (c) => new SupervisionController(stub()).handle(c, "overview", {}) },
];

async function outcome(entry: Guarded, role: AuthRole): Promise<"passed" | "refused" | "other"> {
  try {
    const response = await entry.call(context(role)) as HttpJsonResponse<{ error?: unknown }>;
    return response.status === 403 && response.body?.error === entry.forbidden ? "refused" : "other";
  } catch (error) {
    if (error === PASSED) return "passed";
    throw error;
  }
}

test("ROLE-01 R2: every admin guard lets superadmin and admin through and refuses coach with its unchanged code; Supervision refuses admin too", async () => {
  const expected: Record<"admin" | "superadmin", Record<AuthRole, "passed" | "refused">> = {
    admin: { superadmin: "passed", admin: "passed", coach: "refused" },
    superadmin: { superadmin: "passed", admin: "refused", coach: "refused" },
  };
  for (const entry of guarded) for (const role of ["superadmin", "admin", "coach"] as const) {
    const result = await outcome(entry, role);
    // A guard that passes may still answer before any service call (input validation): anything but the refusal counts.
    if (expected[entry.required][role] === "passed") assert.notEqual(result, "refused", `${entry.module} as ${role}`);
    else assert.equal(result, "refused", `${entry.module} as ${role}`);
  }
});

test("ROLE-01 R2: no compiled controller compares a role inline (hasRole only)", async () => {
  const modules = fileURLToPath(new URL("../../", import.meta.url));
  const controllers = (await readdir(modules, { recursive: true })).filter((file) => /controllers[\\/][^\\/]+\.controller\.js$/.test(file));
  assert.ok(controllers.length >= 22, `found ${controllers.length} compiled controllers`);
  for (const file of controllers) {
    const source = await readFile(path.join(modules, file), "utf8");
    assert.equal(/\.role\s*[!=]==?|[!=]==?\s*[\w.]*\.role\b/.test(source), false, `inline role comparison in ${file}`);
  }
});
