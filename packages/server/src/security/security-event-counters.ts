import { sql } from "drizzle-orm";
import { businessDateKey } from "@kfit/shared";
import type { db as appDb } from "../db/client.js";
import { securityEventCounters } from "../db/schema/operations.js";
import type { REQUEST_ENCODING_UNSUPPORTED } from "./reject-encoded-request-bodies.js";

/*
 * S7.4 D12 / S7.4b B9: 415 and 429 refusals counted per Africa/Libreville day and code, for OPS-01. No IP, no path, no
 * request id. Fire-and-forget: a failed write is logged at most once per interval and never changes the response.
 */
export const RATE_LIMIT_SCOPES = [
  "requests",
  "appointments",
  "consents",
  "documents",
  "payment-proofs",
  "questionnaires",
  "quotes",
  "receipts",
  "auth_login",
  "auth_verify",
  "auth_resend",
  "auth_bootstrap",
  "supervision_run",
] as const;
export type RateLimitScope = (typeof RATE_LIMIT_SCOPES)[number];
export type SecurityEventCode =
  | typeof REQUEST_ENCODING_UNSUPPORTED
  | `RATE_LIMITED:${RateLimitScope}`;
export type SecurityEventRecorder = (code: SecurityEventCode) => void;
export type IncrementSecurityCounter = (
  day: string,
  code: SecurityEventCode,
) => Promise<unknown>;
export const rateLimitedCode = (scope: RateLimitScope): SecurityEventCode =>
  `RATE_LIMITED:${scope}`;
export const SECURITY_COUNTER_WARN_INTERVAL_MS = 60_000;

/** Upsert count + 1 for (day, code). */
export const drizzleSecurityCounterStore =
  (database: typeof appDb): IncrementSecurityCounter =>
  (day, code) =>
    database
      .insert(securityEventCounters)
      .values({ day, code, count: 1 })
      .onConflictDoUpdate({
        target: [securityEventCounters.day, securityEventCounters.code],
        set: { count: sql`${securityEventCounters.count} + 1` },
      });

export function createSecurityEventCounter(
  increment: IncrementSecurityCounter,
  options: { warn: (line: string) => void; clock?: () => Date },
): SecurityEventRecorder {
  const clock = options.clock ?? (() => new Date());
  let lastWarnAt = Number.NEGATIVE_INFINITY;
  const warnThrottled = (error: unknown) => {
    const now = clock().getTime();
    if (now - lastWarnAt < SECURITY_COUNTER_WARN_INTERVAL_MS) return;
    lastWarnAt = now;
    options.warn(
      `✖ security event counter write failed (${error instanceof Error ? error.name : "error"})`,
    );
  };
  return (code) => {
    try {
      increment(businessDateKey(clock()), code).then(
        () => undefined,
        warnThrottled,
      );
    } catch (error) {
      warnThrottled(error);
    }
  };
}
