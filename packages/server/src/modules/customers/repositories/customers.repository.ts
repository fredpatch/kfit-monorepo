import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { AdminCustomer, AdminCustomerDetailResponse } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { serviceVariants, services } from "../../../db/schema/catalogue.js";
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

export function activeCustomerWhatsappMatches(whatsapp: string) {
  return and(active, phoneMatches(whatsapp));
}

export async function lockCustomerWhatsapp(transaction: Pick<typeof appDb, "execute">, whatsapp: string): Promise<void> {
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'customer-whatsapp:' + whatsapp}, 0))`);
}

export class DrizzleCustomersRepository implements CustomersRepository {
  constructor(private readonly database: typeof appDb, private readonly options: { auditHashPepper: string }) {}

  async listActive(): Promise<AdminCustomer[]> {
    return (await this.database.select(fields).from(customers).where(active).orderBy(desc(customers.createdAt), customers.id)).map(toDto);
  }

  async getDetail(customerId: string): Promise<AdminCustomerDetailResponse | null> {
    const [customer] = await this.database.select(fields).from(customers).where(and(active, eq(customers.id, customerId))).limit(1);
    if (!customer) return null;
    const rows = await this.database
      .select({
        id: subscriptions.id, reference: subscriptions.reference, status: subscriptions.status,
        serviceId: subscriptions.serviceId, serviceName: services.name, serviceSlug: services.slug,
        variantId: subscriptions.variantId, variantName: serviceVariants.name, agreedPriceXaf: subscriptions.agreedPriceXaf,
        plannedStartDate: subscriptions.plannedStartDate, actualStartDate: subscriptions.actualStartDate,
        plannedEndDate: subscriptions.plannedEndDate, actualEndDate: subscriptions.actualEndDate,
        renewedFromSubscriptionId: subscriptions.renewedFromSubscriptionId, createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .innerJoin(services, eq(services.id, subscriptions.serviceId))
      .leftJoin(serviceVariants, eq(serviceVariants.id, subscriptions.variantId))
      .where(eq(subscriptions.customerId, customerId))
      .orderBy(desc(subscriptions.createdAt), subscriptions.id);
    const iso = (value: Date | null) => (value ? value.toISOString() : null);
    return {
      customer: toDto(customer),
      subscriptions: rows.map((row) => ({
        ...row,
        plannedStartDate: iso(row.plannedStartDate), actualStartDate: iso(row.actualStartDate),
        plannedEndDate: iso(row.plannedEndDate), actualEndDate: iso(row.actualEndDate),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async searchActive(whatsapp: string): Promise<AdminCustomer[]> {
    return (await this.database.select(fields).from(customers).where(activeCustomerWhatsappMatches(whatsapp)).orderBy(customers.id)).map(toDto);
  }

  async createManual(input: NormalizedCustomerInput, actor: CustomerActorContext) {
    return this.database.transaction(async (tx) => {
      // Serialize S4.1 creates for this collision key without adding a DB constraint.
      // Future customer writers must participate in the same locking protocol.
      await lockCustomerWhatsapp(tx, input.whatsapp);
      const [existing] = await tx.select({ id: customers.id }).from(customers).where(activeCustomerWhatsappMatches(input.whatsapp)).limit(1);
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
