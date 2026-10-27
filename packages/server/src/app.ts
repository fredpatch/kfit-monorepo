import express, { type Express, type RequestHandler } from "express";
import type { ReceiptsController } from "./modules/receipts/controllers/receipts.controller.js";
import { createExpressReceiptsRouter } from "./modules/receipts/routes/express-receipts.router.js";
import type { PaymentProofsController } from "./modules/payment-proofs/controllers/payment-proofs.controller.js";
import { createExpressPaymentProofsRouter } from "./modules/payment-proofs/routes/express-payment-proofs.router.js";
import type { QuotesController } from "./modules/quotes/controllers/quotes.controller.js";
import { createExpressQuotesRouter } from "./modules/quotes/routes/express-quotes.router.js";
import type { FinanceController } from "./modules/finance/controllers/finance.controller.js";
import { createExpressFinanceRouter } from "./modules/finance/routes/express-finance.router.js";
import type { DocumentsController } from "./modules/documents/controllers/documents.controller.js";
import { createExpressDocumentsRouter } from "./modules/documents/routes/express-documents.router.js";
import type { ProgressController } from "./modules/progress/controllers/progress.controller.js";
import { createExpressProgressRouter } from "./modules/progress/routes/express-progress.router.js";
import type { FollowUpsController } from "./modules/follow-ups/controllers/follow-ups.controller.js";
import { createExpressFollowUpsRouter } from "./modules/follow-ups/routes/express-follow-ups.router.js";
import type { AppointmentsController } from "./modules/appointments/controllers/appointments.controller.js";
import { createExpressAppointmentsRouter } from "./modules/appointments/routes/express-appointments.router.js";
import type { SubscriptionsController } from "./modules/subscriptions/controllers/subscriptions.controller.js";
import { createExpressSubscriptionsRouter } from "./modules/subscriptions/routes/express-subscriptions.router.js";
import type { AuthController } from "./modules/auth/controllers/auth.controller.js";
import { createExpressAuthRouter, type ExpressAuthSessionResolver } from "./modules/auth/routes/express-auth.router.js";
import type { CatalogueController } from "./modules/catalogue/controllers/catalogue.controller.js";
import { createExpressCatalogueRouter } from "./modules/catalogue/routes/express-catalogue.router.js";
import type { AdminRequestsController } from "./modules/requests/controllers/admin-requests.controller.js";
import type { RequestConversionController } from "./modules/requests/controllers/request-conversion.controller.js";
import type { RequestsController } from "./modules/requests/controllers/requests.controller.js";
import { createExpressAdminRequestsRouter } from "./modules/requests/routes/express-admin-requests.router.js";
import { createExpressRequestsRouter } from "./modules/requests/routes/express-requests.router.js";
import { IpRateLimiter } from "./modules/requests/services/ip-rate-limiter.js";
import type { CustomersController } from "./modules/customers/controllers/customers.controller.js";
import { createExpressCustomersRouter } from "./modules/customers/routes/express-customers.router.js";
import type { OnboardingController } from "./modules/onboarding/controllers/onboarding.controller.js";
import { createExpressOnboardingRouter } from "./modules/onboarding/routes/express-onboarding.router.js";
import type { ConsentController } from "./modules/consents/controllers/consent.controller.js";
import { createExpressConsentRouter } from "./modules/consents/routes/express-consent.router.js";
import type { TodayController } from "./modules/dashboard/controllers/today.controller.js";
import { createExpressTodayRouter } from "./modules/dashboard/routes/express-today.router.js";
import type { DashboardAnalyticsController } from "./modules/dashboard/controllers/analytics.controller.js";
import { createExpressDashboardAnalyticsRouter } from "./modules/dashboard/routes/express-analytics.router.js";
import type { NotificationsController } from "./modules/notifications/controllers/notifications.controller.js";
import { createExpressNotificationsRouter } from "./modules/notifications/routes/express-notifications.router.js";
import type { PrivacyController } from "./modules/privacy/controllers/privacy.controller.js";
import { createExpressPrivacyRouter } from "./modules/privacy/routes/express-privacy.router.js";
import type { SupervisionController } from "./modules/supervision/controllers/supervision.controller.js";
import { createExpressSupervisionRouter } from "./modules/supervision/routes/express-supervision.router.js";
import type { DevToolsController } from "./modules/dev-tools/controllers/dev-tools.controller.js";
import { createExpressDevToolsRouter } from "./modules/dev-tools/routes/express-dev-tools.router.js";
import type { QuestionnaireController } from "./modules/questionnaires/controllers/questionnaire.controller.js";
import { createExpressQuestionnaireRouter } from "./modules/questionnaires/routes/express-questionnaire.router.js";
import { REQUEST_ENCODING_UNSUPPORTED, rejectEncodedRequestBodies } from "./security/reject-encoded-request-bodies.js";
import { rateLimitedCode, type RateLimitScope, type SecurityEventRecorder } from "./security/security-event-counters.js";
import { requestIdMiddleware } from "./http/request-id.middleware.js";

export type ServerAppDeps = {
  /** Mounted before every route, so each request is logged once it finishes. */
  requestLogger?: RequestHandler;
  receiptsController?: ReceiptsController;
  paymentProofsController?: PaymentProofsController;
  quotesController?: QuotesController;
  financeController?: FinanceController;
  documentsController?: DocumentsController;
  progressController?: ProgressController;
  followUpsController?: FollowUpsController;
  appointmentsController?: AppointmentsController;
  subscriptionsController?: SubscriptionsController;
  authController: AuthController;
  resolveAuthSession: ExpressAuthSessionResolver;
  catalogueController?: CatalogueController;
  requestsController?: RequestsController;
  adminRequestsController?: AdminRequestsController;
  requestConversionController?: RequestConversionController;
  customersController?: CustomersController;
  onboardingController?: OnboardingController;
  consentController?: ConsentController;
  questionnaireController?: QuestionnaireController;
  todayController?: TodayController;
  dashboardAnalyticsController?: DashboardAnalyticsController;
  notificationsController?: NotificationsController;
  privacyController?: PrivacyController;
  /** OPS-01: admin-only operational health. */
  supervisionController?: SupervisionController;
  /** TEST-01 D4: passed by dev-app.ts only; the controller also refuses outside local kfit_dev. */
  devToolsController?: DevToolsController;
  /** S7.4b B9: counts 415 and 429 refusals; fire-and-forget, never changes a response. */
  recordSecurityEvent?: SecurityEventRecorder;
};

export function createServerApp(deps: ServerAppDeps): Express {
  const app = express();
  const rateLimited = (scope: RateLimitScope) => () => deps.recordSecurityEvent?.(rateLimitedCode(scope));

  app.disable("x-powered-by");
  // S7.4 D4: first, so the logger, the encoding guard and every router see the same canonical request id.
  app.use(requestIdMiddleware);
  if (deps.requestLogger) app.use(deps.requestLogger);
  // SEC-01 D4 (CVE-2026-111497): before every body parser, including the routers' raw() uploads.
  app.use(rejectEncodedRequestBodies(() => deps.recordSecurityEvent?.(REQUEST_ENCODING_UNSUPPORTED)));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.use(createExpressAuthRouter({
    controller: deps.authController,
    resolveSession: deps.resolveAuthSession,
  }));

  if (deps.catalogueController) {
    app.use(createExpressCatalogueRouter({
      controller: deps.catalogueController,
      resolveSession: deps.resolveAuthSession,
    }));
  }

  if (deps.requestsController) {
    app.use(createExpressRequestsRouter({
      controller: deps.requestsController,
      rateLimiter: new IpRateLimiter({ windowMs: 60_000, maxPerWindow: 5, onRefused: rateLimited("requests") }),
    }));
  }

  if (deps.adminRequestsController) {
    app.use(createExpressAdminRequestsRouter({
      controller: deps.adminRequestsController,
      resolveSession: deps.resolveAuthSession,
      ...(deps.requestConversionController ? { conversionController: deps.requestConversionController } : {}),
    }));
  }

  if (deps.customersController) {
    app.use(createExpressCustomersRouter({ controller: deps.customersController, resolveSession: deps.resolveAuthSession }));
  }
  if (deps.onboardingController) app.use(createExpressOnboardingRouter({ controller: deps.onboardingController, resolveSession: deps.resolveAuthSession }));
  if (deps.consentController) app.use(createExpressConsentRouter({ controller: deps.consentController, resolveSession: deps.resolveAuthSession, onRateLimited: rateLimited("consents") }));
  if (deps.questionnaireController) app.use(createExpressQuestionnaireRouter({ controller: deps.questionnaireController, resolveSession: deps.resolveAuthSession, onRateLimited: rateLimited("questionnaires") }));
  if (deps.subscriptionsController) app.use(createExpressSubscriptionsRouter({ controller: deps.subscriptionsController, resolveSession: deps.resolveAuthSession }));
  // Registered before the appointments router so GET /admin/appointments (agenda) is matched explicitly.
  if (deps.todayController) app.use(createExpressTodayRouter({ controller: deps.todayController, resolveSession: deps.resolveAuthSession }));
  if (deps.dashboardAnalyticsController) app.use(createExpressDashboardAnalyticsRouter({ controller: deps.dashboardAnalyticsController, resolveSession: deps.resolveAuthSession }));
  if (deps.notificationsController) app.use(createExpressNotificationsRouter({ controller: deps.notificationsController, resolveSession: deps.resolveAuthSession }));
  if (deps.privacyController) app.use(createExpressPrivacyRouter({ controller: deps.privacyController, resolveSession: deps.resolveAuthSession }));
  if (deps.supervisionController) app.use(createExpressSupervisionRouter({ controller: deps.supervisionController, resolveSession: deps.resolveAuthSession }));
  if (deps.devToolsController) app.use(createExpressDevToolsRouter({ controller: deps.devToolsController, resolveSession: deps.resolveAuthSession }));
  if (deps.appointmentsController) app.use(createExpressAppointmentsRouter({ controller: deps.appointmentsController, resolveSession: deps.resolveAuthSession, onRateLimited: rateLimited("appointments") }));
  if (deps.followUpsController) app.use(createExpressFollowUpsRouter({ controller: deps.followUpsController, resolveSession: deps.resolveAuthSession }));
  if (deps.progressController) app.use(createExpressProgressRouter({ controller: deps.progressController, resolveSession: deps.resolveAuthSession }));
  if (deps.documentsController) app.use(createExpressDocumentsRouter({ controller: deps.documentsController, resolveSession: deps.resolveAuthSession, onRateLimited: rateLimited("documents") }));
  if (deps.financeController) app.use(createExpressFinanceRouter({ controller: deps.financeController, resolveSession: deps.resolveAuthSession }));
  if (deps.quotesController) app.use(createExpressQuotesRouter({ controller: deps.quotesController, resolveSession: deps.resolveAuthSession, onRateLimited: rateLimited("quotes") }));
  if (deps.paymentProofsController) app.use(createExpressPaymentProofsRouter({ controller: deps.paymentProofsController, resolveSession: deps.resolveAuthSession, onRateLimited: rateLimited("payment-proofs") }));
  if (deps.receiptsController) app.use(createExpressReceiptsRouter({ controller: deps.receiptsController, resolveSession: deps.resolveAuthSession, onRateLimited: rateLimited("receipts") }));
  return app;
}
