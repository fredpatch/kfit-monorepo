import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { db as appDb } from "../../../db/client.js";
import { prospects, serviceRequests } from "../../../db/schema/prospects.js";
import { services, serviceVariants } from "../../../db/schema/catalogue.js";
import type {
  CreateServiceRequestInput,
  CreateServiceRequestResult,
  RequestsRepository,
  ServiceAvailabilityRecord,
} from "../services/requests.service.js";

type RequestsDb = typeof appDb;

function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const pgError = error as { code?: unknown; constraint?: unknown };
  if (pgError.code !== "23505") return false;
  if (!constraint) return true;
  return pgError.constraint === constraint;
}

function generateReference(): string {
  return `REQ-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export class DrizzleRequestsRepository implements RequestsRepository {
  constructor(private readonly database: RequestsDb) {}

  async findServiceAvailability(serviceId: string): Promise<ServiceAvailabilityRecord | null> {
    const [row] = await this.database
      .select({
        id: services.id,
        availabilityStatus: services.availabilityStatus,
        archivedAt: services.archivedAt,
        isPublic: services.isPublic,
        publishedAt: services.publishedAt,
      })
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      availabilityStatus: row.availabilityStatus as ServiceAvailabilityRecord["availabilityStatus"],
      archivedAt: row.archivedAt,
      isPublic: row.isPublic,
      publishedAt: row.publishedAt,
    };
  }

  async findVariantOwnerServiceId(variantId: string): Promise<string | null> {
    const [row] = await this.database
      .select({ serviceId: serviceVariants.serviceId })
      .from(serviceVariants)
      .where(eq(serviceVariants.id, variantId))
      .limit(1);
    return row?.serviceId ?? null;
  }

  async createServiceRequest(input: CreateServiceRequestInput): Promise<CreateServiceRequestResult> {
    const [existing] = await this.database
      .select({ id: serviceRequests.id, reference: serviceRequests.reference, submittedAt: serviceRequests.submittedAt })
      .from(serviceRequests)
      .where(eq(serviceRequests.submissionToken, input.submissionToken))
      .limit(1);

    if (existing) {
      return { outcome: "replayed", request: existing };
    }

    return this.database.transaction(async (tx) => {
      const [existingProspect] = await tx
        .select({ id: prospects.id })
        .from(prospects)
        .where(eq(prospects.whatsapp, input.whatsapp))
        .limit(1);

      const prospectId = existingProspect
        ? existingProspect.id
        : (
          await tx
            .insert(prospects)
            .values({
              fullName: input.fullName,
              whatsapp: input.whatsapp,
              email: input.email,
              source: "public_request_form",
            })
            .returning({ id: prospects.id })
        )[0]?.id;

      if (!prospectId) {
        throw new Error("Prospect creation did not return an id");
      }

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          // Run the insert in a nested transaction (SAVEPOINT). If it fails on a unique
          // violation, only this savepoint is rolled back — the outer transaction `tx`
          // stays valid so the recovery/retry queries below can still execute. Without
          // this, Postgres marks the whole transaction aborted after any error and every
          // subsequent statement on `tx` (including the "replayed" lookup) would itself
          // fail with "current transaction is aborted".
          const created = await tx.transaction(async (savepoint) => {
            const [row] = await savepoint
              .insert(serviceRequests)
              .values({
                reference: generateReference(),
                submissionToken: input.submissionToken,
                prospectId,
                serviceId: input.serviceId,
                requestedVariantId: input.requestedVariantId,
                objective: input.objective,
                preferredStartDate: input.preferredStartDate,
                message: input.message,
                status: "submitted",
              })
              .returning({ id: serviceRequests.id, reference: serviceRequests.reference, submittedAt: serviceRequests.submittedAt });
            if (!row) throw new Error("Service request insert returned no row");
            return row;
          });

          return { outcome: "created", request: created };
        } catch (error) {
          if (isUniqueViolation(error, "service_requests_submission_token_uq")) {
            const [replayed] = await tx
              .select({ id: serviceRequests.id, reference: serviceRequests.reference, submittedAt: serviceRequests.submittedAt })
              .from(serviceRequests)
              .where(eq(serviceRequests.submissionToken, input.submissionToken))
              .limit(1);
            if (replayed) return { outcome: "replayed", request: replayed };
          }
          if (isUniqueViolation(error, "service_requests_reference_uq") && attempt < 2) {
            continue;
          }
          throw error;
        }
      }

      throw new Error("Service request insert failed after reference retries");
    });
  }
}
