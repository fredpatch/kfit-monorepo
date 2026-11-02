import { createHash, randomUUID } from "node:crypto";
import {
  catalogueImageUrls,
  decodeCatalogueImageAlt,
  normalizeCatalogueImageAlt,
  parseCatalogueImageFile,
  type CatalogueErrorCode,
  type CatalogueServiceImage,
} from "@kfit/shared";
import { DocumentStorageError } from "../../documents/services/document-storage.service.js";
import type { CatalogueContentActor } from "../repositories/catalogue-content.repository.js";
import type {
  CatalogueImageRecord,
  CatalogueImageScope,
  DrizzleCatalogueImageRepository,
} from "../repositories/catalogue-image.repository.js";
import type {
  CatalogueImageFiles,
  CatalogueImageKeys,
} from "./catalogue-image-files.js";
import {
  CatalogueImageError,
  processCatalogueImage,
} from "./catalogue-image.pipeline.js";

export type CatalogueImageFailure =
  | Extract<
      CatalogueErrorCode,
      | "CATALOGUE_IMAGE_TOO_SMALL"
      | "CATALOGUE_IMAGE_TOO_LARGE_PIXELS"
      | "CATALOGUE_IMAGE_ALT_REQUIRED"
      | "CATALOGUE_IMAGE_RIGHTS_REQUIRED"
      | "CATALOGUE_IMAGE_NOT_FOUND"
      | "CATALOGUE_SERVICE_NOT_FOUND"
      | "CATALOGUE_SERVICE_ARCHIVED"
    >
  | DocumentStorageError["code"];
export type CatalogueImageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CatalogueImageFailure };
export type CatalogueImageUpload = {
  bytes: unknown;
  mimeType: string;
  altHeader: unknown;
  rightsHeader: unknown;
};

/** Same guard as the other catalogue writers: a malformed id is an unknown offer, not a database error. */
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const serviceErrors = {
  service_not_found: "CATALOGUE_SERVICE_NOT_FOUND",
  service_archived: "CATALOGUE_SERVICE_ARCHIVED",
  image_not_found: "CATALOGUE_IMAGE_NOT_FOUND",
} as const;

export function catalogueImageDto(
  record: CatalogueImageRecord,
  scope: CatalogueImageScope,
): CatalogueServiceImage {
  return {
    id: record.id,
    altText: record.altText,
    width: record.width,
    height: record.height,
    urls: catalogueImageUrls(scope, record.id),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** K2: rights header must say "confirmed"; the description is base64url UTF-8, 1 to 150 characters (C7, C8). */
export function parseCatalogueImageHeaders(
  altHeader: unknown,
  rightsHeader: unknown,
): CatalogueImageResult<{ altText: string }> {
  const altText = normalizeCatalogueImageAlt(
    decodeCatalogueImageAlt(altHeader),
  );
  if (!altText) return { ok: false, error: "CATALOGUE_IMAGE_ALT_REQUIRED" };
  if (rightsHeader !== "confirmed")
    return { ok: false, error: "CATALOGUE_IMAGE_RIGHTS_REQUIRED" };
  return { ok: true, value: { altText } };
}

export class CatalogueImageService {
  constructor(
    private readonly repository: Pick<
      DrizzleCatalogueImageRepository,
      "serviceState" | "setImage" | "removeImage" | "servableKeys"
    >,
    private readonly files: Pick<
      CatalogueImageFiles,
      "screen" | "write" | "read" | "remove"
    >,
    /** A file left behind after commit is logged by id, never fatal (K3). */
    private readonly onFilesNotDeleted: (imageId: string) => void = () => {},
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async deleteAfterCommit(image: {
    id: string;
    keys: CatalogueImageKeys;
  }) {
    try {
      await this.files.remove(image.keys);
    } catch {
      this.onFilesNotDeleted(image.id);
    }
  }

  async upload(
    serviceId: string,
    input: CatalogueImageUpload,
    actor: CatalogueContentActor,
  ): Promise<CatalogueImageResult<{ image: CatalogueServiceImage }>> {
    const headers = parseCatalogueImageHeaders(
      input.altHeader,
      input.rightsHeader,
    );
    if (!headers.ok) return headers;
    if (!uuidPattern.test(serviceId))
      return { ok: false, error: "CATALOGUE_SERVICE_NOT_FOUND" };
    const state = await this.repository.serviceState(serviceId);
    if (state) return { ok: false, error: serviceErrors[state] };
    if (!Buffer.isBuffer(input.bytes))
      return { ok: false, error: "DOCUMENT_FILE_TYPE_UNSUPPORTED" };
    try {
      await this.files.screen(input.bytes, input.mimeType);
      const processed = await processCatalogueImage(input.bytes);
      const imageId = randomUUID();
      const keys = await this.files.write(imageId, processed);
      let saved: Awaited<
        ReturnType<DrizzleCatalogueImageRepository["setImage"]>
      >;
      try {
        saved = await this.repository.setImage(
          {
            id: imageId,
            serviceId,
            keys,
            cardSizeBytes: processed.card.bytes.length,
            largeSizeBytes: processed.large.bytes.length,
            width: processed.large.width,
            height: processed.large.height,
            sha256: createHash("sha256")
              .update(processed.large.bytes)
              .digest("hex"),
            altText: headers.value.altText,
          },
          actor,
          this.now(),
        );
      } catch (error) {
        await this.deleteAfterCommit({ id: imageId, keys });
        throw error;
      }
      if (!saved.ok) {
        await this.deleteAfterCommit({ id: imageId, keys });
        return { ok: false, error: serviceErrors[saved.error] };
      }
      if (saved.replaced) await this.deleteAfterCommit(saved.replaced);
      return {
        ok: true,
        value: { image: catalogueImageDto(saved.image, "admin") },
      };
    } catch (error) {
      if (
        error instanceof DocumentStorageError ||
        error instanceof CatalogueImageError
      )
        return { ok: false, error: error.code };
      throw error;
    }
  }

  async remove(
    serviceId: string,
    actor: CatalogueContentActor,
  ): Promise<CatalogueImageResult<{ removed: true }>> {
    if (!uuidPattern.test(serviceId))
      return { ok: false, error: "CATALOGUE_SERVICE_NOT_FOUND" };
    const result = await this.repository.removeImage(
      serviceId,
      actor,
      this.now(),
    );
    if (!result.ok) return { ok: false, error: serviceErrors[result.error] };
    await this.deleteAfterCommit(result.removed);
    return { ok: true, value: { removed: true } };
  }

  /** C5: `file` is `<imageId>-<card|large>.webp`; anything else, or an image the scope may not see → null (404). */
  async read(file: string, scope: CatalogueImageScope): Promise<Buffer | null> {
    const parsed = parseCatalogueImageFile(file);
    if (!parsed) return null;
    const keys = await this.repository.servableKeys(parsed.imageId, scope);
    if (!keys) return null;
    try {
      return await this.files.read(keys[parsed.size]);
    } catch {
      return null;
    }
  }
}
