import type { RecordAuditEventInput } from "./audit.service.js";
import type { AuthUserRecord } from "./auth-route.service.js";
import type { PasswordService, PasswordStrengthResult } from "./password.service.js";

export type BootstrapRepository = {
  countUsers(): Promise<number>;
  createFirstUser(input: {
    email: string;
    passwordHash: string;
    role: "admin" | "coach";
  }): Promise<AuthUserRecord>;
};

export type BootstrapAuditRecorder = {
  record(input: RecordAuditEventInput): Promise<unknown>;
};

export type BootstrapServiceOptions = {
  defaultRole: "admin" | "coach";
};

export type BootstrapStatus = {
  required: boolean;
};

export type BootstrapCreateResult =
  | { status: "created"; user: Pick<AuthUserRecord, "id" | "email" | "role" | "status"> }
  | { status: "already_completed" }
  | { status: "invalid_password"; reason: Exclude<PasswordStrengthResult, { ok: true }>["reason"] };

function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class BootstrapService {
  constructor(
    private readonly repository: BootstrapRepository,
    private readonly passwords: Pick<PasswordService, "hash" | "validate">,
    private readonly audit: BootstrapAuditRecorder,
    private readonly options: BootstrapServiceOptions = { defaultRole: "coach" },
  ) {}

  async status(): Promise<BootstrapStatus> {
    return { required: await this.repository.countUsers() === 0 };
  }

  async create(input: {
    email: string;
    password: string;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<BootstrapCreateResult> {
    if (await this.repository.countUsers() > 0) {
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
