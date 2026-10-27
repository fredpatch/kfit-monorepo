/**
 * Offer families and their fixed colours (board 01b).
 * Order is fixed; colours were validated for colour-blind separation and ≥ 3:1 contrast.
 * Colour follows the family, never its rank in a list or chart.
 *
 * The service has no family field yet (backlog: « Famille d'offre sur le service »).
 * Until then, familyOfSlug() is a fallback based on slug keywords.
 */
export const offerFamilies = [
  "transpitime",
  "nutrition",
  "pilates",
  "pack",
] as const;
export type OfferFamily = (typeof offerFamilies)[number];

export const familyMeta: Record<
  OfferFamily | "unknown",
  { label: string; colorVar: string; softClass: string; dotClass: string }
> = {
  transpitime: {
    label: "Transpitime",
    colorVar: "var(--family-transpitime)",
    softClass: "bg-info-soft",
    dotClass: "bg-family-transpitime",
  },
  nutrition: {
    label: "Nutrition",
    colorVar: "var(--family-nutrition)",
    softClass: "bg-success-soft",
    dotClass: "bg-family-nutrition",
  },
  pilates: {
    label: "Pilates",
    colorVar: "var(--family-pilates)",
    softClass: "bg-waitlist-soft",
    dotClass: "bg-family-pilates",
  },
  pack: {
    label: "Packs premium",
    colorVar: "var(--family-pack)",
    softClass: "bg-warning-soft",
    dotClass: "bg-family-pack",
  },
  unknown: {
    label: "Autre",
    colorVar: "var(--family-unknown)",
    softClass: "bg-muted",
    dotClass: "bg-family-unknown",
  },
};

const slugHints: Array<[OfferFamily, RegExp]> = [
  ["pack", /pack|premium-\d|formule-complete/],
  ["pilates", /pilates/],
  ["nutrition", /nutrition|bilan|reequilibrage/],
  ["transpitime", /transpitime|sport|programme|live/],
];

/** Temporary slug-based guess. Replace with service.family once the API exposes it. */
export function familyOfSlug(
  slug: string | null | undefined,
): OfferFamily | "unknown" {
  if (!slug) return "unknown";
  const value = slug.toLowerCase();
  for (const [family, pattern] of slugHints)
    if (pattern.test(value)) return family;
  return "unknown";
}
