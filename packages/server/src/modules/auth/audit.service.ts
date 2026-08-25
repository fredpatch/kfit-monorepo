import { createHmac } from "node:crypto";
import type { db as appDb } from "../../db/client.js";
import { auditEvents } from "../../db/schema/auth.js";

export type AuditActorType = "user" | "system" | "anonymous";
export type AuditResult = "success" | "failure" | "blocked";

export type AuditMetadata = Record<string, string | number | boolean | null | AuditMetadata | AuditMetadata[]>;

export type RecordAuditEventInput = {
  actorType: AuditActorType;
  actorUserId?: string | null;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  result: AuditResult;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: AuditMetadata | null;
};

type AppDb = typeof appDb;
type AuditDb = Pick<AppDb, "insert">;

export function hashAuditContext(value: string | null | undefined, pepper: string): string | null {
  if (!value) return null;
  return createHmac("sha256", pepper).update(value).digest("hex");
}

export class AuditService {
  constructor(
    private readonly database: AuditDb,
    private readonly options: { auditHashPepper: string },
  ) {}

  async record(input: RecordAuditEventInput) {
    const [event] = await this.database
      .insert(auditEvents)
      .values({
        actorUserId: input.actorUserId ?? null,
        actorType: input.actorType,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        result: input.result,
        requestId: input.requestId ?? null,
        ipHash: hashAuditContext(input.ipAddress, this.options.auditHashPepper),
        userAgentHash: hashAuditContext(input.userAgent, this.options.auditHashPepper),
        metadataJson: input.metadata ?? null,
      })
      .returning();

    return event;
  }
}
