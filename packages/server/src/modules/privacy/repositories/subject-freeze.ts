import { eq } from "drizzle-orm";
import type { SubjectArchivedErrorCode } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { prospects, serviceRequests } from "../../../db/schema/prospects.js";

type Reader = Pick<typeof appDb, "select">;

/** ARCH-01 D1: thrown inside the writer transaction, so it rolls back; routers answer 409 { error: code }. */
export class SubjectArchivedError extends Error {
  constructor(readonly code: SubjectArchivedErrorCode) {
    super(code);
    this.name = "SubjectArchivedError";
  }
}

export type CustomerWriteScope = { customerId: string } | { subscriptionId: string };
export type ProspectWriteScope = { prospectId: string } | { requestId: string };

/**
 * ARCH-01 D1/D2: refuses any write on an archived or anonymized customer. The owner is resolved with a plain read,
 * then the customer row is taken FOR SHARE: callers make this their first row lock, so archive/anonymize (FOR UPDATE
 * on the same row) serialize with writers. An unknown scope is left to the writer's own not-found answer.
 */
export async function assertCustomerWritable(tx: Reader, scope: CustomerWriteScope | null): Promise<void> {
  if (!scope) return;
  const customerId = "customerId" in scope ? scope.customerId
    : (await tx.select({ customerId: subscriptions.customerId }).from(subscriptions).where(eq(subscriptions.id, scope.subscriptionId)))[0]?.customerId;
  if (!customerId) return;
  const [row] = await tx.select({ archivedAt: customers.archivedAt }).from(customers).where(eq(customers.id, customerId)).for("share");
  if (row?.archivedAt) throw new SubjectArchivedError("CUSTOMER_ARCHIVED");
}

/** ARCH-01 D1/D2: same rule for a prospect and its requests. */
export async function assertProspectWritable(tx: Reader, scope: ProspectWriteScope | null): Promise<void> {
  if (!scope) return;
  const prospectId = "prospectId" in scope ? scope.prospectId
    : (await tx.select({ prospectId: serviceRequests.prospectId }).from(serviceRequests).where(eq(serviceRequests.id, scope.requestId)))[0]?.prospectId;
  if (!prospectId) return;
  const [row] = await tx.select({ archivedAt: prospects.archivedAt }).from(prospects).where(eq(prospects.id, prospectId)).for("share");
  if (row?.archivedAt) throw new SubjectArchivedError("PROSPECT_ARCHIVED");
}

