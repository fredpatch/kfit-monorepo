import type { OnboardingDetail, OnboardingOwner, OnboardingState } from "@kfit/shared";

export type OnboardingCommand =
  | { action: "read" | "initialize" | "ready" }
  | { action: "complete"; itemId: string }
  | { action: "waive"; itemId: string; reason: string }
  | { action: "reserve"; until: Date };
export type OnboardingFailure = "not_found" | "invalid_state" | "item_not_found" | "item_forbidden" | "item_resolved"
  | "reason_required" | "blocked" | "start_date_required" | "policy_invalid" | "capacity_required" | "capacity_exhausted" | "capacity_invalid";
export type OnboardingResult = { status: "ok"; onboarding: OnboardingDetail } | { status: OnboardingFailure | "invalid" };
export type OnboardingActor = { userId: string; requestId: string; ipAddress: string | null; userAgent: string | null };
export interface OnboardingRepository {
  execute(subscriptionId: string, command: OnboardingCommand, actor: OnboardingActor): Promise<OnboardingResult>;
}

export function itemPermissions(itemType: string): { owner: OnboardingOwner; canComplete: boolean; canWaive: boolean } {
  switch (itemType) {
    case "start_date_confirmed": return { owner: "system", canComplete: false, canWaive: false };
    case "service_terms": return { owner: "consent", canComplete: false, canWaive: false };
    case "questionnaire": return { owner: "questionnaire", canComplete: false, canWaive: true };
    case "payment_condition": return { owner: "coach", canComplete: true, canWaive: true };
    case "medical_clearance": return { owner: "medical", canComplete: false, canWaive: false };
    default: return { owner: "external", canComplete: false, canWaive: false };
  }
}

export function checklistDefinition(questionnaireRequired: boolean) {
  const items = [
    { itemType: "start_date_confirmed", label: "Date de début confirmée", status: "completed" },
    { itemType: "service_terms", label: "Conditions du service acceptées", status: "pending" },
    { itemType: "payment_condition", label: "Condition de paiement confirmée", status: "pending" },
  ];
  if (questionnaireRequired) items.push({ itemType: "questionnaire", label: "Questionnaire complété", status: "pending" });
  return items;
}

export function resolveEffectivePolicy(rows: Array<{ variantId: string | null; questionnaireTemplateId: string | null; medicalClearancePolicy: string | null }>, variantId: string | null):
  | { status: "ok"; source: "variant" | "service" | "none"; questionnaireRequired: boolean }
  | { status: "policy_invalid" } {
  const serviceRows = rows.filter(row => row.variantId === null);
  const variantRows = variantId ? rows.filter(row => row.variantId === variantId) : [];
  if (serviceRows.length > 1 || variantRows.length > 1) return { status: "policy_invalid" };
  const service = serviceRows[0];
  const variant = variantRows[0];
  const effectiveQuestionnaireTemplateId = variant?.questionnaireTemplateId ?? service?.questionnaireTemplateId ?? null;
  const effectiveMedicalClearancePolicy = variant?.medicalClearancePolicy ?? service?.medicalClearancePolicy ?? null;
  if (effectiveMedicalClearancePolicy && !["not_required", "required_if_risk_flag"].includes(effectiveMedicalClearancePolicy)) return { status: "policy_invalid" };
  return {
    status: "ok",
    source: variant ? "variant" : service ? "service" : "none",
    questionnaireRequired: !!effectiveQuestionnaireTemplateId,
  };
}

export function resolveCapacity(mode: string, serviceLimit: number | null, variantLimit: number | null):
  | { status: "ok"; mode: "limited" | "unlimited"; limit: number | null; scope: "service" | "variant" }
  | { status: "capacity_invalid" } {
  if (mode === "unlimited") return { status: "ok", mode, limit: null, scope: "service" };
  const limit = variantLimit ?? serviceLimit;
  if (mode !== "limited" || limit === null || !Number.isInteger(limit) || limit <= 0) return { status: "capacity_invalid" };
  return { status: "ok", mode, limit, scope: variantLimit !== null ? "variant" : "service" };
}

type ItemState = { itemType: string; status: string; isBlocking: boolean; waiverReason: string | null; waivedAt: Date | null };
export function deriveOnboarding(input: {
  status: string; plannedStartDate: Date | null; until: Date | null; limited: boolean; capacityAvailable: boolean;
  items: ItemState[]; questionnaireRequired: boolean; now: Date;
}): { initialized: boolean; state: OnboardingState; holdValid: boolean; expired: boolean; canReady: boolean } {
  const { items } = input;
  const initialized = checklistDefinition(input.questionnaireRequired).every(required => items.some(item => item.itemType === required.itemType && item.isBlocking));
  const preStart = ["onboarding", "ready_to_start", "awaiting_payment", "medical_clearance_required"].includes(input.status);
  const expired = input.limited && input.until !== null && input.until.getTime() <= input.now.getTime() && preStart;
  const holdValid = !input.limited || (input.until !== null && input.until.getTime() > input.now.getTime());
  const satisfied = items.every(item => !item.isBlocking || item.status === "completed"
    || (item.status === "waived" && itemPermissions(item.itemType).canWaive && !!item.waiverReason?.trim() && item.waivedAt !== null));
  const ready = initialized && satisfied && input.plannedStartDate !== null && holdValid && input.capacityAvailable;
  return { initialized, state: expired ? "stalled" : ready ? "ready" : "blocked", holdValid, expired, canReady: input.status === "onboarding" && ready };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class OnboardingService {
  constructor(private readonly repository: OnboardingRepository) {}

  async execute(subscriptionId: string, action: OnboardingCommand["action"], body: unknown, itemId: string | undefined, actor: OnboardingActor): Promise<OnboardingResult> {
    if (!uuid.test(subscriptionId) || ((action === "complete" || action === "waive") && (!itemId || !uuid.test(itemId)))) return { status: "invalid" };
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: "invalid" };
    const input = body as Record<string, unknown>;
    const allowed = action === "waive" ? "reason" : action === "reserve" ? "capacityReservedUntil" : null;
    if (Object.keys(input).some(key => key !== allowed)) return { status: "invalid" };
    let command: OnboardingCommand;
    if (action === "waive") {
      if (typeof input.reason !== "string" || input.reason.trim() === "") return { status: "reason_required" };
      if (input.reason.trim().length > 2000) return { status: "invalid" };
      command = { action, itemId: itemId!, reason: input.reason.trim() };
    } else if (action === "reserve") {
      const value = input.capacityReservedUntil;
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return { status: "invalid" };
      const until = new Date(value);
      const day = new Date(value.slice(0, 10));
      if (!Number.isFinite(until.getTime()) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value.slice(0, 10)) return { status: "invalid" };
      command = { action, until };
    } else if (action === "complete") command = { action, itemId: itemId! };
    else command = { action };
    return this.repository.execute(subscriptionId, command, actor);
  }
}
