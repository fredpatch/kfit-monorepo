import type {
  CatalogueAdminServiceOverview,
  CatalogueComponentType,
  CatalogueDeliverabilityRule,
  CatalogueDurationUnit,
  CatalogueMedicalClearancePolicy,
} from "@kfit/shared";

/* CAT-03b labels for the closed server vocabularies. */
export const componentTypeLabels: Record<CatalogueComponentType, string> = {
  appointment: "Séance",
  follow_up: "Suivi",
  program: "Programme",
};
export const medicalPolicyLabels: Record<
  CatalogueMedicalClearancePolicy,
  string
> = {
  not_required: "Non requis",
  required_if_risk_flag: "Requis en cas de risque",
  required: "Toujours requis",
};
/** « Avant publication » (D6): what each failed rule asks the coach to do. */
export const deliverabilityLabels: Record<CatalogueDeliverabilityRule, string> =
  {
    service_component_missing:
      "Ajoute au moins une prestation incluse dans l'offre (onglet Contenu).",
    variant_component_missing:
      "Ajoute au moins une prestation à cette variante, ou une prestation commune à l'offre.",
    service_rules_missing: "Enregistre les règles de l'offre (onglet Règles).",
    medical_policy_missing:
      "Choisis la politique d'avis médical de l'offre (onglet Règles).",
    price_missing:
      "Indique un prix : prix de base de l'offre ou prix de cette variante.",
    duration_missing:
      "Indique une durée : durée par défaut de l'offre ou durée de cette variante.",
  };
import { moneyXaf } from "../../lib/format.js";

export const catalogueTabs = ["published", "drafts", "archived"] as const;
export type CatalogueTab = (typeof catalogueTabs)[number];
export const catalogueTabLabels: Record<CatalogueTab, string> = {
  published: "Publiées",
  drafts: "Brouillons",
  archived: "Archivées",
};

export const isArchived = (
  s: Pick<CatalogueAdminServiceOverview, "archivedAt" | "availabilityStatus">,
) => s.archivedAt !== null || s.availabilityStatus === "archived";
export function tabOf(s: CatalogueAdminServiceOverview): CatalogueTab {
  if (isArchived(s)) return "archived";
  return s.publishedAt ? "published" : "drafts";
}

const units: Record<CatalogueDurationUnit, [string, string]> = {
  day: ["jour", "jours"],
  week: ["semaine", "semaines"],
  month: ["mois", "mois"],
};
export function durationText(
  value: number | null,
  unit: CatalogueDurationUnit | null,
): string | null {
  if (value === null || unit === null) return null;
  const [one, many] = units[unit];
  return `${value} ${value > 1 ? many : one}`;
}

export function priceText(s: CatalogueAdminServiceOverview): string {
  if (s.pricingMode === "quote") return "Sur devis";
  if (s.minPriceXaf === null) return "-";
  const multiple =
    s.variants.some(
      (v) => v.priceXaf !== null && v.priceXaf !== s.minPriceXaf,
    ) ||
    (s.basePriceXaf !== null && s.basePriceXaf !== s.minPriceXaf);
  return `${multiple ? "dès " : ""}${moneyXaf(s.minPriceXaf)}`;
}

export function metaText(s: CatalogueAdminServiceOverview): string {
  const parts = [
    s.variants.length
      ? `${s.variants.length} variante${s.variants.length > 1 ? "s" : ""}`
      : null,
    durationText(s.defaultDurationValue, s.defaultDurationUnit),
    s.deliveryType === "one_time" ? "prestation ponctuelle" : null,
  ].filter(Boolean);
  return parts.join(" · ") || `/${s.slug}`;
}

/** Capacity summary (board 06). Occupancy follows the S4 claim rule (server). */
export function capacitySummary(s: CatalogueAdminServiceOverview): {
  text: string;
  ratio: number | null;
  tone: "full" | "high" | "normal" | "none";
} {
  const occupied = s.occupancy.occupied;
  if (s.capacityMode !== "limited" || s.capacityLimit === null)
    return {
      text: `Illimitée · ${occupied} en cours`,
      ratio: null,
      tone: "none",
    };
  const ratio = occupied / s.capacityLimit;
  if (occupied >= s.capacityLimit)
    return {
      text: `Complète · ${occupied} / ${s.capacityLimit}`,
      ratio: Math.min(1, ratio),
      tone: "full",
    };
  return {
    text: `${occupied} / ${s.capacityLimit} places`,
    ratio,
    tone: ratio >= 0.75 ? "high" : "normal",
  };
}

/** "depuis 9 jours" for the oldest waitlist entry. */
export function sinceDays(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const days = Math.max(
    0,
    Math.floor((now - new Date(iso).getTime()) / 86_400_000),
  );
  return days === 0
    ? "depuis aujourd'hui"
    : `depuis ${days} jour${days > 1 ? "s" : ""}`;
}

/** URL-safe slug suggestion from a name (same pattern as the server: a-z, 0-9, dashes). */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
