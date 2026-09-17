import type {
  CatalogueAdminService,
  CatalogueAdminServiceResponse,
  CatalogueAdminServicesResponse,
  CatalogueAvailabilityStatus,
  CatalogueCapacityMode,
  CatalogueDeliveryType,
  CatalogueDurationUnit,
  CataloguePricingMode,
  CataloguePublicService,
  CataloguePublicServicesResponse,
  CatalogueServiceComponent,
  CatalogueServiceMutationInput,
  CatalogueServiceOrderInput,
  CatalogueServicePolicy,
  CatalogueServiceVariant,
} from "@kfit/shared";

export type CatalogueServiceComponentRecord = CatalogueServiceComponent & {
  serviceId: string;
  sortOrder?: number;
};

export type CatalogueServicePolicyRecord = CatalogueServicePolicy & {
  serviceId: string;
  variantId: string | null;
};

export type CatalogueServiceVariantRecord = {
  id: string;
  serviceId: string;
  name: string;
  slug: string;
  priceXaf: number | null;
  durationValue: number | null;
  durationUnit: CatalogueDurationUnit | null;
  capacityLimit: number | null;
  availabilityStatus: CatalogueAvailabilityStatus;
  sortOrder: number;
};

export type CatalogueServiceRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  pricingMode: CataloguePricingMode;
  basePriceXaf: number | null;
  deliveryType: CatalogueDeliveryType;
  defaultDurationValue: number | null;
  defaultDurationUnit: CatalogueDurationUnit | null;
  availabilityStatus: CatalogueAvailabilityStatus;
  capacityMode: CatalogueCapacityMode;
  capacityLimit: number | null;
  waitlistEnabled: boolean;
  sortOrder: number;
  publishedAt: Date;
};

export type CatalogueAdminServiceRecord = Omit<CatalogueServiceRecord, "publishedAt"> & {
  isPublic: boolean;
  publishedAt: Date | null;
  archivedAt: Date | null;
  updatedAt: Date;
};

export type CatalogueSnapshot = {
  services: CatalogueServiceRecord[];
  variants: CatalogueServiceVariantRecord[];
  components: CatalogueServiceComponentRecord[];
  policies: CatalogueServicePolicyRecord[];
};

export type CatalogueServiceWriteInput = {
  name: string;
  slug: string;
  description: string | null;
  pricingMode: CataloguePricingMode;
  basePriceXaf: number | null;
  deliveryType: CatalogueDeliveryType;
  defaultDurationValue: number | null;
  defaultDurationUnit: CatalogueDurationUnit | null;
  availabilityStatus: CatalogueAvailabilityStatus;
  capacityMode: CatalogueCapacityMode;
  capacityLimit: number | null;
  waitlistEnabled: boolean;
  isPublic: boolean;
  sortOrder: number;
};

export type CatalogueServicePatchInput = Partial<CatalogueServiceWriteInput>;

export type CatalogueRepository = {
  listPublicServices(): Promise<CatalogueSnapshot>;
  listAdminServices(): Promise<CatalogueAdminServiceRecord[]>;
  createService(input: CatalogueServiceWriteInput): Promise<CatalogueAdminServiceRecord | "slug_conflict">;
  updateService(serviceId: string, input: CatalogueServicePatchInput): Promise<CatalogueAdminServiceRecord | "not_found" | "slug_conflict">;
  publishService(serviceId: string, now: Date): Promise<CatalogueAdminServiceRecord | "not_found" | "archived">;
  archiveService(serviceId: string, now: Date): Promise<CatalogueAdminServiceRecord | "not_found">;
  reorderServices(items: Array<{ serviceId: string; sortOrder: number }>): Promise<CatalogueAdminServiceRecord[] | "not_found">;
};

type MutationResult =
  | { status: "ok"; response: CatalogueAdminServiceResponse }
  | { status: "invalid"; reason: string }
  | { status: "not_found" }
  | { status: "slug_conflict" }
  | { status: "archived" }
  | { status: "publish_invalid"; reason: string };

const availabilityStatuses: readonly CatalogueAvailabilityStatus[] = ["open", "temporarily_closed", "waitlist_only", "archived"];
const pricingModes: readonly CataloguePricingMode[] = ["fixed", "quote"];
const deliveryTypes: readonly CatalogueDeliveryType[] = ["one_time", "time_based"];
const durationUnits: readonly CatalogueDurationUnit[] = ["day", "week", "month"];
const capacityModes: readonly CatalogueCapacityMode[] = ["unlimited", "limited"];
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function bySortThenName<T extends { sortOrder: number; name: string }>(left: T, right: T): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "fr");
}

function byComponentLabel(left: CatalogueServiceComponentRecord, right: CatalogueServiceComponentRecord): number {
  return (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.label.localeCompare(right.label, "fr");
}

function toPolicy(policy: CatalogueServicePolicyRecord | undefined): CatalogueServicePolicy | null {
  if (!policy) return null;
  return {
    followUpFrequencyDays: policy.followUpFrequencyDays,
    lateCancelNoticeHours: policy.lateCancelNoticeHours,
    lateCancelConsumesComponent: policy.lateCancelConsumesComponent,
    missedConsumesComponent: policy.missedConsumesComponent,
    medicalClearancePolicy: policy.medicalClearancePolicy,
  };
}

function toComponent(component: CatalogueServiceComponentRecord): CatalogueServiceComponent {
  return {
    id: component.id,
    variantId: component.variantId,
    componentType: component.componentType,
    label: component.label,
    quantity: component.quantity,
    isMandatory: component.isMandatory,
    consumptionPolicy: component.consumptionPolicy,
  };
}

function toAdminService(service: CatalogueAdminServiceRecord): CatalogueAdminService {
  return {
    id: service.id,
    name: service.name,
    slug: service.slug,
    description: service.description,
    pricingMode: service.pricingMode,
    basePriceXaf: service.basePriceXaf,
    deliveryType: service.deliveryType,
    defaultDurationValue: service.defaultDurationValue,
    defaultDurationUnit: service.defaultDurationUnit,
    availabilityStatus: service.availabilityStatus,
    capacityMode: service.capacityMode,
    capacityLimit: service.capacityLimit,
    waitlistEnabled: service.waitlistEnabled,
    isPublic: service.isPublic,
    sortOrder: service.sortOrder,
    publishedAt: service.publishedAt?.toISOString() ?? null,
    archivedAt: service.archivedAt?.toISOString() ?? null,
    updatedAt: service.updatedAt.toISOString(),
  };
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : null;
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function optionalInteger(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isInteger(value)) return undefined;
  return value;
}

function normalizeServiceInput(input: CatalogueServiceMutationInput, mode: "create" | "update"): CatalogueServiceWriteInput | CatalogueServicePatchInput | { invalid: string } {
  const output: CatalogueServicePatchInput = {};

  if (mode === "create" && (typeof input.name !== "string" || input.name.trim() === "")) return { invalid: "name_required" };
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim() === "") return { invalid: "name_invalid" };
    output.name = input.name.trim();
  }

  if (mode === "create" && (typeof input.slug !== "string" || !slugPattern.test(input.slug))) return { invalid: "slug_invalid" };
  if (input.slug !== undefined) {
    if (typeof input.slug !== "string" || !slugPattern.test(input.slug)) return { invalid: "slug_invalid" };
    output.slug = input.slug;
  }

  const description = optionalString(input.description);
  if (description !== undefined) output.description = description;

  if (mode === "create" && !enumValue(input.pricingMode, pricingModes)) return { invalid: "pricing_mode_invalid" };
  if (input.pricingMode !== undefined) {
    const pricingMode = enumValue(input.pricingMode, pricingModes);
    if (!pricingMode) return { invalid: "pricing_mode_invalid" };
    output.pricingMode = pricingMode;
  }

  const basePriceXaf = optionalInteger(input.basePriceXaf);
  if (basePriceXaf !== undefined) {
    if (basePriceXaf !== null && basePriceXaf < 0) return { invalid: "base_price_invalid" };
    output.basePriceXaf = basePriceXaf;
  }

  if (mode === "create" && !enumValue(input.deliveryType, deliveryTypes)) return { invalid: "delivery_type_invalid" };
  if (input.deliveryType !== undefined) {
    const deliveryType = enumValue(input.deliveryType, deliveryTypes);
    if (!deliveryType) return { invalid: "delivery_type_invalid" };
    output.deliveryType = deliveryType;
  }

  const defaultDurationValue = optionalInteger(input.defaultDurationValue);
  if (defaultDurationValue !== undefined) {
    if (defaultDurationValue !== null && defaultDurationValue <= 0) return { invalid: "duration_invalid" };
    output.defaultDurationValue = defaultDurationValue;
  }

  if (input.defaultDurationUnit !== undefined) {
    if (input.defaultDurationUnit === null) output.defaultDurationUnit = null;
    else {
      const durationUnit = enumValue(input.defaultDurationUnit, durationUnits);
      if (!durationUnit) return { invalid: "duration_unit_invalid" };
      output.defaultDurationUnit = durationUnit;
    }
  }

  if (input.availabilityStatus !== undefined) {
    const availabilityStatus = enumValue(input.availabilityStatus, availabilityStatuses);
    if (!availabilityStatus) return { invalid: "availability_invalid" };
    output.availabilityStatus = availabilityStatus;
  }

  if (mode === "create" && !enumValue(input.capacityMode, capacityModes)) return { invalid: "capacity_mode_invalid" };
  if (input.capacityMode !== undefined) {
    const capacityMode = enumValue(input.capacityMode, capacityModes);
    if (!capacityMode) return { invalid: "capacity_mode_invalid" };
    output.capacityMode = capacityMode;
  }

  const capacityLimit = optionalInteger(input.capacityLimit);
  if (capacityLimit !== undefined) {
    if (capacityLimit !== null && capacityLimit <= 0) return { invalid: "capacity_limit_invalid" };
    output.capacityLimit = capacityLimit;
  }

  if (input.waitlistEnabled !== undefined) {
    if (typeof input.waitlistEnabled !== "boolean") return { invalid: "waitlist_invalid" };
    output.waitlistEnabled = input.waitlistEnabled;
  }

  if (input.isPublic !== undefined) {
    if (typeof input.isPublic !== "boolean") return { invalid: "is_public_invalid" };
    output.isPublic = input.isPublic;
  }

  const sortOrder = optionalInteger(input.sortOrder);
  if (sortOrder !== undefined) {
    if (sortOrder === null || sortOrder < 0) return { invalid: "sort_order_invalid" };
    output.sortOrder = sortOrder;
  }

  if (mode === "create") {
    return {
      name: output.name!,
      slug: output.slug!,
      description: output.description ?? null,
      pricingMode: output.pricingMode!,
      basePriceXaf: output.basePriceXaf ?? null,
      deliveryType: output.deliveryType!,
      defaultDurationValue: output.defaultDurationValue ?? null,
      defaultDurationUnit: output.defaultDurationUnit ?? null,
      availabilityStatus: output.availabilityStatus ?? "temporarily_closed",
      capacityMode: output.capacityMode!,
      capacityLimit: output.capacityLimit ?? null,
      waitlistEnabled: output.waitlistEnabled ?? false,
      isPublic: output.isPublic ?? false,
      sortOrder: output.sortOrder ?? 0,
    };
  }

  return output;
}

function validatePublishable(service: CatalogueAdminServiceRecord): string | null {
  if (service.archivedAt || service.availabilityStatus === "archived") return "archived";
  if (!service.name.trim()) return "name_required";
  if (!slugPattern.test(service.slug)) return "slug_invalid";
  if (service.pricingMode === "fixed" && service.basePriceXaf === null) return "fixed_price_required";
  if (service.capacityMode === "limited" && service.capacityLimit === null) return "capacity_limit_required";
  return null;
}

export class CatalogueService {
  constructor(private readonly repository: CatalogueRepository) {}

  async listPublicServices(): Promise<CataloguePublicServicesResponse> {
    const snapshot = await this.repository.listPublicServices();

    const variantsByService = new Map<string, CatalogueServiceVariantRecord[]>();
    for (const variant of snapshot.variants) {
      const variants = variantsByService.get(variant.serviceId) ?? [];
      variants.push(variant);
      variantsByService.set(variant.serviceId, variants);
    }

    const componentsByScope = new Map<string, CatalogueServiceComponentRecord[]>();
    for (const component of snapshot.components) {
      const key = `${component.serviceId}:${component.variantId ?? "service"}`;
      const components = componentsByScope.get(key) ?? [];
      components.push(component);
      componentsByScope.set(key, components);
    }

    const policyByScope = new Map<string, CatalogueServicePolicyRecord>();
    for (const policy of snapshot.policies) {
      policyByScope.set(`${policy.serviceId}:${policy.variantId ?? "service"}`, policy);
    }

    const services: CataloguePublicService[] = [...snapshot.services]
      .sort(bySortThenName)
      .map((service) => {
        const serviceComponents = [...(componentsByScope.get(`${service.id}:service`) ?? [])]
          .sort(byComponentLabel)
          .map(toComponent);

        const variants: CatalogueServiceVariant[] = [...(variantsByService.get(service.id) ?? [])]
          .sort(bySortThenName)
          .map((variant) => {
            const variantComponents = [...(componentsByScope.get(`${service.id}:${variant.id}`) ?? [])]
              .sort(byComponentLabel)
              .map(toComponent);

            return {
              id: variant.id,
              name: variant.name,
              slug: variant.slug,
              priceXaf: variant.priceXaf,
              durationValue: variant.durationValue,
              durationUnit: variant.durationUnit,
              capacityLimit: variant.capacityLimit,
              availabilityStatus: variant.availabilityStatus,
              components: variantComponents,
              policy: toPolicy(policyByScope.get(`${service.id}:${variant.id}`)),
            };
          });

        return {
          id: service.id,
          name: service.name,
          slug: service.slug,
          description: service.description,
          pricingMode: service.pricingMode,
          basePriceXaf: service.basePriceXaf,
          deliveryType: service.deliveryType,
          defaultDurationValue: service.defaultDurationValue,
          defaultDurationUnit: service.defaultDurationUnit,
          availabilityStatus: service.availabilityStatus,
          capacityMode: service.capacityMode,
          capacityLimit: service.capacityLimit,
          waitlistEnabled: service.waitlistEnabled,
          publishedAt: service.publishedAt.toISOString(),
          components: serviceComponents,
          policy: toPolicy(policyByScope.get(`${service.id}:service`)),
          variants,
        };
      });

    return { services };
  }

  async listAdminServices(): Promise<CatalogueAdminServicesResponse> {
    const services = await this.repository.listAdminServices();
    return { services: services.map(toAdminService) };
  }

  async createAdminService(input: CatalogueServiceMutationInput): Promise<MutationResult> {
    const normalized = normalizeServiceInput(input, "create");
    if ("invalid" in normalized) return { status: "invalid", reason: normalized.invalid };

    const created = await this.repository.createService(normalized);
    if (created === "slug_conflict") return { status: "slug_conflict" };
    return { status: "ok", response: { service: toAdminService(created) } };
  }

  async updateAdminService(serviceId: string, input: CatalogueServiceMutationInput): Promise<MutationResult> {
    const normalized = normalizeServiceInput(input, "update");
    if ("invalid" in normalized) return { status: "invalid", reason: normalized.invalid };

    const updated = await this.repository.updateService(serviceId, normalized);
    if (updated === "not_found") return { status: "not_found" };
    if (updated === "slug_conflict") return { status: "slug_conflict" };
    if (updated.archivedAt || updated.availabilityStatus === "archived") return { status: "archived" };
    return { status: "ok", response: { service: toAdminService(updated) } };
  }

  async publishAdminService(serviceId: string, now = new Date()): Promise<MutationResult> {
    const result = await this.repository.publishService(serviceId, now);
    if (result === "not_found") return { status: "not_found" };
    if (result === "archived") return { status: "archived" };
    const invalid = validatePublishable(result);
    if (invalid) return { status: "publish_invalid", reason: invalid };
    return { status: "ok", response: { service: toAdminService(result) } };
  }

  async archiveAdminService(serviceId: string, now = new Date()): Promise<MutationResult> {
    const result = await this.repository.archiveService(serviceId, now);
    if (result === "not_found") return { status: "not_found" };
    return { status: "ok", response: { service: toAdminService(result) } };
  }

  async reorderAdminServices(input: CatalogueServiceOrderInput): Promise<MutationResult | { status: "ok"; response: CatalogueAdminServicesResponse }> {
    if (!Array.isArray(input.items) || input.items.length === 0) {
      return { status: "invalid", reason: "items_required" };
    }

    const items: Array<{ serviceId: string; sortOrder: number }> = [];
    const seen = new Set<string>();
    for (const item of input.items) {
      if (typeof item !== "object" || item === null) return { status: "invalid", reason: "item_invalid" };
      const candidate = item as { serviceId?: unknown; sortOrder?: unknown };
      if (typeof candidate.serviceId !== "string" || candidate.serviceId.trim() === "") return { status: "invalid", reason: "service_id_invalid" };
      if (!Number.isInteger(candidate.sortOrder) || candidate.sortOrder < 0) return { status: "invalid", reason: "sort_order_invalid" };
      if (seen.has(candidate.serviceId)) return { status: "invalid", reason: "duplicate_service" };
      seen.add(candidate.serviceId);
      items.push({ serviceId: candidate.serviceId, sortOrder: candidate.sortOrder });
    }

    const reordered = await this.repository.reorderServices(items);
    if (reordered === "not_found") return { status: "not_found" };
    return { status: "ok", response: { services: reordered.map(toAdminService) } };
  }
}
