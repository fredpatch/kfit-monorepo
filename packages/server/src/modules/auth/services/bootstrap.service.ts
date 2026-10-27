import type { AuthRole } from "@kfit/shared";
import { createHash, timingSafeEqual } from "node:crypto";
import type { RecordAuditEventInput } from "./audit.service.js";
import type { AuthUserRecord } from "./auth-route.service.js";
import type {
  PasswordService,
  PasswordStrengthResult,
} from "./password.service.js";

/**
 * BOOT-01 B1: development needs no token; production needs KFIT_BOOTSTRAP_TOKEN, and without it the route is closed.
 * `token` is null when the variable is absent, too short or a placeholder.
 */
export type BootstrapTokenPolicy =
  | { required: false }
  | { required: true; token: string | null };

/** BOOT-01 B1: SHA-256 first, so the comparison is constant-time whatever the candidate's length. */
function sameToken(candidate: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}

export type BootstrapRepository = {
  countUsers(): Promise<number>;
  createFirstUser(input: {
    email: string;
    passwordHash: string;
    role: AuthRole;
  }): Promise<AuthUserRecord>;
};

export type BootstrapAuditRecorder = {
  record(input: RecordAuditEventInput): Promise<unknown>;
};

/** ROLE-01 R4: the first account is the only superadmin; ops:create-user never creates one. */
export const BOOTSTRAP_ROLE: AuthRole = "superadmin";

export type BootstrapServiceOptions = {
  defaultRole: AuthRole;
  tokenPolicy?: BootstrapTokenPolicy;
  /** BOOT-01 B2: attempts per client address (refusals are counted by the caller's limiter). */
  allowAttempt?: (ipAddress: string, now: number) => boolean;
};

export type BootstrapStatus = {
  required: boolean;
  tokenRequired: boolean;
  enabled: boolean;
};

export type BootstrapCreateResult =
  | {
      status: "created";
      user: Pick<AuthUserRecord, "id" | "email" | "role" | "status">;
    }
  | { status: "already_completed" }
  | { status: "rate_limited" }
  | { status: "disabled" }
  | { status: "token_invalid" }
  | {
      status: "invalid_password";
      reason: Exclude<PasswordStrengthResult, { ok: true }>["reason"];
    };

function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class BootstrapService {
  constructor(
    private readonly repository: BootstrapRepository,
    private readonly passwords: Pick<PasswordService, "hash" | "validate">,
    private readonly audit: BootstrapAuditRecorder,
    private readonly options: BootstrapServiceOptions = {
      defaultRole: "coach",
    },
  ) {}

  async status(): Promise<BootstrapStatus> {
    const policy = this.options.tokenPolicy ?? { required: false };
    return {
      required: (await this.repository.countUsers()) === 0,
      tokenRequired: policy.required,
      enabled: !policy.required || policy.token !== null,
    };
  }

  async create(input: {
    email: string;
    password: string;
    /** BOOT-01 B1: the x-kfit-bootstrap-token header; never audited or logged. */
    token?: string | undefined;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<BootstrapCreateResult> {
    if (
      this.options.allowAttempt &&
      !this.options.allowAttempt(input.ipAddress ?? "", Date.now())
    )
      return { status: "rate_limited" };

    if ((await this.repository.countUsers()) > 0) {
      await this.audit.record({
        actorType: "anonymous",
        actorUserId: null,
        eventType: "auth.bootstrap.rejected",
        entityType: "user",
        result: "blocked",
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: { reason: "already_completed" },
      });
      return { status: "already_completed" };
    }

    const policy = this.options.tokenPolicy ?? { required: false };
    if (policy.required) {
      const rejected = async (reason: "disabled" | "token_invalid") =>
        this.audit.record({
          actorType: "anonymous",
          actorUserId: null,
          eventType: "auth.bootstrap.rejected",
          entityType: "user",
          result: "blocked",
          requestId: input.requestId ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          metadata: { reason },
        });
      if (policy.token === null) {
        await rejected("disabled");
        return { status: "disabled" };
      }
      if (!input.token || !sameToken(input.token, policy.token)) {
        await rejected("token_invalid");
        return { status: "token_invalid" };
      }
    }

    const strength = this.passwords.validate(input.password);
    if (!strength.ok) {
      await this.audit.record({
        actorType: "anonymous",
        actorUserId: null,
        eventType: "auth.bootstrap.rejected",
        entityType: "user",
        result: "failure",
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: { reason: strength.reason },
      });
      return { status: "invalid_password", reason: strength.reason };
    }

    const user = await this.repository.createFirstUser({
      email: canonicalEmail(input.email),
      passwordHash: await this.passwords.hash(input.password),
      role: this.options.defaultRole,
    });

    await this.audit.record({
      actorType: "user",
      actorUserId: user.id,
      eventType: "auth.bootstrap.created",
      entityType: "user",
      entityId: user.id,
      result: "success",
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { role: user.role },
    });

    return {
      status: "created",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    };
  }
}
