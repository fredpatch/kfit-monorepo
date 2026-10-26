import { assertProspectWritable } from "../../privacy/repositories/subject-freeze.js";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import { normalizeWhatsapp, type RequestConversionResponse } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { serviceComponents, serviceVariants, services } from "../../../db/schema/catalogue.js";
import { resolveDuration } from "../../subscriptions/services/subscription-lifecycle.policy.js";
import { customers, subscriptionComponents, subscriptions, subscriptionStatusHistory } from "../../../db/schema/customers.js";
import { prospects, qualificationReviews, serviceRequests } from "../../../db/schema/prospects.js";
import { AuditService } from "../../auth/services/audit.service.js";
import { activeCustomerWhatsappMatches, lockCustomerWhatsapp } from "../../customers/repositories/customers.repository.js";
import { resolveConversionDecision, type ConversionActor, type ConversionResult, type RequestConversionRepository } from "../services/request-conversion.service.js";
import { lockCadenceWrites, recordEffectiveCadence, resolvedCadence } from "../../follow-ups/repositories/cadence-history.repository.js";
import { activeVariant } from "../../catalogue/repositories/catalogue-content.repository.js";
import { isPgUniqueViolation } from "../../../db/pg-error.js";


export class DrizzleRequestConversionRepository implements RequestConversionRepository {
  constructor(private readonly database: typeof appDb, private readonly options: { auditHashPepper: string }) {}

  async convert(requestId: string, fallbackStart: Date | null, actor: ConversionActor): Promise<ConversionResult> {
    try {
      return await this.database.transaction(async tx => {
        await lockCadenceWrites(tx);
        await assertProspectWritable(tx, { requestId });
        const [request] = await tx.select().from(serviceRequests).where(eq(serviceRequests.id, requestId)).for("update");
        if (!request) return { status: "not_found" };
        const [sourceSubscription] = await tx.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.sourceRequestId, requestId)).limit(1);
        if (request.status === "converted" || request.convertedSubscriptionId || sourceSubscription) return { status: "already_converted" };
        const reviews = await tx.select().from(qualificationReviews).where(and(eq(qualificationReviews.requestId, requestId), isNull(qualificationReviews.supersededAt)));
        const decision = resolveConversionDecision(request.status, reviews, fallbackStart);
        if (decision.status !== "ok") return decision;
        const [service] = await tx.select().from(services).where(eq(services.id, request.serviceId)).for("share");
        const [variant] = decision.variantId === null ? [] : await tx.select().from(serviceVariants)
          .where(and(eq(serviceVariants.id, decision.variantId), eq(serviceVariants.serviceId, request.serviceId), activeVariant)).for("share");
        if (!service || (decision.variantId !== null && !variant)) return { status: "qualification_invalid" };
        const duration = resolveDuration(variant ? { value: variant.durationValue, unit: variant.durationUnit } : null, { value: service.defaultDurationValue, unit: service.defaultDurationUnit });
        if (!duration) return { status: "duration_invalid" };

        const [prospect] = await tx.select().from(prospects).where(eq(prospects.id, request.prospectId)).for("share");
        const whatsapp = prospect ? normalizeWhatsapp(prospect.whatsapp) : null;
        if (!prospect || !whatsapp) return { status: "not_eligible" };
        await lockCustomerWhatsapp(tx, whatsapp);
        const [existing] = await tx.select({ id: customers.id }).from(customers).where(activeCustomerWhatsappMatches(whatsapp)).orderBy(customers.id).limit(1);
        let customerId = existing?.id;
        if (!customerId) {
          const [created] = await tx.insert(customers).values({
            prospectId: request.prospectId, fullName: prospect.fullName, whatsapp, email: prospect.email,
            city: prospect.city, country: prospect.country, preferredContactChannel: prospect.preferredContactChannel,
          }).returning({ id: customers.id });
          if (!created) throw new Error("Conversion customer insert returned no row");
          customerId = created.id;
        }

        const [subscription] = await tx.insert(subscriptions).values({
          reference: `SUB-${randomUUID().toUpperCase()}`, customerId, sourceRequestId: requestId,
          serviceId: request.serviceId, variantId: decision.variantId, status: "onboarding",
          agreedPriceXaf: decision.agreedPriceXaf, currency: "XAF", plannedStartDate: decision.plannedStartDate,
          durationValueSnapshot: duration.value, durationUnitSnapshot: duration.unit,
          createdByUserId: actor.userId, capacityReservedUntil: null,
        }).returning();
        if (!subscription) throw new Error("Conversion subscription insert returned no row");
        await recordEffectiveCadence(tx, subscription, await resolvedCadence(tx, subscription), new Date());
        const components = await tx.select().from(serviceComponents).where(and(eq(serviceComponents.serviceId, request.serviceId), isNull(serviceComponents.archivedAt),
          decision.variantId === null ? isNull(serviceComponents.variantId) : or(isNull(serviceComponents.variantId), eq(serviceComponents.variantId, decision.variantId))));
        if (components.length > 0) {
          await tx.insert(subscriptionComponents).values(components.map(component => ({
            subscriptionId: subscription.id, sourceServiceComponentId: component.id, componentType: component.componentType,
            labelSnapshot: component.label, quantityEntitled: component.quantity, quantityConsumed: 0, quantityOwedByCoach: 0,
          })));
        }
        await tx.insert(subscriptionStatusHistory).values({ subscriptionId: subscription.id, fromStatus: null, toStatus: "onboarding", changedByUserId: actor.userId });
        await tx.update(serviceRequests).set({ status: "converted", convertedSubscriptionId: subscription.id, updatedAt: new Date() }).where(eq(serviceRequests.id, requestId));
        const customerResolution = existing ? "existing" : "created";
        await new AuditService(tx, this.options).record({
          actorType: "user", actorUserId: actor.userId, eventType: "request.converted", entityType: "service_request",
          entityId: requestId, result: "success", requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent,
          metadata: { fromStatus: request.status, toStatus: "converted", customerId, subscriptionId: subscription.id, customerResolution },
        });
        const response: RequestConversionResponse = {
          request: { id: requestId, status: "converted", convertedSubscriptionId: subscription.id }, customerResolution,
          subscription: {
            id: subscription.id, reference: subscription.reference, customerId, sourceRequestId: requestId,
            serviceId: request.serviceId, variantId: decision.variantId, status: "onboarding", agreedPriceXaf: decision.agreedPriceXaf,
            currency: "XAF", plannedStartDate: decision.plannedStartDate.toISOString(), createdByUserId: actor.userId, capacityReservedUntil: null,
          },
        };
        return { status: "ok", response };
      }, { isolationLevel: "read committed" });
    } catch (error) {
      // Interpret only link-uniqueness conflicts after the failed transaction has rolled back.
      if (isPgUniqueViolation(error, "subscriptions_source_request_uq") || isPgUniqueViolation(error, "service_requests_converted_subscription_uq")) return { status: "already_converted" };
      throw error;
    }
  }
}
