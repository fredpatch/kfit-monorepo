import { and, eq, isNull } from "drizzle-orm";
import type { db as appDb } from "../../../db/client.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { paymentProofs, quotes } from "../../../db/schema/finance.js";
import { DrizzleFinanceRepository } from "../../finance/repositories/finance.repository.js";

export class DrizzleDashboardAlertsRepository {
  constructor(private readonly database: typeof appDb, private readonly finance: DrizzleFinanceRepository) {}
  async snapshot(now: Date) {
    return this.database.transaction(async tx => {
      const owners = await tx.select({ sub: subscriptions, customerId: customers.id, customerDisplayName: customers.fullName }).from(subscriptions).innerJoin(customers, eq(customers.id, subscriptions.customerId)).where(and(isNull(customers.archivedAt), isNull(customers.anonymizedAt)));
      const finance = await this.finance.readManyInTransaction(tx, owners.map(row => row.sub), now);
      const proofs = await tx.select({ resourceId: paymentProofs.id, subscriptionId: paymentProofs.subscriptionId, referenceAt: paymentProofs.submittedAt }).from(paymentProofs).where(eq(paymentProofs.status, "pending_review"));
      const quoteChanges = await tx.select({ resourceId: quotes.id, subscriptionId: quotes.subscriptionId, referenceAt: quotes.updatedAt }).from(quotes).where(eq(quotes.status, "changes_requested"));
      return { owners: owners.map(row => ({ subscriptionId: row.sub.id, customerId: row.customerId, customerDisplayName: row.customerDisplayName })), finance, proofs, quoteChanges };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }
}
