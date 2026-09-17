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

  return createServerApp({
    authController,
    resolveAuthSession: (request) => resolver.resolveFromRequest(request),
    catalogueController,
  });
}
