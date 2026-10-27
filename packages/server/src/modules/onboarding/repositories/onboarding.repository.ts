import { assertCustomerWritable } from "../../privacy/repositories/subject-freeze.js";
import { and, count, eq, isNull, ne, or } from "drizzle-orm";
import type { OnboardingDetail } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import {
  servicePolicies,
  services,
  serviceVariants,
} from "../../../db/schema/catalogue.js";
import {
  subscriptions,
  subscriptionStatusHistory,
} from "../../../db/schema/customers.js";
import { onboardingItems } from "../../../db/schema/onboarding.js";
import { capacityClaimCondition } from "./capacity-claims.js";
import {
  lockConsentDefinitions,
  readConsentEvidence,
} from "../../consents/repositories/consent.repository.js";
import {
  AuditService,
  type AuditMetadata,
} from "../../auth/services/audit.service.js";
import { syncPolicyMedicalRequirement } from "./medical-requirement.js";
import {
  checklistDefinition,
  deriveOnboarding,
  effectiveMedicalPolicy,
  itemPermissions,
  medicalAlwaysRequired,
  resolveCapacity,
  resolveEffectivePolicy,
  type OnboardingActor,
  type OnboardingCommand,
  type OnboardingRepository,
  type OnboardingResult,
} from "../services/onboarding.service.js";

export class DrizzleOnboardingRepository implements OnboardingRepository {
  constructor(
    private readonly database: typeof appDb,
    private readonly options: { auditHashPepper: string },
  ) {}

  async execute(
    subscriptionId: string,
    command: OnboardingCommand,
    actor: OnboardingActor,
  ): Promise<OnboardingResult> {
    return this.database.transaction(
      async (tx) => {
        if (command.action !== "read")
          await assertCustomerWritable(tx, { subscriptionId });
        const query = tx
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.id, subscriptionId));
        const [subscription] =
          command.action === "read" ? await query : await query.for("update");
        if (!subscription) return { status: "not_found" };
        if (
          command.action !== "read" &&
          (command.action === "reserve"
            ? !["onboarding", "ready_to_start"].includes(subscription.status)
            : subscription.status !== "onboarding")
        )
          return { status: "invalid_state" };

        const capacityCommand =
          command.action === "reserve" || command.action === "ready";
        // Every claim writer uses the stable service lock first. This also serializes fallback
        // service pools against variant pools and catalogue capacity edits.
        const serviceQuery = tx
          .select()
          .from(services)
          .where(eq(services.id, subscription.serviceId));
        const [service] = capacityCommand
          ? await serviceQuery.for("update")
          : await serviceQuery;
        if (!service) return { status: "policy_invalid" };
        const variantQuery = subscription.variantId
          ? tx
              .select()
              .from(serviceVariants)
              .where(
                and(
                  eq(serviceVariants.id, subscription.variantId),
                  eq(serviceVariants.serviceId, service.id),
                ),
              )
          : null;
        const [variant] = variantQuery
          ? capacityCommand
            ? await variantQuery.for("update")
            : await variantQuery
          : [];
        if (subscription.variantId && !variant)
          return { status: "policy_invalid" };
        const policyRows = await tx
          .select()
          .from(servicePolicies)
          .where(
            and(
              eq(servicePolicies.serviceId, service.id),
              subscription.variantId
                ? or(
                    isNull(servicePolicies.variantId),
                    eq(servicePolicies.variantId, subscription.variantId),
                  )
                : isNull(servicePolicies.variantId),
            ),
          );
        const policy = resolveEffectivePolicy(
          policyRows,
          subscription.variantId,
        );
        if (policy.status !== "ok") return policy;
        const capacity = resolveCapacity(
          service.capacityMode,
          service.capacityLimit,
          variant?.capacityLimit ?? null,
        );
        if (capacity.status !== "ok") return capacity;

        const audit = async (eventType: string, metadata: AuditMetadata) =>
          new AuditService(tx, this.options).record({
            actorType: "user",
            actorUserId: actor.userId,
            requestId: actor.requestId,
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent,
            eventType,
            entityType: "subscription",
            entityId: subscriptionId,
            result: "success",
            metadata,
          });
        const view = async (): Promise<OnboardingDetail> => {
          await lockConsentDefinitions(tx);
          const evidence = await readConsentEvidence(tx, subscriptionId);
          const items = (
            await tx
              .select()
              .from(onboardingItems)
              .where(eq(onboardingItems.subscriptionId, subscriptionId))
              .orderBy(onboardingItems.itemType)
          ).map((item) =>
            item.itemType === "service_terms" &&
            (!evidence.current || !evidence.bundle.satisfied)
              ? {
                  ...item,
                  status: "pending",
                  completedAt: null,
                  waivedAt: null,
                  waiverReason: null,
                }
              : item,
          );
          // Refresh time after acquiring capacity locks, including any time spent waiting.
          const now = new Date();
          const [claims] =
            capacity.mode === "limited"
              ? await tx
                  .select({ value: count() })
                  .from(subscriptions)
                  .where(
                    and(
                      eq(subscriptions.serviceId, service.id),
                      ne(subscriptions.id, subscriptionId),
                      capacity.scope === "variant"
                        ? eq(subscriptions.variantId, subscription.variantId!)
                        : undefined,
                      capacityClaimCondition(now),
                    ),
                  )
              : [];
          const occupied = claims?.value ?? 0;
          const derived = deriveOnboarding({
            status: subscription.status,
            plannedStartDate: subscription.plannedStartDate,
            until: subscription.capacityReservedUntil,
            limited: capacity.mode === "limited",
            capacityAvailable:
              capacity.limit === null || occupied < capacity.limit,
            items,
            questionnaireRequired: policy.questionnaireRequired,
            now,
          });
          return {
            subscription: {
              id: subscriptionId,
              reference: subscription.reference,
              status: subscription.status,
              plannedStartDate:
                subscription.plannedStartDate?.toISOString() ?? null,
              capacityReservedUntil:
                subscription.capacityReservedUntil?.toISOString() ?? null,
            },
            service: {
              id: service.id,
              name: service.name,
              variantId: subscription.variantId,
              variantName: variant?.name ?? null,
            },
            policy: {
              source: policy.source,
              questionnaireRequired: policy.questionnaireRequired,
            },
            capacity: {
              mode: capacity.mode,
              limit: capacity.limit,
              scope: capacity.scope,
              occupied,
              expired: derived.expired,
              valid: derived.holdValid,
            },
            initialized: derived.initialized,
            onboardingState: derived.state,
            canReady: derived.canReady,
            items: items.map((item) => ({
              id: item.id,
              itemType: item.itemType,
              label: item.label,
              status: item.status,
              isBlocking: item.isBlocking,
              completedAt: item.completedAt?.toISOString() ?? null,
              waivedAt: item.waivedAt?.toISOString() ?? null,
              waiverReason: item.waiverReason,
              ...itemPermissions(item.itemType),
              canComplete:
                subscription.status === "onboarding" &&
                ["pending", "blocked"].includes(item.status) &&
                itemPermissions(item.itemType).canComplete,
              canWaive:
                subscription.status === "onboarding" &&
                ["pending", "blocked"].includes(item.status) &&
                itemPermissions(item.itemType).canWaive,
            })),
          };
        };
        const current = await view();
        switch (command.action) {
          case "read":
            return { status: "ok", onboarding: current };
          case "initialize": {
            if (!subscription.plannedStartDate)
              return { status: "start_date_required" };
            const missing = checklistDefinition(
              policy.questionnaireRequired,
            ).filter(
              (item) =>
                !current.items.some(
                  (existing) => existing.itemType === item.itemType,
                ),
            );
            if (missing.length) {
              const inserted = await tx
                .insert(onboardingItems)
                .values(
                  missing.map((item) => ({
                    ...item,
                    subscriptionId,
                    isBlocking: true,
                    completedAt:
                      item.status === "completed" ? new Date() : null,
                  })),
                )
                .onConflictDoNothing({
                  target: [
                    onboardingItems.subscriptionId,
                    onboardingItems.itemType,
                  ],
                })
                .returning({ id: onboardingItems.id });
              if (inserted.length)
                await audit("subscription.onboarding_initialized", {
                  itemCount: inserted.length,
                });
            }
            const medicalPolicy = effectiveMedicalPolicy(
              policyRows,
              subscription.variantId,
            );
            if (medicalAlwaysRequired(medicalPolicy))
              await syncPolicyMedicalRequirement(
                tx,
                subscriptionId,
                medicalPolicy,
                audit,
              );
            break;
          }
          case "complete":
          case "waive": {
            const item = current.items.find(
              (item) => item.id === command.itemId,
            );
            if (!item) return { status: "item_not_found" };
            const permissions = itemPermissions(item.itemType);
            if (
              command.action === "complete"
                ? !permissions.canComplete
                : !permissions.canWaive
            )
              return { status: "item_forbidden" };
            if (!["pending", "blocked"].includes(item.status))
              return { status: "item_resolved" };
            if (command.action === "waive" && !command.reason.trim())
              return { status: "reason_required" };
            const toStatus =
              command.action === "complete" ? "completed" : "waived";
            await tx
              .update(onboardingItems)
              .set({
                status: toStatus,
                updatedAt: new Date(),
                ...(command.action === "complete"
                  ? { completedAt: new Date() }
                  : { waivedAt: new Date(), waiverReason: command.reason }),
              })
              .where(
                and(
                  eq(onboardingItems.id, command.itemId),
                  eq(onboardingItems.subscriptionId, subscriptionId),
                ),
              );
            await audit(
              command.action === "complete"
                ? "subscription.onboarding_item_completed"
                : "subscription.onboarding_item_waived",
              { itemType: item.itemType, fromStatus: item.status, toStatus },
            );
            break;
          }
          case "reserve": {
            if (
              capacity.mode !== "limited" ||
              command.until.getTime() <= Date.now()
            )
              return { status: "capacity_invalid" };
            if (current.capacity.occupied >= capacity.limit!)
              return { status: "capacity_exhausted" };
            await tx
              .update(subscriptions)
              .set({
                capacityReservedUntil: command.until,
                updatedAt: new Date(),
              })
              .where(eq(subscriptions.id, subscriptionId));
            subscription.capacityReservedUntil = command.until;
            await audit("subscription.capacity_reserved", {
              capacityScope: capacity.scope,
              capacityLimit: capacity.limit,
            });
            break;
          }
          case "ready": {
            if (!subscription.plannedStartDate)
              return { status: "start_date_required" };
            if (!current.capacity.valid) return { status: "capacity_required" };
            if (
              capacity.limit !== null &&
              current.capacity.occupied >= capacity.limit
            )
              return { status: "capacity_exhausted" };
            if (!current.canReady) return { status: "blocked" };
            await tx
              .update(subscriptions)
              .set({ status: "ready_to_start", updatedAt: new Date() })
              .where(eq(subscriptions.id, subscriptionId));
            await tx.insert(subscriptionStatusHistory).values({
              subscriptionId,
              fromStatus: "onboarding",
              toStatus: "ready_to_start",
              changedByUserId: actor.userId,
            });
            await audit("subscription.ready_to_start", {
              fromStatus: "onboarding",
              toStatus: "ready_to_start",
            });
            subscription.status = "ready_to_start";
            break;
          }
        }
        return { status: "ok", onboarding: await view() };
      },
      { isolationLevel: "read committed" },
    );
  }
}
