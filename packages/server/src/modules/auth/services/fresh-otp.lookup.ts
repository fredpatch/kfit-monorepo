import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { db as appDb } from "../../../db/client.js";
import { otpChallenges } from "../../../db/schema/auth.js";

/**
 * When did this session last confirm a sensitive-action OTP? (UX-14c)
 * Read on demand by the few routes that require a fresh OTP; the access-token resolver stays unchanged.
 */
export function createFreshOtpLookup(database: typeof appDb) {
  return async function lastConsumedAt(
    userId: string,
    sessionId: string,
  ): Promise<Date | null> {
    const [row] = await database
      .select({ consumedAt: otpChallenges.consumedAt })
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.purpose, "sensitive_action"),
          eq(otpChallenges.userId, userId),
          eq(otpChallenges.sessionId, sessionId),
          isNotNull(otpChallenges.consumedAt),
        ),
      )
      .orderBy(desc(otpChallenges.consumedAt))
      .limit(1);
    return row?.consumedAt ?? null;
  };
}
