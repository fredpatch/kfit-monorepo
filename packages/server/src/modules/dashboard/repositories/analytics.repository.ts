import { and, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import type { db as appDb } from "../../../db/client.js";
import {
  customers,
  subscriptions,
  subscriptionPauses,
  subscriptionStatusHistory,
} from "../../../db/schema/customers.js";
import {
  appointments,
  followUps,
  subscriptionFollowUpCadenceHistory,
} from "../../../db/schema/coaching.js";
import {
  serviceRequests,
  contactAttempts,
  qualificationReviews,
} from "../../../db/schema/prospects.js";
import { DrizzleFinanceRepository } from "../../finance/repositories/finance.repository.js";

/** One bounded query per source, shared by all buckets, in a single read-only snapshot. */
export class DrizzleDashboardAnalyticsRepository {
  constructor(
    private readonly database: typeof appDb,
    private readonly finance: DrizzleFinanceRepository,
  ) {}
  async snapshot(from: Date, now: Date) {
    return this.database.transaction(
      async (tx) => {
        const owners = await tx
          .select()
          .from(subscriptions)
          .where(lte(subscriptions.createdAt, now));
        const ids = owners.map((sub) => sub.id);
        const visibleCustomers = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(isNull(customers.archivedAt), isNull(customers.anonymizedAt)),
          );
        const visibleIds = new Set(
          visibleCustomers.map((customer) => customer.id),
        );
        const statuses = ids.length
          ? await tx
              .select({
                subscriptionId: subscriptionStatusHistory.subscriptionId,
                fromStatus: subscriptionStatusHistory.fromStatus,
                toStatus: subscriptionStatusHistory.toStatus,
                changedAt: subscriptionStatusHistory.changedAt,
              })
              .from(subscriptionStatusHistory)
              .where(
                and(
                  inArray(subscriptionStatusHistory.subscriptionId, ids),
                  lte(subscriptionStatusHistory.changedAt, now),
                ),
              )
          : [];
        const pauses = ids.length
          ? await tx
              .select({
                subscriptionId: subscriptionPauses.subscriptionId,
                startedAt: subscriptionPauses.startedAt,
                endedAt: subscriptionPauses.endedAt,
              })
              .from(subscriptionPauses)
              .where(inArray(subscriptionPauses.subscriptionId, ids))
          : [];
        const cadenceHistory = ids.length
          ? await tx
              .select()
              .from(subscriptionFollowUpCadenceHistory)
              .where(
                inArray(subscriptionFollowUpCadenceHistory.subscriptionId, ids),
              )
          : [];
        const activity = ids.length
          ? await tx
              .select({
                subscriptionId: followUps.subscriptionId,
                occurredAt: followUps.occurredAt,
                completedAt: followUps.completedAt,
                status: followUps.status,
              })
              .from(followUps)
              .where(
                and(
                  inArray(followUps.subscriptionId, ids),
                  lte(followUps.occurredAt, now),
                ),
              )
          : [];
        const completed = ids.length
          ? await tx
              .select({
                subscriptionId: appointments.subscriptionId,
                completedAt: appointments.completedAt,
                createdAt: appointments.createdAt,
              })
              .from(appointments)
              .where(
                and(
                  inArray(appointments.subscriptionId, ids),
                  eq(appointments.status, "completed"),
                  isNotNull(appointments.completedAt),
                  lte(appointments.completedAt, now),
                ),
              )
          : [];
        const requests = await tx
          .select({
            id: serviceRequests.id,
            submittedAt: serviceRequests.submittedAt,
            convertedSubscriptionId: serviceRequests.convertedSubscriptionId,
          })
          .from(serviceRequests)
          .where(
            and(
              gte(serviceRequests.submittedAt, from),
              lte(serviceRequests.submittedAt, now),
            ),
          );
        const requestIds = requests.map((request) => request.id);
        const contacts = requestIds.length
          ? await tx
              .select({ requestId: contactAttempts.requestId })
              .from(contactAttempts)
              .where(
                and(
                  inArray(contactAttempts.requestId, requestIds),
                  lte(contactAttempts.occurredAt, now),
                ),
              )
          : [];
        const reviews = requestIds.length
          ? await tx
              .select({
                requestId: qualificationReviews.requestId,
                outcome: qualificationReviews.outcome,
              })
              .from(qualificationReviews)
              .where(
                and(
                  inArray(qualificationReviews.requestId, requestIds),
                  isNull(qualificationReviews.supersededAt),
                ),
              )
          : [];
        if (
          new Set(reviews.map((review) => review.requestId)).size !==
          reviews.length
        )
          throw new Error("Ambiguous authoritative qualification");
        const finance = await this.finance.readManyInTransaction(
          tx,
          owners,
          now,
        );
        return {
          subscriptions: owners.filter((sub) => visibleIds.has(sub.customerId)),
          statuses,
          pauses,
          cadenceHistory,
          followUps: activity,
          appointments: completed,
          requests,
          contactedIds: new Set(
            contacts.flatMap((contact) =>
              contact.requestId === null ? [] : [contact.requestId],
            ),
          ),
          qualifiedIds: new Set(
            reviews
              .filter(
                (review) =>
                  review.outcome === "qualified" ||
                  review.outcome === "qualified_with_conditions",
              )
              .map((review) => review.requestId),
          ),
          finance,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
export type DashboardAnalyticsSnapshot = Awaited<
  ReturnType<DrizzleDashboardAnalyticsRepository["snapshot"]>
>;
