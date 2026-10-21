import { createServerApp } from "./app.js";
import { db } from "./db/client.js";
import { AuthController } from "./modules/auth/controllers/auth.controller.js";
import {
  DrizzleAuthUserRepository,
  DrizzleBootstrapRepository,
  DrizzleOtpChallengeRepository,
  DrizzleSessionRepository,
} from "./modules/auth/repositories/auth.repositories.js";
import { AccessTokenSessionResolver } from "./modules/auth/services/access-token-session.resolver.js";
import { AuditService } from "./modules/auth/services/audit.service.js";
import { AuthRouteService } from "./modules/auth/services/auth-route.service.js";
import { BootstrapService } from "./modules/auth/services/bootstrap.service.js";
import { OtpChallengeService } from "./modules/auth/services/otp-challenge.service.js";
import { PasswordService } from "./modules/auth/services/password.service.js";
import { SessionService } from "./modules/auth/services/session.service.js";
import { loadAuthConfig } from "./modules/auth/config/auth.config.js";
import { CatalogueController } from "./modules/catalogue/controllers/catalogue.controller.js";
import { DrizzleCatalogueRepository } from "./modules/catalogue/repositories/catalogue.repositories.js";
import { CatalogueService } from "./modules/catalogue/services/catalogue.service.js";
import { AdminRequestsController } from "./modules/requests/controllers/admin-requests.controller.js";
import { RequestConversionController } from "./modules/requests/controllers/request-conversion.controller.js";
import { OnboardingController } from "./modules/onboarding/controllers/onboarding.controller.js";
import { OnboardingService } from "./modules/onboarding/services/onboarding.service.js";
import { DrizzleOnboardingRepository } from "./modules/onboarding/repositories/onboarding.repository.js";
import { RequestConversionService } from "./modules/requests/services/request-conversion.service.js";
import { DrizzleRequestConversionRepository } from "./modules/requests/repositories/request-conversion.repository.js";
import { RequestsController } from "./modules/requests/controllers/requests.controller.js";
import { DrizzleAdminRequestsRepository } from "./modules/requests/repositories/admin-requests.repositories.js";
import { DrizzleRequestsRepository } from "./modules/requests/repositories/requests.repositories.js";
import { AdminRequestsService } from "./modules/requests/services/admin-requests.service.js";
import { RequestsService } from "./modules/requests/services/requests.service.js";
import { CustomersController } from "./modules/customers/controllers/customers.controller.js";
import { CustomersService } from "./modules/customers/services/customers.service.js";
import { DrizzleCustomersRepository } from "./modules/customers/repositories/customers.repository.js";

export function createDevelopmentApp() {
  const authConfig = loadAuthConfig(process.env);
  const audit = new AuditService(db, { auditHashPepper: authConfig.auditHashPepper });
  const passwords = new PasswordService();

  const sessionRepository = new DrizzleSessionRepository(db);
  const sessionService = new SessionService(sessionRepository, audit, {
    refreshTokenPepper: authConfig.refreshTokenPepper,
    auditHashPepper: authConfig.auditHashPepper,
    refreshTokenTtlMs: authConfig.refreshTokenTtlMs,
    absoluteSessionTtlMs: authConfig.absoluteSessionTtlMs,
    inactivityTimeoutMs: authConfig.inactivityTimeoutMs,
  });

  const users = new DrizzleAuthUserRepository(db);
  const authRouteService = new AuthRouteService(
    users,
    sessionService,
    ({ password, passwordHash }) => passwords.verify(password, passwordHash),
    audit,
    {
      accessTokenSecret: authConfig.accessTokenSecret,
      accessTokenTtlMs: authConfig.accessTokenTtlMs,
      refreshTokenTtlMs: authConfig.refreshTokenTtlMs,
      cookieMode: "development",
    },
  );

  const bootstrapService = new BootstrapService(
    new DrizzleBootstrapRepository(db),
    passwords,
    audit,
    { defaultRole: "admin" },
  );

  const otpChallengeService = new OtpChallengeService(
    new DrizzleOtpChallengeRepository(db),
    audit,
    {
      otpPepper: authConfig.otpPepper,
      otpTtlMs: authConfig.otpTtlMs,
      otpMaxAttempts: authConfig.otpMaxAttempts,
    },
  );

  const authController = new AuthController({
    otpChallengeService,
    authRouteService,
    bootstrapService,
  });

  const resolver = new AccessTokenSessionResolver(sessionRepository, {
    accessTokenSecret: authConfig.accessTokenSecret,
    inactivityTimeoutMs: authConfig.inactivityTimeoutMs,
  });

  const catalogueController = new CatalogueController(
    new CatalogueService(new DrizzleCatalogueRepository(db)),
  );

  const requestsController = new RequestsController(
    new RequestsService(new DrizzleRequestsRepository(db), audit),
  );

  const adminRequestsController = new AdminRequestsController(
    new AdminRequestsService(new DrizzleAdminRequestsRepository(db, { auditHashPepper: authConfig.auditHashPepper })),
  );

  return createServerApp({
    followUpsController: new FollowUpsController(new FollowUpsService(new DrizzleFollowUpsRepository(db, { auditHashPepper: authConfig.auditHashPepper }))),
    appointmentsController: new AppointmentsController(new AppointmentsService(new DrizzleAppointmentsRepository(db, { auditHashPepper: authConfig.auditHashPepper }))),
    subscriptionsController: new SubscriptionsController(new SubscriptionsService(new DrizzleSubscriptionsRepository(db, { auditHashPepper: authConfig.auditHashPepper }))),
    questionnaireController: new QuestionnaireController(new QuestionnaireService(new DrizzleQuestionnaireRepository(db, { auditHashPepper: authConfig.auditHashPepper })), new QuestionnaireTemplateService(new DrizzleQuestionnaireTemplateRepository(db, { auditHashPepper: authConfig.auditHashPepper }))),
    consentController: new ConsentController(new ConsentService(new DrizzleConsentRepository(db, { auditHashPepper: authConfig.auditHashPepper }))),
    authController,
    resolveAuthSession: (request) => resolver.resolveFromRequest(request),
    catalogueController,
    requestsController,
    adminRequestsController,
    onboardingController: new OnboardingController(new OnboardingService(new DrizzleOnboardingRepository(db, { auditHashPepper: authConfig.auditHashPepper }))),
    requestConversionController: new RequestConversionController(new RequestConversionService(new DrizzleRequestConversionRepository(db, { auditHashPepper: authConfig.auditHashPepper }))),
    customersController: new CustomersController(new CustomersService(new DrizzleCustomersRepository(db, { auditHashPepper: authConfig.auditHashPepper }))),
  });
}
import { ConsentController } from "./modules/consents/controllers/consent.controller.js";
import { ConsentService } from "./modules/consents/services/consent.service.js";
import { DrizzleConsentRepository } from "./modules/consents/repositories/consent.repository.js";
import { QuestionnaireController } from "./modules/questionnaires/controllers/questionnaire.controller.js";
import { QuestionnaireService, QuestionnaireTemplateService } from "./modules/questionnaires/services/questionnaire.service.js";
import { DrizzleQuestionnaireRepository } from "./modules/questionnaires/repositories/questionnaire.repository.js";
import { DrizzleQuestionnaireTemplateRepository } from "./modules/questionnaires/repositories/template.repository.js";
import { SubscriptionsController } from "./modules/subscriptions/controllers/subscriptions.controller.js";
import { SubscriptionsService } from "./modules/subscriptions/services/subscriptions.service.js";
import { DrizzleSubscriptionsRepository } from "./modules/subscriptions/repositories/subscriptions.repository.js";
import { AppointmentsController } from "./modules/appointments/controllers/appointments.controller.js";
import { AppointmentsService } from "./modules/appointments/services/appointments.service.js";
import { DrizzleAppointmentsRepository } from "./modules/appointments/repositories/appointments.repository.js";
import { FollowUpsController } from "./modules/follow-ups/controllers/follow-ups.controller.js";
import { FollowUpsService } from "./modules/follow-ups/services/follow-ups.service.js";
import { DrizzleFollowUpsRepository } from "./modules/follow-ups/repositories/follow-ups.repository.js";
