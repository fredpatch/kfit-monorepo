import type {
  CatalogueAdminComponentResponse,
  CatalogueAdminRulesResponse,
  CatalogueAdminVariantResponse,
  CatalogueDeliverabilityResponse,
  CatalogueRulesOverrideRemovedResponse,
} from "@kfit/shared";
import type {
  CatalogueContentActor,
  CatalogueContentError,
  CatalogueContentResult,
  DrizzleCatalogueContentRepository,
} from "../repositories/catalogue-content.repository.js";
import {
  normalizeComponentInput,
  normalizeRulesInput,
  normalizeVariantInput,
  type CatalogueComponentPatch,
  type CatalogueComponentWrite,
  type CatalogueVariantWrite,
} from "./catalogue-content.policy.js";

export type CatalogueContentAction =
  | "variant_create"
  | "variant_update"
  | "variant_archive"
  | "component_create"
  | "component_update"
  | "component_archive"
  | "rules_put"
  | "variant_rules_put"
  | "variant_rules_delete"
  | "deliverability";
export type CatalogueContentParams = {
  serviceId: string;
  variantId?: string;
  componentId?: string;
};
export type CatalogueContentBody =
  | CatalogueAdminVariantResponse
  | CatalogueAdminComponentResponse
  | CatalogueAdminRulesResponse
  | CatalogueRulesOverrideRemovedResponse
  | CatalogueDeliverabilityResponse;
export type CatalogueContentRepository = Pick<
  DrizzleCatalogueContentRepository,
  | "createVariant"
  | "updateVariant"
  | "archiveVariant"
  | "createComponent"
  | "updateComponent"
  | "archiveComponent"
  | "putRules"
  | "removeVariantRules"
  | "deliverability"
>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isEmptyBody = (body: unknown) =>
  body === undefined ||
  (typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    Object.keys(body).length === 0);
const refuse = (
  error: CatalogueContentError,
  reason?: string,
): CatalogueContentResult<never> => ({
  ok: false,
  error,
  ...(reason ? { reason } : {}),
});
const map = <T, U>(
  result: CatalogueContentResult<T>,
  wrap: (value: T) => U,
): CatalogueContentResult<U> =>
  result.ok ? { ok: true, value: wrap(result.value) } : result;

/** CAT-03a (REG-F2): validates the boundary, then hands typed commands to the repository. */
export class CatalogueContentService {
  constructor(private readonly repository: CatalogueContentRepository) {}

  async execute(
    action: CatalogueContentAction,
    params: CatalogueContentParams,
    body: unknown,
    actor: CatalogueContentActor,
  ): Promise<CatalogueContentResult<CatalogueContentBody>> {
    const { serviceId, variantId, componentId } = params;
    if (!uuidPattern.test(serviceId)) return refuse("service_not_found");
    const needsVariant =
      action === "variant_update" ||
      action === "variant_archive" ||
      action === "variant_rules_put" ||
      action === "variant_rules_delete";
    if (needsVariant && !(variantId && uuidPattern.test(variantId)))
      return refuse("variant_not_found");
    const needsComponent =
      action === "component_update" || action === "component_archive";
    if (needsComponent && !(componentId && uuidPattern.test(componentId)))
      return refuse("component_not_found");
    if (
      (action === "variant_archive" ||
        action === "component_archive" ||
        action === "variant_rules_delete") &&
      !isEmptyBody(body)
    )
      return refuse("invalid", "body_not_allowed");

    switch (action) {
      case "variant_create":
      case "variant_update": {
        const input = normalizeVariantInput(
          body,
          action === "variant_create" ? "create" : "update",
        );
        if ("invalid" in input) return refuse("invalid", input.invalid);
        const result =
          action === "variant_create"
            ? await this.repository.createVariant(
                serviceId,
                input as CatalogueVariantWrite,
                actor,
              )
            : await this.repository.updateVariant(
                serviceId,
                variantId!,
                input,
                actor,
              );
        return map(result, (variant) => ({ variant }));
      }
      case "variant_archive":
        return map(
          await this.repository.archiveVariant(serviceId, variantId!, actor),
          (variant) => ({ variant }),
        );
      case "component_create":
      case "component_update": {
        const input = normalizeComponentInput(
          body,
          action === "component_create" ? "create" : "update",
        );
        if ("invalid" in input) return refuse("invalid", input.invalid);
        const result =
          action === "component_create"
            ? await this.repository.createComponent(
                serviceId,
                input as CatalogueComponentWrite,
                actor,
              )
            : await this.repository.updateComponent(
                serviceId,
                componentId!,
                input as CatalogueComponentPatch,
                actor,
              );
        return map(result, (component) => ({ component }));
      }
      case "component_archive":
        return map(
          await this.repository.archiveComponent(
            serviceId,
            componentId!,
            actor,
          ),
          (component) => ({ component }),
        );
      case "rules_put":
      case "variant_rules_put": {
        const scoped = action === "rules_put" ? null : variantId!;
        const input = normalizeRulesInput(body, scoped ? "variant" : "service");
        if ("invalid" in input) return refuse("invalid", input.invalid);
        return map(
          await this.repository.putRules(serviceId, scoped, input, actor),
          ({ value, onboardingSubscriptionsAffected }) => ({
            rules: value,
            onboardingSubscriptionsAffected,
          }),
        );
      }
      case "variant_rules_delete":
        return map(
          await this.repository.removeVariantRules(
            serviceId,
            variantId!,
            actor,
          ),
          ({ onboardingSubscriptionsAffected }) => ({
            removed: true as const,
            onboardingSubscriptionsAffected,
          }),
        );
      case "deliverability":
        return this.repository.deliverability(serviceId);
    }
  }
}
