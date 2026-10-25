import {
  catalogueComponentTypes,
  catalogueConsumptionPolicies,
  catalogueMedicalClearancePolicies,
  catalogueRuleLimits,
  type CatalogueAvailabilityStatus,
  type CatalogueComponentInput,
  type CatalogueComponentType,
  type CatalogueConsumptionPolicy,
  type CatalogueDeliverabilityFailure,
  type CatalogueDeliveryType,
  type CatalogueDurationUnit,
  type CatalogueMedicalClearancePolicy,
  type CataloguePricingMode,
  type CatalogueRulesInput,
  type CatalogueVariantInput,
} from "@kfit/shared";
import { resolveDuration } from "../../subscriptions/services/subscription-lifecycle.policy.js";

/* CAT-03 (REG-F2, Fred 2026-10-25). Pure input normalization and the D6 deliverability rule. */

type Invalid = { invalid: string };
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A variant is archived through its own route, never by a status edit. */
const variantStatuses: readonly CatalogueAvailabilityStatus[] = ["open", "temporarily_closed", "waitlist_only"];
const durationUnits: readonly CatalogueDurationUnit[] = ["day", "week", "month"];
const variantFields = ["name", "slug", "priceXaf", "durationValue", "durationUnit", "capacityLimit", "availabilityStatus", "sortOrder"] as const;
const componentFields = ["variantId", "componentType", "label", "quantity", "isMandatory", "consumptionPolicy"] as const;
const rulesFields = ["followUpFrequencyDays", "lateCancelNoticeHours", "lateCancelConsumesComponent", "missedConsumesComponent", "medicalClearancePolicy"] as const;

export type CatalogueVariantWrite = {
  name: string; slug: string; priceXaf: number | null; durationValue: number | null; durationUnit: CatalogueDurationUnit | null;
  capacityLimit: number | null; availabilityStatus: CatalogueAvailabilityStatus; sortOrder: number;
};
export type CatalogueComponentWrite = {
  variantId: string | null; componentType: CatalogueComponentType; label: string; quantity: number; isMandatory: boolean; consumptionPolicy: CatalogueConsumptionPolicy;
};
export type CatalogueComponentPatch = Partial<Omit<CatalogueComponentWrite, "variantId">>;
export type CatalogueRulesWrite = {
  followUpFrequencyDays: number | null; lateCancelNoticeHours: number | null; lateCancelConsumesComponent: boolean;
  missedConsumesComponent: boolean; medicalClearancePolicy: CatalogueMedicalClearancePolicy | null;
};
export type RulesScope = "service" | "variant";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const has = (input: object, key: string) => Object.prototype.hasOwnProperty.call(input, key);
const unknownKey = (input: object, allowed: readonly string[]) => Object.keys(input).some((key) => !allowed.includes(key));
const isInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | null => typeof value === "string" && allowed.includes(value as T) ? value as T : null;
const nullableInteger = (value: unknown, valid: (n: number) => boolean): number | null | undefined =>
  value === null ? null : isInteger(value) && valid(value) ? value : undefined;
export const isMedicalClearancePolicy = (value: unknown): value is CatalogueMedicalClearancePolicy => oneOf(value, catalogueMedicalClearancePolicies) !== null;

/** Create: name and slug required. Patch: any subset. Duration value and unit are checked as a pair on the merged state. */
export function normalizeVariantInput(body: unknown, mode: "create" | "update"): CatalogueVariantWrite | Partial<CatalogueVariantWrite> | Invalid {
  if (!isRecord(body) || unknownKey(body, variantFields)) return { invalid: "unknown_field" };
  const input = body as CatalogueVariantInput;
  const out: Partial<CatalogueVariantWrite> = {};
  if (mode === "create" || has(input, "name")) {
    if (typeof input.name !== "string" || !input.name.trim()) return { invalid: "name_invalid" };
    out.name = input.name.trim();
  }
  if (mode === "create" || has(input, "slug")) {
    if (typeof input.slug !== "string" || !slugPattern.test(input.slug)) return { invalid: "slug_invalid" };
    out.slug = input.slug;
  }
  if (has(input, "priceXaf")) {
    const price = nullableInteger(input.priceXaf, (n) => n >= 0);
    if (price === undefined) return { invalid: "price_invalid" };
    out.priceXaf = price;
  }
  if (has(input, "durationValue")) {
    const value = nullableInteger(input.durationValue, (n) => n > 0);
    if (value === undefined) return { invalid: "duration_invalid" };
    out.durationValue = value;
  }
  if (has(input, "durationUnit")) {
    const unit = input.durationUnit === null ? null : oneOf(input.durationUnit, durationUnits);
    if (unit === null && input.durationUnit !== null) return { invalid: "duration_unit_invalid" };
    out.durationUnit = unit;
  }
  if (has(input, "capacityLimit")) {
    const limit = nullableInteger(input.capacityLimit, (n) => n > 0);
    if (limit === undefined) return { invalid: "capacity_limit_invalid" };
    out.capacityLimit = limit;
  }
  if (has(input, "availabilityStatus")) {
    const status = oneOf(input.availabilityStatus, variantStatuses);
    if (!status) return { invalid: "availability_invalid" };
    out.availabilityStatus = status;
  }
  if (has(input, "sortOrder")) {
    if (!isInteger(input.sortOrder) || input.sortOrder < 0) return { invalid: "sort_order_invalid" };
    out.sortOrder = input.sortOrder;
  }
  if (mode === "update") return Object.keys(out).length ? out : { invalid: "empty_patch" };
  const created: CatalogueVariantWrite = { name: out.name!, slug: out.slug!, priceXaf: out.priceXaf ?? null, durationValue: out.durationValue ?? null,
    durationUnit: out.durationUnit ?? null, capacityLimit: out.capacityLimit ?? null, availabilityStatus: out.availabilityStatus ?? "open", sortOrder: out.sortOrder ?? 0 };
  const invalid = variantStateInvalid(created);
  return invalid ? { invalid } : created;
}

/** Checked on the merged row: a duration is a value and a unit together, or neither. */
export function variantStateInvalid(variant: Pick<CatalogueVariantWrite, "durationValue" | "durationUnit">): string | null {
  return (variant.durationValue === null) !== (variant.durationUnit === null) ? "duration_pair_invalid" : null;
}

export function normalizeComponentInput(body: unknown, mode: "create" | "update"): CatalogueComponentWrite | CatalogueComponentPatch | Invalid {
  if (!isRecord(body) || unknownKey(body, componentFields)) return { invalid: "unknown_field" };
  const input = body as CatalogueComponentInput;
  if (mode === "update" && has(input, "variantId")) return { invalid: "scope_not_editable" };
  const out: Partial<CatalogueComponentWrite> = {};
  if (mode === "create") {
    if (input.variantId !== undefined && input.variantId !== null && (typeof input.variantId !== "string" || !uuidPattern.test(input.variantId))) return { invalid: "variant_id_invalid" };
    out.variantId = typeof input.variantId === "string" ? input.variantId : null;
  }
  if (mode === "create" || has(input, "componentType")) {
    const type = oneOf(input.componentType, catalogueComponentTypes);
    if (!type) return { invalid: "component_type_invalid" };
    out.componentType = type;
  }
  if (mode === "create" || has(input, "label")) {
    if (typeof input.label !== "string" || !input.label.trim()) return { invalid: "label_invalid" };
    out.label = input.label.trim();
  }
  if (mode === "create" || has(input, "quantity")) {
    if (!isInteger(input.quantity) || input.quantity <= 0) return { invalid: "quantity_invalid" };
    out.quantity = input.quantity;
  }
  if (has(input, "isMandatory")) {
    if (typeof input.isMandatory !== "boolean") return { invalid: "is_mandatory_invalid" };
    out.isMandatory = input.isMandatory;
  }
  if (has(input, "consumptionPolicy")) {
    const policy = oneOf(input.consumptionPolicy, catalogueConsumptionPolicies);
    if (!policy) return { invalid: "consumption_policy_invalid" };
    out.consumptionPolicy = policy;
  }
  if (mode === "update") return Object.keys(out).length ? out : { invalid: "empty_patch" };
  return { variantId: out.variantId ?? null, componentType: out.componentType!, label: out.label!, quantity: out.quantity!,
    isMandatory: out.isMandatory ?? true, consumptionPolicy: out.consumptionPolicy ?? "manual" };
}

/**
 * PUT replaces the five editable rules; questionnaireTemplateId is never part of it (D3).
 * The offer-level medical policy must be explicit (D6); on a variant, null means « same as the offer ».
 */
export function normalizeRulesInput(body: unknown, scope: RulesScope): CatalogueRulesWrite | Invalid {
  if (!isRecord(body) || unknownKey(body, rulesFields)) return { invalid: "unknown_field" };
  const input = body as CatalogueRulesInput;
  if (rulesFields.some((field) => !has(input, field))) return { invalid: "rules_incomplete" };
  const { followUpFrequencyDays: cadence, lateCancelNoticeHours: notice } = catalogueRuleLimits;
  const followUpFrequencyDays = nullableInteger(input.followUpFrequencyDays, (n) => n >= cadence.min && n <= cadence.max);
  if (followUpFrequencyDays === undefined) return { invalid: "follow_up_frequency_invalid" };
  const lateCancelNoticeHours = nullableInteger(input.lateCancelNoticeHours, (n) => n >= notice.min && n <= notice.max);
  if (lateCancelNoticeHours === undefined) return { invalid: "late_cancel_notice_invalid" };
  if (typeof input.lateCancelConsumesComponent !== "boolean" || typeof input.missedConsumesComponent !== "boolean") return { invalid: "consumption_flag_invalid" };
  const medical = input.medicalClearancePolicy;
  if (medical === null ? scope === "service" : !isMedicalClearancePolicy(medical)) return { invalid: "medical_policy_invalid" };
  return { followUpFrequencyDays, lateCancelNoticeHours, lateCancelConsumesComponent: input.lateCancelConsumesComponent,
    missedConsumesComponent: input.missedConsumesComponent, medicalClearancePolicy: medical as CatalogueMedicalClearancePolicy | null };
}

export type DeliverabilityInput = {
  service: { pricingMode: CataloguePricingMode | string; basePriceXaf: number | null; deliveryType: CatalogueDeliveryType | string; defaultDurationValue: number | null; defaultDurationUnit: string | null };
  /** Active variants only (not archived by either marker). */
  variants: Array<{ id: string; priceXaf: number | null; durationValue: number | null; durationUnit: string | null }>;
  /** Non-archived components only. */
  components: Array<{ variantId: string | null }>;
  /** The service-level rules row, or null when absent. */
  serviceRules: { medicalClearancePolicy: string | null } | null;
};

/** D6: what must hold before an offer can be sold. Each failure names the rule and, when relevant, the variant. */
export function evaluateDeliverability(input: DeliverabilityInput): CatalogueDeliverabilityFailure[] {
  const failures: CatalogueDeliverabilityFailure[] = [];
  const serviceLevel = input.components.some((c) => c.variantId === null);
  if (input.variants.length === 0 && !serviceLevel) failures.push({ rule: "service_component_missing", variantId: null });
  for (const variant of input.variants) {
    if (!serviceLevel && !input.components.some((c) => c.variantId === variant.id)) failures.push({ rule: "variant_component_missing", variantId: variant.id });
  }
  if (!input.serviceRules) failures.push({ rule: "service_rules_missing", variantId: null });
  else if (!isMedicalClearancePolicy(input.serviceRules.medicalClearancePolicy)) failures.push({ rule: "medical_policy_missing", variantId: null });
  if (input.service.pricingMode === "fixed" && input.service.basePriceXaf === null) {
    if (input.variants.length === 0) failures.push({ rule: "price_missing", variantId: null });
    for (const variant of input.variants) if (variant.priceXaf === null) failures.push({ rule: "price_missing", variantId: variant.id });
  }
  if (input.service.deliveryType === "time_based") {
    const fallback = { value: input.service.defaultDurationValue, unit: input.service.defaultDurationUnit };
    const resolves = (variant: { value: number | null; unit: string | null } | null) => resolveDuration(variant, fallback)?.value != null;
    if (input.variants.length === 0 && !resolves(null)) failures.push({ rule: "duration_missing", variantId: null });
    for (const variant of input.variants) if (!resolves({ value: variant.durationValue, unit: variant.durationUnit })) failures.push({ rule: "duration_missing", variantId: variant.id });
  }
  return failures;
}
