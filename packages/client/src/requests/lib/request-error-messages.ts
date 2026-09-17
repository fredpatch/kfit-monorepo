import axios from "axios";
import type { RequestErrorCode, RequestErrorResponse } from "@kfit/shared";

const requestErrorMessages: Record<RequestErrorCode, string> = {
  REQUEST_ROUTE_UNEXPECTED_FAILURE: "Une erreur est survenue. Réessaie dans un instant.",
  REQUEST_INVALID_INPUT: "Vérifie les informations saisies (nom, WhatsApp) puis réessaie.",
  REQUEST_SERVICE_NOT_FOUND: "Ce service n'est plus disponible pour une nouvelle demande. Actualise la page.",
  REQUEST_SERVICE_NOT_PUBLIC: "Ce service n'est plus disponible pour une nouvelle demande. Actualise la page.",
  REQUEST_SERVICE_UNAVAILABLE: "Ce service est temporairement fermé aux nouvelles demandes.",
  REQUEST_SERVICE_ARCHIVED: "Ce service n'est plus disponible pour une nouvelle demande. Actualise la page.",
  REQUEST_WAITLIST_REQUIRED: "Ce service accepte uniquement les inscriptions sur liste d'attente.",
  REQUEST_VARIANT_INVALID: "L'option sélectionnée n'est plus disponible. Choisis une autre option.",
  REQUEST_RATE_LIMITED: "Trop de tentatives. Réessaie dans quelques minutes.",
  REQUEST_ADMIN_FORBIDDEN: "Accès réservé à l'administrateur.",
  REQUEST_NOT_FOUND: "Cette demande est introuvable. Actualise la liste.",
  REQUEST_INVALID_TRANSITION: "Ce changement de statut n'est pas autorisé depuis l'état actuel.",
  REQUEST_CONTACT_ATTEMPT_INVALID_INPUT: "Vérifie les informations du contact (canal, sens, résultat) puis réessaie.",
  REQUEST_STATUS_INVALID_INPUT: "Le statut demandé n'est pas valide.",
};

const fallbackMessage = "Une erreur est survenue. Réessaie dans un instant.";

/** Codes where the same submission (same token/payload) is worth retrying immediately. */
const transientErrorCodes: ReadonlySet<RequestErrorCode> = new Set([
  "REQUEST_RATE_LIMITED",
  "REQUEST_ROUTE_UNEXPECTED_FAILURE",
]);

/**
 * Codes where the service/variant itself is unusable — resubmitting the same
 * data will fail identically. The UI should not encourage an identical retry.
 */
const terminalErrorCodes: ReadonlySet<RequestErrorCode> = new Set([
  "REQUEST_SERVICE_NOT_FOUND",
  "REQUEST_SERVICE_NOT_PUBLIC",
  "REQUEST_SERVICE_ARCHIVED",
  "REQUEST_SERVICE_UNAVAILABLE",
  "REQUEST_WAITLIST_REQUIRED",
  "REQUEST_VARIANT_INVALID",
]);

function isKnownRequestErrorCode(code: string): code is RequestErrorCode {
  return code in requestErrorMessages;
}

/**
 * Extracts the server's typed error code from a failed submission, or `undefined`
 * for a network/transport failure with no server response. Never surfaces the
 * raw `reason` string — that field exists for internal/audit use only.
 */
export function extractRequestErrorCode(error: unknown): RequestErrorCode | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const data = error.response?.data as RequestErrorResponse | undefined;
  const code = data?.error;
  return typeof code === "string" && isKnownRequestErrorCode(code) ? code : undefined;
}

/** Maps a typed error code (or `undefined` for network/unknown failures) to French UI copy. */
export function translateRequestError(code: RequestErrorCode | undefined): string {
  if (code && isKnownRequestErrorCode(code)) return requestErrorMessages[code];
  return fallbackMessage;
}

export type RequestErrorKind = "transient" | "terminal" | "correctable";

/**
 * Classifies a failure for UX purposes only:
 * - "transient": worth an immediate identical retry (rate limit, unexpected failure, network).
 * - "terminal": the service/variant state itself is the problem; do not encourage an identical retry.
 * - "correctable": the submitted data is the problem; the user can edit and resubmit.
 */
export function classifyRequestError(code: RequestErrorCode | undefined): RequestErrorKind {
  if (code === undefined) return "transient";
  if (transientErrorCodes.has(code)) return "transient";
  if (terminalErrorCodes.has(code)) return "terminal";
  return "correctable";
}
