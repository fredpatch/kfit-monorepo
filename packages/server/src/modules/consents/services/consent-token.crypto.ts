import { createHash, randomBytes } from "node:crypto";
import type { ConsentErrorCode } from "@kfit/shared";
export const consentTokenScope = {
  resourceType: "subscription",
  action: "onboarding_consent",
} as const;
export const optionalConsentTokenScope = {
  resourceType: "subscription",
  action: "optional_consent",
} as const;
export const consentTokenActions = [
  consentTokenScope.action,
  optionalConsentTokenScope.action,
] as const;
export function createConsentToken(): string {
  return randomBytes(32).toString("base64url");
}
export function hashConsentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export type TokenState = {
  resourceType: string;
  action: string;
  expiresAt: Date;
  revokedAt: Date | null;
  usedAt: Date | null;
  useCount: number;
  maxUses: number | null;
  requiresOtp: boolean;
};
export function validateConsentToken(
  token: TokenState,
  now = new Date(),
): ConsentErrorCode | null {
  if (
    token.resourceType !== consentTokenScope.resourceType ||
    !consentTokenActions.some((action) => action === token.action) ||
    token.requiresOtp ||
    token.maxUses !== 1
  )
    return "CONSENT_LINK_INVALID";
  if (token.revokedAt) return "CONSENT_LINK_REVOKED";
  if (token.usedAt || token.useCount !== 0) return "CONSENT_LINK_CONSUMED";
  if (token.expiresAt.getTime() <= now.getTime()) return "CONSENT_LINK_EXPIRED";
  return null;
}
