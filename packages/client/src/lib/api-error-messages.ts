/**
 * FIX-02 D6: messages for the codes every admin module can receive. Each module's `…ErrorMessage` asks this first, then
 * maps its own codes. One wording for the AUTH codes everywhere (Fred 2026-10-26).
 */
export const archivedSubjectMessages = {
  CUSTOMER_ARCHIVED:
    "Ce client est archivé : désarchive-le pour modifier sa fiche.",
  PROSPECT_ARCHIVED:
    "Ce prospect est archivé : désarchive-le pour modifier sa demande.",
} as const;

const commonMessages: Record<string, string> = {
  AUTH_SESSION_REQUIRED: "Ta session a expiré. Reconnecte-toi.",
  AUTH_CSRF_INVALID: "La vérification de sécurité a échoué. Recharge la page.",
  AUTH_ORIGIN_INVALID:
    "La vérification de sécurité a échoué. Recharge la page.",
  ...archivedSubjectMessages,
};

/** Public link pages are read by the customer: the archive instruction is for the coach, so the module fallback applies there. */
export type ApiErrorAudience = "admin" | "public";

export function commonApiErrorMessage(
  code: unknown,
  audience: ApiErrorAudience = "admin",
): string | null {
  if (typeof code !== "string" || !Object.hasOwn(commonMessages, code))
    return null;
  if (audience === "public" && Object.hasOwn(archivedSubjectMessages, code))
    return null;
  return commonMessages[code]!;
}
