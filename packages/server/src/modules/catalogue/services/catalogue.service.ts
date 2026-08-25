import type {
  CatalogueAvailabilityStatus,
  CatalogueCapacityMode,
  CatalogueDeliveryType,
  CatalogueDurationUnit,
  CataloguePricingMode,
  CataloguePublicService,
  CataloguePublicServicesResponse,
  CatalogueServiceComponent,
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

export type CatalogueSnapshot = {
  services: CatalogueServiceRecord[];
  variants: CatalogueServiceVariantRecord[];
  components: CatalogueServiceComponentRecord[];
  policies: CatalogueServicePolicyRecord[];
};

export type CatalogueRepository = {
  listPublicServices(): Promise<CatalogueSnapshot>;
};

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
}
