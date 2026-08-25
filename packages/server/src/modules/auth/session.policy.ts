export type SessionClock = {
  expiresAt: Date;
  absoluteExpiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  compromisedAt: Date | null;
};

export type SessionInvalidReason =
  | "revoked"
  | "compromised"
  | "refresh_expired"
  | "absolute_expired"
  | "inactive";

export function sessionInvalidReason(
  session: SessionClock,
  now: Date,
  inactivityTimeoutMs: number,
): SessionInvalidReason | null {
  if (session.revokedAt) return "revoked";
  if (session.compromisedAt) return "compromised";
  if (now >= session.expiresAt) return "refresh_expired";
  if (now >= session.absoluteExpiresAt) return "absolute_expired";
  if (now.getTime() - session.lastSeenAt.getTime() >= inactivityTimeoutMs) return "inactive";
  return null;
}

export function isFreshOtp(consumedAt: Date | null, now: Date, freshWindowMs: number): boolean {
  if (!consumedAt || consumedAt > now) return false;
  return now.getTime() - consumedAt.getTime() <= freshWindowMs;
}
