import axios from "axios";
import type {
  PrivacyErrorCode,
  PrivacySubjectType,
  SubjectArchivedErrorCode,
} from "@kfit/shared";
import {
  archivedSubjectMessages,
  commonApiErrorMessage,
} from "../../lib/api-error-messages.js";

/** S7.3b-2 D10: one map for every privacy and archive-freeze code. AUTH_FRESH_OTP_REQUIRED is handled by the anonymize flow. */
const messages: Record<PrivacyErrorCode | SubjectArchivedErrorCode, string> = {
  PRIVACY_INVALID_INPUT:
    "La demande est invalide. Vérifie les champs puis réessaie.",
  PRIVACY_ADMIN_FORBIDDEN: "Cet espace est réservé à l'administrateur.",
  PRIVACY_SUBJECT_NOT_FOUND: "Cette fiche est introuvable. Actualise la page.",
  PRIVACY_SUBJECT_NOT_ARCHIVED:
    "Cette fiche n'est plus archivée. Elle a été actualisée.",
  PRIVACY_SUBJECT_ANONYMIZED:
    "Cette fiche est anonymisée : elle ne peut plus être désarchivée.",
  PRIVACY_SUBJECT_HAS_ACTIVE_SUBSCRIPTION:
    "Tous les abonnements doivent être terminés ou annulés.",
  PRIVACY_SUBJECT_HAS_OPEN_REQUEST:
    "Toutes les demandes du prospect doivent être clôturées avant de l'archiver.",
  PRIVACY_CONFIRMATION_MISMATCH: "Le nom saisi ne correspond pas.",
  PRIVACY_RETENTION_HOLD_ACTIVE:
    "Un blocage de conservation est actif sur ce client. Lève-le avant d'anonymiser.",
  PRIVACY_HOLD_ALREADY_ACTIVE:
    "Un blocage de ce type est déjà actif sur ce client.",
  PRIVACY_HOLD_NOT_FOUND:
    "Ce blocage est introuvable. La liste a été actualisée.",
  PRIVACY_HOLD_ALREADY_RELEASED:
    "Ce blocage a déjà été levé. La liste a été actualisée.",
  PRIVACY_ROUTE_UNEXPECTED_FAILURE:
    "L'action n'a pas pu être confirmée. Réessaie dans un instant.",
  CUSTOMER_ARCHIVED: archivedSubjectMessages.CUSTOMER_ARCHIVED,
  PROSPECT_ARCHIVED: archivedSubjectMessages.PROSPECT_ARCHIVED,
};
/** S7.3b-2 D5: shown before submit when a hold is active, and after a 409 PRIVACY_RETENTION_HOLD_ACTIVE. */
export const holdActiveMessage = (subjectType: PrivacySubjectType) =>
  subjectType === "customer"
    ? messages.PRIVACY_RETENTION_HOLD_ACTIVE
    : "Un blocage de conservation est actif sur ce prospect. Il doit être levé avant d'anonymiser.";

export function privacyErrorCode(error: unknown): string | null {
  const code: unknown = axios.isAxiosError<{ error?: unknown }>(error)
    ? error.response?.data?.error
    : null;
  return typeof code === "string" ? code : null;
}

export function privacyErrorMessage(
  error: unknown,
  subjectType: PrivacySubjectType = "customer",
): string {
  const code = privacyErrorCode(error);
  if (code === "PRIVACY_RETENTION_HOLD_ACTIVE")
    return holdActiveMessage(subjectType);
  const common = commonApiErrorMessage(code);
  if (common) return common;
  if (code !== null && code in messages)
    return messages[code as keyof typeof messages];
  return axios.isAxiosError(error) && !error.response
    ? "Serveur injoignable. Vérifie ta connexion et réessaie."
    : "L'action n'a pas pu être confirmée. Réessaie dans un instant.";
}
