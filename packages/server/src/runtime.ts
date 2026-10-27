import { createServerApp } from "./app.js";
import { ReceiptsController } from "./modules/receipts/controllers/receipts.controller.js";
import { ReceiptsService } from "./modules/receipts/services/receipts.service.js";
import { DrizzleReceiptsRepository } from "./modules/receipts/repositories/receipts.repository.js";
import { PuppeteerReceiptRenderer } from "./modules/receipts/services/receipt-pdf.renderer.js";
import { FinanceController } from "./modules/finance/controllers/finance.controller.js";
import { PaymentProofsController } from "./modules/payment-proofs/controllers/payment-proofs.controller.js";
import { PaymentProofsService } from "./modules/payment-proofs/services/payment-proofs.service.js";
import { DrizzlePaymentProofsRepository } from "./modules/payment-proofs/repositories/payment-proofs.repository.js";
import { QuotesController } from "./modules/quotes/controllers/quotes.controller.js";
import { QuotesService } from "./modules/quotes/services/quotes.service.js";
import { DrizzleQuotesRepository } from "./modules/quotes/repositories/quotes.repository.js";
import { PuppeteerQuoteRenderer } from "./modules/quotes/services/quote-pdf.renderer.js";
import { FinanceService } from "./modules/finance/services/finance.service.js";
import { DrizzleFinanceRepository } from "./modules/finance/repositories/finance.repository.js";
import { DashboardAnalyticsController } from "./modules/dashboard/controllers/analytics.controller.js";
import { DashboardAnalyticsService } from "./modules/dashboard/services/analytics.service.js";
import { DashboardAlertsService } from "./modules/dashboard/services/alerts.service.js";
import { DrizzleDashboardAnalyticsRepository } from "./modules/dashboard/repositories/analytics.repository.js";
import { DrizzleDashboardAlertsRepository } from "./modules/dashboard/repositories/alerts.repository.js";
import { DocumentsController } from "./modules/documents/controllers/documents.controller.js";
import { DrizzleDocumentsRepository } from "./modules/documents/repositories/documents.repository.js";
import { DocumentsService } from "./modules/documents/services/documents.service.js";
import { PrivateDocumentStorage } from "./modules/documents/services/document-storage.service.js";
import { PuppeteerProgressSummaryRenderer } from "./modules/documents/services/progress-summary.renderer.js";
import { ProgressController } from "./modules/progress/controllers/progress.controller.js";
import { ProgressService } from "./modules/progress/services/progress.service.js";
import { DrizzleProgressRepository } from "./modules/progress/repositories/progress.repository.js";
import { randomUUID } from "node:crypto";
import { db, pool } from "./db/client.js";
import { NotificationsController } from "./modules/notifications/controllers/notifications.controller.js";
import { DrizzleNotificationsRepository } from "./modules/notifications/repositories/notifications.repository.js";
import { NotificationJobsService } from "./modules/notifications/services/notification-jobs.service.js";
import { NodemailerNotificationMailDelivery } from "./modules/notifications/services/notification-mail.delivery.js";
import { startScheduledJobs } from "./modules/notifications/jobs/scheduled-job.runner.js";
import { createFreshOtpLookup } from "./modules/auth/services/fresh-otp.lookup.js";
import { AuthController } from "./modules/auth/controllers/auth.controller.js";
import {
  DrizzleAuthUserRepository,
  DrizzleBootstrapRepository,
  DrizzleOtpChallengeRepository,
  DrizzlePasswordRecoveryRepository,
  DrizzleSessionRepository,
  DrizzleTrustedDeviceRepository,
} from "./modules/auth/repositories/auth.repositories.js";
import {
  loadSmtpAuthMailConfig,
  NodemailerAuthMailDelivery,
} from "./modules/auth/services/auth-mail.delivery.js";
import { DeviceLoginService } from "./modules/auth/services/device-login.service.js";
import { resolveConfiguredPath } from "./config/paths.js";
import { SupervisionController } from "./modules/supervision/controllers/supervision.controller.js";
import { DrizzleSupervisionRepository } from "./modules/supervision/repositories/supervision.repository.js";
import { SupervisionService } from "./modules/supervision/services/supervision.service.js";
import { supervisionCandidates } from "./modules/supervision/services/supervision.policy.js";
import {
  BOOTSTRAP_RATE_LIMIT_SCOPE,
  bootstrapTokenPolicy,
  createBootstrapRateLimiter,
} from "./modules/auth/services/bootstrap-access.js";
import { createLoginRateLimits } from "./modules/auth/services/login-rate-limits.js";
import {
  InMemoryRecoveryRateLimiter,
  PasswordRecoveryService,
} from "./modules/auth/services/password-recovery.service.js";
import { SensitiveActionOtpService } from "./modules/auth/services/sensitive-action-otp.service.js";
import { createHttpLogger } from "./logging/http-logger.js";
import { logger } from "./logging/logger.js";
import { assertRuntimeSecurityFloor } from "./security/runtime-floor.startup.js";
import {
  createSecurityEventCounter,
  drizzleSecurityCounterStore,
  rateLimitedCode,
} from "./security/security-event-counters.js";
import { PrivacyController } from "./modules/privacy/controllers/privacy.controller.js";
import { privacyPurgeJob } from "./modules/privacy/jobs/privacy-purge.job.js";
import { DrizzlePrivacyRepository } from "./modules/privacy/repositories/privacy.repository.js";
import {
  createPrivacyJournal,
  PRIVACY_JOURNAL_DIR_ENV,
} from "./modules/privacy/services/privacy-journal.js";
import { PrivacyService } from "./modules/privacy/services/privacy.service.js";
import { AccessTokenSessionResolver } from "./modules/auth/services/access-token-session.resolver.js";
import { AuditService } from "./modules/auth/services/audit.service.js";
import type { DevToolsController } from "./modules/dev-tools/controllers/dev-tools.controller.js";
import { AuthRouteService } from "./modules/auth/services/auth-route.service.js";
import {
  BOOTSTRAP_ROLE,
  BootstrapService,
} from "./modules/auth/services/bootstrap.service.js";
import { OtpChallengeService } from "./modules/auth/services/otp-challenge.service.js";
import { PasswordService } from "./modules/auth/services/password.service.js";
import { SessionService } from "./modules/auth/services/session.service.js";
import { loadAuthConfig } from "./modules/auth/config/auth.config.js";
import { CatalogueController } from "./modules/catalogue/controllers/catalogue.controller.js";
import { DrizzleCatalogueRepository } from "./modules/catalogue/repositories/catalogue.repositories.js";
import { CatalogueService } from "./modules/catalogue/services/catalogue.service.js";
import { CatalogueContentService } from "./modules/catalogue/services/catalogue-content.service.js";
import { DrizzleCatalogueContentRepository } from "./modules/catalogue/repositories/catalogue-content.repository.js";
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

/** S7.4 D1: the one composition of the API; the mode decides what differs between development and production. */
export type RuntimeMode = "development" | "production";
/** TEST-01 D4: built by the development wrapper only, so the production chain never loads the dev-tools services. */
export type DevToolsControllerFactory = (context: {
  auditHashPepper: string;
  removePrivateFile: (key: string) => Promise<void>;
  warn: (line: string) => void;
}) => DevToolsController;
export type RuntimeOptions = {
  mode: RuntimeMode;
  env: NodeJS.ProcessEnv;
  devToolsController?: DevToolsControllerFactory;
};
/** S7.4 D1: nginx runs on the same host (Sprint 9), so only a loopback proxy is trusted for the client address. */
export const PRODUCTION_TRUST_PROXY = "loopback";

/** App plus the S7.2 scheduled jobs (started by the dev or prod entry script, not by tests that only need the app). */
export function createRuntime({
  mode,
  env,
  devToolsController,
}: RuntimeOptions) {
  // SEC-01 D2: before anything else; refuses production below the runtime floor, warns once elsewhere.
  assertRuntimeSecurityFloor({ nodeEnv: env.NODE_ENV, log: logger });
  const authConfig = loadAuthConfig(env);
  const audit = new AuditService(db, {
    auditHashPepper: authConfig.auditHashPepper,
  });
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
  const recordSecurityEvent = createSecurityEventCounter(
    drizzleSecurityCounterStore(db),
    { warn: (line) => logger.warn(line) },
  );

  const bootstrapService = new BootstrapService(
    new DrizzleBootstrapRepository(db),
    passwords,
    audit,
    {
      defaultRole: BOOTSTRAP_ROLE,
      // BOOT-01 B1/B2: production needs KFIT_BOOTSTRAP_TOKEN; every mode checks the origin and limits attempts per address.
      tokenPolicy: bootstrapTokenPolicy(mode, env),
      allowAttempt: createBootstrapRateLimiter(() =>
        recordSecurityEvent(rateLimitedCode(BOOTSTRAP_RATE_LIMIT_SCOPE)),
      ),
    },
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

  /*
   * Password recovery (Sprint 1 service, unchanged) is bound only when SMTP is configured (UX-10, Fred 2026-10-22).
   * Without SMTP_HOST the /auth/recovery/* routes keep answering 501 and the UI shows « Récupération indisponible ».
   * The sensitive-action OTP (UX-14c) is e-mailed through the same transport; without SMTP its request answers 501.
   */
  const authMail = env.SMTP_HOST
    ? new NodemailerAuthMailDelivery(loadSmtpAuthMailConfig(env))
    : undefined;
  const passwordRecoveryService = authMail
    ? new PasswordRecoveryService(
        new DrizzlePasswordRecoveryRepository(db),
        otpChallengeService,
        passwords,
        authMail,
        audit,
        new InMemoryRecoveryRateLimiter({
          windowMs: authConfig.recoveryRateLimitWindowMs,
          requestMax: authConfig.recoveryRequestMax,
          verifyMax: authConfig.recoveryVerifyMax,
          resetMax: authConfig.recoveryResetMax,
        }),
        {
          recoveryTokenSecret: authConfig.recoveryTokenSecret,
          recoveryGrantTtlMs: authConfig.recoveryGrantTtlMs,
        },
      )
    : undefined;
  const sensitiveActionOtpService = authMail
    ? new SensitiveActionOtpService(otpChallengeService, users, authMail, audit)
    : undefined;

  /*
   * SEC-02a (Gate 1 approved 2026-10-27): a login from an untrusted device needs the code e-mailed to the account.
   * Without SMTP that login answers 503 AUTH_OTP_DELIVERY_FAILED; there is no bypass in any environment (E9).
   */
  const deviceLoginService = new DeviceLoginService(
    new DrizzleTrustedDeviceRepository(db),
    new DrizzleOtpChallengeRepository(db),
    otpChallengeService,
    users,
    authMail ?? null,
    audit,
    createLoginRateLimits((scope) =>
      recordSecurityEvent(rateLimitedCode(scope)),
    ),
    {
      devicePepper: authConfig.devicePepper,
      trustedDeviceTtlMs: authConfig.trustedDeviceTtlMs,
      otpTtlMs: authConfig.otpTtlMs,
    },
  );
  const authRouteService = new AuthRouteService(
    users,
    sessionService,
    ({ password, passwordHash }) => passwords.verify(password, passwordHash),
    audit,
    {
      accessTokenSecret: authConfig.accessTokenSecret,
      accessTokenTtlMs: authConfig.accessTokenTtlMs,
      refreshTokenTtlMs: authConfig.refreshTokenTtlMs,
      cookieMode: mode,
    },
    deviceLoginService,
  );

  const authController = new AuthController({
    otpChallengeService,
    authRouteService,
    trustedDeviceService: deviceLoginService,
    bootstrapService,
    ...(passwordRecoveryService ? { passwordRecoveryService } : {}),
    ...(sensitiveActionOtpService ? { sensitiveActionOtpService } : {}),
  });

  const resolver = new AccessTokenSessionResolver(sessionRepository, {
    accessTokenSecret: authConfig.accessTokenSecret,
    inactivityTimeoutMs: authConfig.inactivityTimeoutMs,
  });

  const catalogueService = new CatalogueService(
    new DrizzleCatalogueRepository(db),
  );
  const catalogueController = new CatalogueController(
    catalogueService,
    new CatalogueContentService(
      new DrizzleCatalogueContentRepository(db, {
        auditHashPepper: authConfig.auditHashPepper,
      }),
    ),
  );

  const requestsController = new RequestsController(
    new RequestsService(new DrizzleRequestsRepository(db), audit),
  );

  const adminRequestsService = new AdminRequestsService(
    new DrizzleAdminRequestsRepository(db, {
      auditHashPepper: authConfig.auditHashPepper,
    }),
  );
  const adminRequestsController = new AdminRequestsController(
    adminRequestsService,
  );
  const followUpsService = new FollowUpsService(
    new DrizzleFollowUpsRepository(db, {
      auditHashPepper: authConfig.auditHashPepper,
    }),
  );
  const onboardingService = new OnboardingService(
    new DrizzleOnboardingRepository(db, {
      auditHashPepper: authConfig.auditHashPepper,
    }),
  );
  const customersService = new CustomersService(
    new DrizzleCustomersRepository(db, {
      auditHashPepper: authConfig.auditHashPepper,
    }),
  );
  // UX-9 « Aujourd'hui »: reuses each module's own service so every state is computed by its owner.
  const dashboardFinance = new DrizzleFinanceRepository(db, {
    auditHashPepper: authConfig.auditHashPepper,
  });
  const dashboardAlertsRepository = new DrizzleDashboardAlertsRepository(
    db,
    dashboardFinance,
  );
  const todayService = new TodayService(new DrizzleTodayRepository(db), {
    async followUpQueue(actor) {
      const result = await followUpsService.execute("", "queue", {}, actor);
      if (!result.ok || !("items" in result.body))
        throw new Error("Follow-up queue unavailable");
      return result.body;
    },
    customerOverview: () => customersService.getOverview(),
    catalogueOverview: () => catalogueService.listAdminOverview(),
    requests: () => adminRequestsService.listQueue({}),
    async onboarding(subscriptionId, actor) {
      const result = await onboardingService.execute(
        subscriptionId,
        "read",
        {},
        undefined,
        actor,
      );
      return result.status === "ok" ? result.onboarding : null;
    },
    collections: (now) => dashboardAlertsRepository.snapshot(now),
  });
  const todayController = new TodayController(todayService);
  const dashboardAlerts = new DashboardAlertsService(
    dashboardAlertsRepository,
    todayService,
  );
  const dashboardAnalyticsController = new DashboardAnalyticsController(
    new DashboardAnalyticsService(
      new DrizzleDashboardAnalyticsRepository(db, dashboardFinance),
    ),
    dashboardAlerts,
  );

  /*
   * S7.2 notifications. In-app history always works; e-mail is an optional side effect, delivered only when SMTP is configured
   * (otherwise outbox rows fail with NOT_CONFIGURED and end in dead letter, never blocking anything).
   * Sources are read through the S7.1 alert derivation as an active admin (read-only paths, no audit, no business mutation).
   */
  const notificationsRepository = new DrizzleNotificationsRepository(db, {
    auditHashPepper: authConfig.auditHashPepper,
    appBaseUrl: env.KFIT_APP_BASE_URL || "http://localhost:5173",
  });
  const notificationJobs: NotificationJobsService = new NotificationJobsService(
    notificationsRepository,
    async () => {
      const [reader] = await notificationsRepository.recipients(db);
      if (!reader) return [];
      return (
        await dashboardAlerts.alerts({
          userId: reader.id,
          requestId: `job:notifications.reconcile:${randomUUID()}`,
          ipAddress: null,
          userAgent: null,
        })
      ).alerts;
    },
    env.SMTP_HOST
      ? new NodemailerNotificationMailDelivery(loadSmtpAuthMailConfig(env))
      : null,
    () => new Date(),
    // OPS-01 O9: supervision alerts open and resolve with the same reconcile (supervisionService is built below, used at run time).
    async () => supervisionCandidates(await supervisionService.alerts()),
  );
  const startNotificationJobs = (log: (line: string) => void) =>
    startScheduledJobs(
      pool,
      db,
      [
        {
          jobKey: "notifications.reconcile",
          cron: "*/15 * * * *",
          windowMs: 15 * 60_000,
          work: () => notificationJobs.reconcile(),
        },
        {
          jobKey: "notifications.email-delivery",
          cron: "*/5 * * * *",
          windowMs: 5 * 60_000,
          work: () => notificationJobs.deliver(),
        },
      ],
      log,
    );

  /*
   * S7.3 privacy (Gate 1 approved 2026-10-25): archive, anonymize (fresh OTP + typed name), holds; daily purge job (D3, D12);
   * off-database journal when KFIT_PRIVACY_JOURNAL_DIR is set (D11), otherwise disabled with a startup warning.
   */
  const privacyRepository = new DrizzlePrivacyRepository(db, {
    auditHashPepper: authConfig.auditHashPepper,
  });
  const privacyJournal = createPrivacyJournal(env[PRIVACY_JOURNAL_DIR_ENV]);
  const privacyController = new PrivacyController(
    new PrivacyService(privacyRepository, privacyJournal, (errorType) =>
      logger.error(
        `✖ privacy journal append failed (${errorType}); run npm run privacy:journal-sync`,
      ),
    ),
    {
      lastConsumedAt: createFreshOtpLookup(db),
      windowMs: authConfig.freshOtpWindowMs,
    },
  );
  const privacyStorage = new PrivateDocumentStorage();
  const startPrivacyJobs = (log: (line: string) => void) =>
    startScheduledJobs(
      pool,
      db,
      [privacyPurgeJob(privacyRepository, (key) => privacyStorage.remove(key))],
      log,
    );

  /* OPS-01 (Gate 1 approved 2026-10-27): admin « Supervision » - job health, backups, restore checks, privacy, runtime, security series. */
  const supervisionService: SupervisionService = new SupervisionService({
    repository: new DrizzleSupervisionRepository(db, {
      auditHashPepper: authConfig.auditHashPepper,
    }),
    privacy: privacyRepository,
    pool,
    db,
    mode,
    env,
    journalDir: resolveConfiguredPath(env[PRIVACY_JOURNAL_DIR_ENV]),
    manualRunners: {
      "notifications.reconcile": () => notificationJobs.reconcile(),
      "notifications.email-delivery": () => notificationJobs.deliver(),
    },
    onManualRunRateLimited: () =>
      recordSecurityEvent(rateLimitedCode("supervision_run")),
  });

  const documentsController = new DocumentsController(
    new DocumentsService(
      new DrizzleDocumentsRepository(db, {
        auditHashPepper: authConfig.auditHashPepper,
        tokenPepper: authConfig.otpPepper,
        verificationPepper: authConfig.otpPepper,
      }),
      new PrivateDocumentStorage(),
      new PuppeteerProgressSummaryRenderer(),
    ),
  );

  const proofStorage = new PrivateDocumentStorage();
  const receiptStorage = new PrivateDocumentStorage(),
    receiptRenderer = new PuppeteerReceiptRenderer();
  const app = createServerApp({
    requestLogger: createHttpLogger(),
    recordSecurityEvent,
    receiptsController: new ReceiptsController(
      new ReceiptsService(
        new DrizzleReceiptsRepository(
          db,
          {
            auditHashPepper: authConfig.auditHashPepper,
            tokenPepper: authConfig.otpPepper,
          },
          {
            render: (snapshot) => receiptRenderer.render(snapshot),
            persist: (input) => receiptStorage.persist(input),
            read: (key) => receiptStorage.read(key),
            remove: (key) => receiptStorage.remove(key),
          },
        ),
      ),
    ),
    paymentProofsController: new PaymentProofsController(
      new PaymentProofsService(
        new DrizzlePaymentProofsRepository(
          db,
          {
            auditHashPepper: authConfig.auditHashPepper,
            tokenPepper: authConfig.otpPepper,
          },
          proofStorage,
        ),
        proofStorage,
      ),
    ),
    financeController: new FinanceController(
      new FinanceService(
        new DrizzleFinanceRepository(db, {
          auditHashPepper: authConfig.auditHashPepper,
        }),
      ),
    ),
    quotesController: new QuotesController(
      new QuotesService(
        new DrizzleQuotesRepository(
          db,
          {
            auditHashPepper: authConfig.auditHashPepper,
            tokenPepper: authConfig.otpPepper,
          },
          {
            render: (snapshot) => new PuppeteerQuoteRenderer().render(snapshot),
            persist: (input) => new PrivateDocumentStorage().persist(input),
            read: (key) => new PrivateDocumentStorage().read(key),
            remove: (key) => new PrivateDocumentStorage().remove(key),
          },
        ),
      ),
    ),
    documentsController,
    progressController: new ProgressController(
      new ProgressService(
        new DrizzleProgressRepository(db, {
          auditHashPepper: authConfig.auditHashPepper,
        }),
      ),
    ),
    followUpsController: new FollowUpsController(followUpsService),
    appointmentsController: new AppointmentsController(
      new AppointmentsService(
        new DrizzleAppointmentsRepository(db, {
          auditHashPepper: authConfig.auditHashPepper,
        }),
      ),
    ),
    subscriptionsController: new SubscriptionsController(
      new SubscriptionsService(
        new DrizzleSubscriptionsRepository(db, {
          auditHashPepper: authConfig.auditHashPepper,
        }),
      ),
    ),
    questionnaireController: new QuestionnaireController(
      new QuestionnaireService(
        new DrizzleQuestionnaireRepository(db, {
          auditHashPepper: authConfig.auditHashPepper,
        }),
      ),
      new QuestionnaireTemplateService(
        new DrizzleQuestionnaireTemplateRepository(db, {
          auditHashPepper: authConfig.auditHashPepper,
        }),
      ),
      {
        lastConsumedAt: createFreshOtpLookup(db),
        windowMs: authConfig.freshOtpWindowMs,
      },
    ),
    consentController: new ConsentController(
      new ConsentService(
        new DrizzleConsentRepository(db, {
          auditHashPepper: authConfig.auditHashPepper,
        }),
      ),
      new ConsentDefinitionService(
        new DrizzleConsentRepository(db, {
          auditHashPepper: authConfig.auditHashPepper,
        }),
      ),
      {
        lastConsumedAt: createFreshOtpLookup(db),
        windowMs: authConfig.freshOtpWindowMs,
      },
    ),
    authController,
    resolveAuthSession: (request) => resolver.resolveFromRequest(request),
    catalogueController,
    requestsController,
    adminRequestsController,
    onboardingController: new OnboardingController(onboardingService),
    requestConversionController: new RequestConversionController(
      new RequestConversionService(
        new DrizzleRequestConversionRepository(db, {
          auditHashPepper: authConfig.auditHashPepper,
        }),
      ),
    ),
    customersController: new CustomersController(customersService),
    todayController,
    dashboardAnalyticsController,
    notificationsController: new NotificationsController(
      notificationsRepository,
    ),
    privacyController,
    supervisionController: new SupervisionController(supervisionService),
    // TEST-01 D4 / S7.4 D1: « Données de test » cleanup, never mounted in production.
    ...(mode === "development" && devToolsController
      ? {
          devToolsController: devToolsController({
            auditHashPepper: authConfig.auditHashPepper,
            removePrivateFile: (key) => privacyStorage.remove(key),
            warn: (line) => logger.warn(line),
          }),
        }
      : {}),
  });
  if (mode === "production") app.set("trust proxy", PRODUCTION_TRUST_PROXY);
  return {
    app,
    startNotificationJobs,
    startPrivacyJobs,
    privacyJournalEnabled: privacyJournal !== null,
  };
}
import { ConsentController } from "./modules/consents/controllers/consent.controller.js";
import {
  ConsentDefinitionService,
  ConsentService,
} from "./modules/consents/services/consent.service.js";
import { DrizzleConsentRepository } from "./modules/consents/repositories/consent.repository.js";
import { QuestionnaireController } from "./modules/questionnaires/controllers/questionnaire.controller.js";
import {
  QuestionnaireService,
  QuestionnaireTemplateService,
} from "./modules/questionnaires/services/questionnaire.service.js";
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
import { TodayController } from "./modules/dashboard/controllers/today.controller.js";
import { TodayService } from "./modules/dashboard/services/today.service.js";
import { DrizzleTodayRepository } from "./modules/dashboard/repositories/today.repository.js";
