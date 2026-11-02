import { and, asc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { db as appDb } from "../../../db/client.js";
import { serviceImages, services } from "../../../db/schema/catalogue.js";
import { AuditService } from "../../auth/services/audit.service.js";
import type { CatalogueImageKeys } from "../services/catalogue-image-files.js";
import type { CatalogueContentActor } from "./catalogue-content.repository.js";

type Database = typeof appDb;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type ImageRow = typeof serviceImages.$inferSelect;

export type CatalogueImageRecord = {
  id: string;
  serviceId: string;
  altText: string;
  width: number;
  height: number;
  updatedAt: Date;
};
export type CatalogueImageWrite = {
  id: string;
  serviceId: string;
  keys: CatalogueImageKeys;
  cardSizeBytes: number;
  largeSizeBytes: number;
  width: number;
  height: number;
  sha256: string;
  altText: string;
};
export type CatalogueImageServiceError =
  | "service_not_found"
  | "service_archived";
export type CatalogueImageScope = "public" | "admin";

const keysOf = (row: ImageRow): CatalogueImageKeys => ({
  card: row.cardStorageKey,
  large: row.largeStorageKey,
});
const recordOf = (row: ImageRow): CatalogueImageRecord => ({
  id: row.id,
  serviceId: row.serviceId,
  altText: row.altText,
  width: row.width,
  height: row.height,
  updatedAt: row.updatedAt,
});

const serviceStateColumns = {
  archivedAt: services.archivedAt,
  availabilityStatus: services.availabilityStatus,
};
/** C6: an archived offer keeps its files but takes no new photo and no « Retirer ». */
const stateOf = (
  service: { archivedAt: Date | null; availabilityStatus: string } | undefined,
): CatalogueImageServiceError | null => {
  if (!service) return "service_not_found";
  return service.archivedAt || service.availabilityStatus === "archived"
    ? "service_archived"
    : null;
};

/** C5: the public catalogue rule (catalogue.repositories.ts listPublicServices) - published, public, not archived. */
const publiclyListed = and(
  eq(services.isPublic, true),
  isNotNull(services.publishedAt),
  isNull(services.archivedAt),
  ne(services.availabilityStatus, "archived"),
);

/** The active image of each listed service (at most one per service, service_images_one_active_uq). */
export async function activeImageRecords(
  db: Database | Tx,
  serviceIds: string[],
): Promise<CatalogueImageRecord[]> {
  if (!serviceIds.length) return [];
  const rows = await db
    .select()
    .from(serviceImages)
    .where(
      and(
        inArray(serviceImages.serviceId, serviceIds),
        isNull(serviceImages.removedAt),
      ),
    )
    .orderBy(asc(serviceImages.serviceId));
  return rows.map(recordOf);
}

export class DrizzleCatalogueImageRepository {
  constructor(
    private readonly db: Database,
    private readonly options: { auditHashPepper: string },
  ) {}

  private audit(
    tx: Tx,
    actor: CatalogueContentActor,
    eventType: "catalogue.image_set" | "catalogue.image_removed",
    imageId: string,
    metadata: Record<string, string | number | null>,
  ) {
    return new AuditService(tx, this.options).record({
      actorType: "user",
      actorUserId: actor.userId,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      eventType,
      entityType: "service_image",
      entityId: imageId,
      result: "success",
      metadata,
    });
  }

  /** Every image writer takes the service row first, like the other catalogue content writers. */
  private async lockService(
    tx: Tx,
    serviceId: string,
  ): Promise<CatalogueImageServiceError | null> {
    const [service] = await tx
      .select(serviceStateColumns)
      .from(services)
      .where(eq(services.id, serviceId))
      .for("update");
    return stateOf(service);
  }

  private async activeRow(tx: Tx, serviceId: string) {
    const [row] = await tx
      .select()
      .from(serviceImages)
      .where(
        and(
          eq(serviceImages.serviceId, serviceId),
          isNull(serviceImages.removedAt),
        ),
      )
      .for("update");
    return row;
  }

  /** Read before the costly processing; setImage checks again under the lock. */
  async serviceState(
    serviceId: string,
  ): Promise<CatalogueImageServiceError | null> {
    const [service] = await this.db
      .select(serviceStateColumns)
      .from(services)
      .where(eq(services.id, serviceId));
    return stateOf(service);
  }

  /** C6 / K3: one transaction - the active row (if any) gets removed_at, the new row is inserted. */
  async setImage(
    input: CatalogueImageWrite,
    actor: CatalogueContentActor,
    now: Date,
  ): Promise<
    | {
        ok: true;
        image: CatalogueImageRecord;
        replaced: { id: string; keys: CatalogueImageKeys } | null;
      }
    | { ok: false; error: CatalogueImageServiceError }
  > {
    return this.db.transaction(async (tx) => {
      const refused = await this.lockService(tx, input.serviceId);
      if (refused) return { ok: false, error: refused };
      const previous = await this.activeRow(tx, input.serviceId);
      if (previous)
        await tx
          .update(serviceImages)
          .set({ removedAt: now, updatedAt: now })
          .where(eq(serviceImages.id, previous.id));
      const [row] = await tx
        .insert(serviceImages)
        .values({
          id: input.id,
          serviceId: input.serviceId,
          cardStorageKey: input.keys.card,
          largeStorageKey: input.keys.large,
          cardSizeBytes: input.cardSizeBytes,
          largeSizeBytes: input.largeSizeBytes,
          width: input.width,
          height: input.height,
          sha256: input.sha256,
          altText: input.altText,
          rightsConfirmedBy: actor.userId,
          rightsConfirmedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new Error("Service image insert did not return a row");
      await this.audit(tx, actor, "catalogue.image_set", row.id, {
        serviceId: input.serviceId,
        imageId: row.id,
        replacedImageId: previous?.id ?? null,
        width: row.width,
        height: row.height,
        cardSizeBytes: row.cardSizeBytes,
        largeSizeBytes: row.largeSizeBytes,
      });
      return {
        ok: true,
        image: recordOf(row),
        replaced: previous ? { id: previous.id, keys: keysOf(previous) } : null,
      };
    });
  }

  /** C6 « Retirer »: removed_at set; the caller deletes the files after commit. */
  async removeImage(
    serviceId: string,
    actor: CatalogueContentActor,
    now: Date,
  ): Promise<
    | { ok: true; removed: { id: string; keys: CatalogueImageKeys } }
    | { ok: false; error: CatalogueImageServiceError | "image_not_found" }
  > {
    return this.db.transaction(async (tx) => {
      const refused = await this.lockService(tx, serviceId);
      if (refused) return { ok: false, error: refused };
      const active = await this.activeRow(tx, serviceId);
      if (!active) return { ok: false, error: "image_not_found" };
      await tx
        .update(serviceImages)
        .set({ removedAt: now, updatedAt: now })
        .where(eq(serviceImages.id, active.id));
      await this.audit(tx, actor, "catalogue.image_removed", active.id, {
        serviceId,
        imageId: active.id,
      });
      return { ok: true, removed: { id: active.id, keys: keysOf(active) } };
    });
  }

  /** C5: an active image; for `public`, only when its offer is published, public and not archived. */
  async servableKeys(
    imageId: string,
    scope: CatalogueImageScope,
  ): Promise<CatalogueImageKeys | null> {
    const active = and(
      eq(serviceImages.id, imageId),
      isNull(serviceImages.removedAt),
    );
    const [row] = await this.db
      .select({ image: serviceImages })
      .from(serviceImages)
      .innerJoin(services, eq(services.id, serviceImages.serviceId))
      .where(scope === "public" ? and(active, publiclyListed) : active);
    return row ? keysOf(row.image) : null;
  }
}
