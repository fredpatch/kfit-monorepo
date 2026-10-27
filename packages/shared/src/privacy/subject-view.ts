/* ------------------------------------------------------------------ */
/* S7.3b-2 privacy view rules (Gate 1 approved 2026-10-26, D2-D8).     */
/* Pure; the server stays authoritative and refuses every frozen write. */
/* ------------------------------------------------------------------ */

/** S7.3 D9: trim + Unicode NFC + collapsed inner whitespace, case-sensitive. Shared so the dialog enables exactly what the server accepts (S7.3b-2 D5). */
export function normalizeConfirmName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}
export function confirmationMatches(
  typed: string,
  displayedName: string,
): boolean {
  return normalizeConfirmName(typed) === normalizeConfirmName(displayedName);
}

export const subjectModes = ["active", "archived", "anonymized"] as const;
export type SubjectMode = (typeof subjectModes)[number];
type SubjectPrivacyDates = {
  archivedAt: string | null;
  anonymizedAt: string | null;
};

/** Anonymization implies archive, so an anonymized subject is never shown as merely archived. */
export function subjectMode(privacy: SubjectPrivacyDates): SubjectMode {
  if (privacy.anonymizedAt) return "anonymized";
  return privacy.archivedAt ? "archived" : "active";
}

export type PrivacyMenuAction =
  | "archive"
  | "unarchive"
  | "add_hold"
  | "anonymize";
export type PrivacyMenuEntry = { action: PrivacyMenuAction; enabled: boolean };
/** Menu groups, rendered with a separator between them; « anonymize » is the destructive entry. */
export type PrivacyMenu = PrivacyMenuEntry[][];

/** S7.3b-2 D3 (customer fiche ⋯). Holds are available in every state (D7). */
export function customerPrivacyMenu(
  privacy: SubjectPrivacyDates & { archivable: boolean; unarchivable: boolean },
): PrivacyMenu {
  const addHold: PrivacyMenuEntry = { action: "add_hold", enabled: true };
  switch (subjectMode(privacy)) {
    case "active":
      return [[{ action: "archive", enabled: privacy.archivable }, addHold]];
    case "archived":
      return [
        [
          ...(privacy.unarchivable
            ? [{ action: "unarchive" as const, enabled: true }]
            : []),
          addHold,
        ],
        [{ action: "anonymize", enabled: true }],
      ];
    case "anonymized":
      return [[addHold]];
  }
}

/** S7.3b-2 D8 (request detail ⋯): no holds for prospects; an archived prospect is always unarchivable (ARCH-01 D9). */
export function prospectPrivacyMenu(
  privacy: SubjectPrivacyDates & { archivable: boolean },
): PrivacyMenu {
  switch (subjectMode(privacy)) {
    case "active":
      return privacy.archivable ? [[{ action: "archive", enabled: true }]] : [];
    case "archived":
      return [
        [{ action: "unarchive", enabled: true }],
        [{ action: "anonymize", enabled: true }],
      ];
    case "anonymized":
      return [];
  }
}

/** S7.3b-2 D2: the server answers 404 on analytics for archived and anonymized customers. */
export const ficheTabsHiddenUnlessActive = ["analyse"] as const;
/** S7.3b-2 D6: health and progress data are erased by anonymization (S7.3 D2). */
export const ficheTabsErasedWhenAnonymized = [
  "progression",
  "documents",
  "sante",
] as const;
export type FicheTabVisibility = "visible" | "hidden" | "erased";

export function ficheTabVisibility(
  mode: SubjectMode,
  tab: string,
): FicheTabVisibility {
  if (
    mode !== "active" &&
    (ficheTabsHiddenUnlessActive as readonly string[]).includes(tab)
  )
    return "hidden";
  if (
    mode === "anonymized" &&
    (ficheTabsErasedWhenAnonymized as readonly string[]).includes(tab)
  )
    return "erased";
  return "visible";
}
/** S7.3b-2 D2: every write control of a frozen fiche is disabled; reads and navigation stay. */
export const ficheReadOnly = (mode: SubjectMode) => mode !== "active";
