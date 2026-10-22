import express, { type Express } from "express";
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
import type { QuestionnaireController } from "./modules/questionnaires/controllers/questionnaire.controller.js";
import { createExpressQuestionnaireRouter } from "./modules/questionnaires/routes/express-questionnaire.router.js";

export type ServerAppDeps = {
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
};

export function createServerApp(deps: ServerAppDeps): Express {
  const app = express();

  app.disable("x-powered-by");
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
      rateLimiter: new IpRateLimiter({ windowMs: 60_000, maxPerWindow: 5 }),
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
  if (deps.consentController) app.use(createExpressConsentRouter({ controller: deps.consentController, resolveSession: deps.resolveAuthSession }));
  if (deps.questionnaireController) app.use(createExpressQuestionnaireRouter({ controller: deps.questionnaireController, resolveSession: deps.resolveAuthSession }));
  if (deps.subscriptionsController) app.use(createExpressSubscriptionsRouter({ controller: deps.subscriptionsController, resolveSession: deps.resolveAuthSession }));
  // Registered before the appointments router so GET /admin/appointments (agenda) is matched explicitly.
  if (deps.todayController) app.use(createExpressTodayRouter({ controller: deps.todayController, resolveSession: deps.resolveAuthSession }));
  if (deps.appointmentsController) app.use(createExpressAppointmentsRouter({ controller: deps.appointmentsController, resolveSession: deps.resolveAuthSession }));
  if (deps.followUpsController) app.use(createExpressFollowUpsRouter({ controller: deps.followUpsController, resolveSession: deps.resolveAuthSession }));
  if (deps.progressController) app.use(createExpressProgressRouter({ controller: deps.progressController, resolveSession: deps.resolveAuthSession }));
  if (deps.documentsController) app.use(createExpressDocumentsRouter({ controller: deps.documentsController, resolveSession: deps.resolveAuthSession }));
  if (deps.financeController) app.use(createExpressFinanceRouter({ controller: deps.financeController, resolveSession: deps.resolveAuthSession }));
  if (deps.quotesController) app.use(createExpressQuotesRouter({ controller: deps.quotesController, resolveSession: deps.resolveAuthSession }));
  return app;
}
