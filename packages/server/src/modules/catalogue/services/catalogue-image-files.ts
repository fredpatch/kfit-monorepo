import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { catalogueImageMimeTypes, type CatalogueImageSize } from "@kfit/shared";
import {
  DocumentStorageError,
  type PrivateDocumentStorage,
} from "../../documents/services/document-storage.service.js";
import type { ProcessedCatalogueImage } from "./catalogue-image.pipeline.js";

/* CAT-04 C4: under the private storage root, in `catalogue/`, so ops:backup and ops:restore carry them with the documents. */

export type CatalogueImageKeys = Record<CatalogueImageSize, string>;

export const catalogueImageKeys = (imageId: string): CatalogueImageKeys => ({
  card: `catalogue/${imageId}-card.webp`,
  large: `catalogue/${imageId}-large.webp`,
});

const keyPattern =
  /^catalogue\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(card|large)\.webp$/;

export class CatalogueImageFiles {
  constructor(
    private readonly storage: Pick<
      PrivateDocumentStorage,
      "root" | "validate" | "scan"
    >,
  ) {}

  /** K3: size, type and signature, then ClamAV on the original bytes - the document upload checks, images only. */
  async screen(bytes: Buffer, mimeType: string): Promise<void> {
    this.storage.validate(bytes, mimeType);
    if (!(catalogueImageMimeTypes as readonly string[]).includes(mimeType))
      throw new DocumentStorageError("DOCUMENT_FILE_TYPE_UNSUPPORTED");
    await this.storage.scan(bytes);
  }

  private file(key: string): string {
    if (!keyPattern.test(key))
      throw new DocumentStorageError("DOCUMENT_STORAGE_FAILURE");
    return path.join(this.storage.root, ...key.split("/"));
  }

  /** Each file appears complete (temporary file, then rename); on any failure neither stays. */
  async write(
    imageId: string,
    processed: ProcessedCatalogueImage,
  ): Promise<CatalogueImageKeys> {
    const keys = catalogueImageKeys(imageId);
    try {
      await mkdir(path.join(this.storage.root, "catalogue"), {
        recursive: true,
      });
      for (const size of ["large", "card"] as const) {
        const target = this.file(keys[size]);
        const temporary = `${target}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, processed[size].bytes, { flag: "wx" });
          await rename(temporary, target);
        } finally {
          await rm(temporary, { force: true });
        }
      }
      return keys;
    } catch {
      await this.remove(keys).catch(() => undefined);
      throw new DocumentStorageError("DOCUMENT_STORAGE_FAILURE");
    }
  }

  async read(key: string): Promise<Buffer> {
    try {
      return await readFile(this.file(key));
    } catch {
      throw new DocumentStorageError("DOCUMENT_STORAGE_FAILURE");
    }
  }

  async remove(keys: CatalogueImageKeys): Promise<void> {
    await Promise.all(
      Object.values(keys).map((key) => rm(this.file(key), { force: true })),
    );
  }
}
