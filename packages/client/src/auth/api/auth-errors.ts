import axios from "axios";
import { authPasswordRuleLabels, type AuthPasswordRule } from "@kfit/shared";

/** What the auth screens need from a failed call: HTTP status (0 = unreachable), API code, policy reason. */
export type AuthFailure = { status: number; code: string | null; reason: string | null };

export function authFailureOf(error: unknown): AuthFailure {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { error?: unknown; reason?: unknown } | undefined;
    return {
      status: error.response?.status ?? 0,
      code: typeof body?.error === "string" ? body.error : null,
      reason: typeof body?.reason === "string" ? body.reason : null,
    };
  }
  return { status: 0, code: null, reason: null };
}

/*
 * French wording validated by Fred (UX-10, 2026-10-22). Account existence is never revealed:
 * invalid credentials and unavailable account share one message; recovery request is always neutral.
 */
export const authMessages = {
  loginRejected: "Identifiants invalides ou compte indisponible.",
  rateLimited: "Trop de tentatives. Réessaie dans quelques minutes.",
  unreachable: "Serveur injoignable. Vérifie ta connexion et réessaie.",
  generic: "Une erreur est survenue. Réessaie dans un instant.",
  recoveryUnavailable: "Récupération indisponible. Contacte l'administrateur.",
  recoverySent: "Si un compte existe pour cet e-mail, un code a été envoyé.",
  codeInvalid: "Code invalide ou expiré.",
  grantExpired: "Le délai pour choisir un nouveau mot de passe a expiré. Recommence la récupération.",
  resetDone: "Mot de passe modifié. Tu peux te connecter.",
  bootstrapDone: "Compte initial créé. Tu peux te connecter.",
  otpDeliveryUnavailable: "Envoi du code indisponible. Contacte l'administrateur.",
  otpDeliveryFailed: "Le code n'a pas pu être envoyé. Réessaie dans un instant.",
} as const;

/** Sensitive-action code request (UX-14c): no mail transport (501) or the e-mail failed (503). */
export function sensitiveOtpRequestMessage(failure: AuthFailure): string {
  if (failure.status === 501) return authMessages.otpDeliveryUnavailable;
  if (failure.status === 503) return authMessages.otpDeliveryFailed;
  return commonAuthMessage(failure);
}

/** Shared tail: rate limit, unreachable server, recovery not bound (501), anything else. */
export function commonAuthMessage(failure: AuthFailure): string {
  if (failure.status === 0) return authMessages.unreachable;
  if (failure.status === 429 || failure.code === "AUTH_RATE_LIMITED") return authMessages.rateLimited;
  if (failure.status === 501) return authMessages.recoveryUnavailable;
  return authMessages.generic;
}

export function loginErrorMessage(failure: AuthFailure): string {
  if (failure.code === "AUTH_INVALID_CREDENTIALS" || failure.code === "AUTH_ACCOUNT_UNAVAILABLE" || failure.code === "AUTH_LOGIN_INVALID_FORMAT") {
    return authMessages.loginRejected;
  }
  return commonAuthMessage(failure);
}

/** Server password policy reasons → the same labels as the meter. */
export function passwordPolicyMessage(failure: AuthFailure): string | null {
  if (failure.code !== "AUTH_PASSWORD_POLICY_FAILED") return null;
  const label = authPasswordRuleLabels[failure.reason as AuthPasswordRule];
  return label ? `Mot de passe refusé : ${label.toLowerCase()}.` : "Mot de passe refusé par la politique de sécurité.";
}
