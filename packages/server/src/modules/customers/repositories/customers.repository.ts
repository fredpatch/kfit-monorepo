import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { AdminCustomer } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { customers } from "../../../db/schema/customers.js";
import { AuditService } from "../../auth/services/audit.service.js";
import type { CustomerActorContext, CustomersRepository, NormalizedCustomerInput } from "../services/customers.service.js";

const active = and(isNull(customers.archivedAt), isNull(customers.anonymizedAt));
const fields = {
  id: customers.id, fullName: customers.fullName, whatsapp: customers.whatsapp,
  email: customers.email, city: customers.city, country: customers.country,
  preferredContactChannel: customers.preferredContactChannel,
  prospectId: customers.prospectId, createdAt: customers.createdAt,
};
type CustomerRow = Omit<AdminCustomer, "createdAt"> & { createdAt: Date };
function toDto(row: CustomerRow): AdminCustomer {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
// Match the shared Sprint 3 normalization, including already stored formatted numbers.
function phoneMatches(whatsapp: string) {
  return eq(sql<string>`regexp_replace(${customers.whatsapp}, '[^0-9+]', '', 'g')`, whatsapp);
}

export class DrizzleCustomersRepository implements CustomersRepository {
  constructor(private readonly database: typeof appDb, private readonly options: { auditHashPepper: string }) {}

  async listActive(): Promise<AdminCustomer[]> {
    return (await this.database.select(fields).from(customers).where(active).orderBy(desc(customers.createdAt), customers.id)).map(toDto);
  }

  async searchActive(whatsapp: string): Promise<AdminCustomer[]> {
    return (await this.database.select(fields).from(customers).where(and(active, phoneMatches(whatsapp))).orderBy(customers.id)).map(toDto);
  }

  async createManual(input: NormalizedCustomerInput, actor: CustomerActorContext) {
    return this.database.transaction(async (tx) => {
      // Serialize S4.1 creates for this collision key without adding a DB constraint.
      // Future customer writers must participate in the same locking protocol.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'customer-whatsapp:' + input.whatsapp}, 0))`);
      const [existing] = await tx.select({ id: customers.id }).from(customers).where(and(active, phoneMatches(input.whatsapp))).limit(1);
      if (existing) return { status: "duplicate" } as const;
      const [row] = await tx.insert(customers).values({ ...input, prospectId: null }).returning(fields);
      if (!row) throw new Error("Customer insert did not return a row");
      await new AuditService(tx, this.options).record({
        actorType: "user", actorUserId: actor.userId, eventType: "customer.created",
        entityType: "customer", entityId: row.id, result: "success",
        requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent,
        metadata: { source: "manual" },
      });
      return { status: "ok", customer: toDto(row) } as const;
    }, { isolationLevel: "read committed" });
  }
}
