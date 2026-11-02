import sharp, { type Metadata } from "sharp";
import {
  catalogueImageRules,
  catalogueImageSizes,
  type CatalogueImageSize,
} from "@kfit/shared";

/* CAT-04 C3 / K3: decode, auto-rotate, 16:10 crop (attention), WebP at two widths. No withMetadata: EXIF, GPS, device and ICC are dropped. */

export type CatalogueImageErrorCode =
  | "CATALOGUE_IMAGE_TOO_SMALL"
  | "CATALOGUE_IMAGE_TOO_LARGE_PIXELS"
  | "DOCUMENT_FILE_SIGNATURE_INVALID";

export class CatalogueImageError extends Error {
  constructor(public readonly code: CatalogueImageErrorCode) {
    super(code);
  }
}

export type ProcessedCatalogueImage = Record<
  CatalogueImageSize,
  { bytes: Buffer; width: number; height: number }
>;

const decodeOptions = {
  limitInputPixels: catalogueImageRules.maxInputPixels,
  failOn: "error",
} as const;

export async function processCatalogueImage(
  original: Buffer,
): Promise<ProcessedCatalogueImage> {
  let metadata: Metadata;
  try {
    metadata = await sharp(original, { limitInputPixels: false }).metadata();
  } catch {
    throw new CatalogueImageError("DOCUMENT_FILE_SIGNATURE_INVALID");
  }
  // Header dimensions, checked before any pixel is decoded (decompression bomb); oriented as displayed.
  const { width, height } = metadata.autoOrient ?? metadata;
  if (!width || !height)
    throw new CatalogueImageError("DOCUMENT_FILE_SIGNATURE_INVALID");
  if (width * height > catalogueImageRules.maxInputPixels)
    throw new CatalogueImageError("CATALOGUE_IMAGE_TOO_LARGE_PIXELS");
  if (
    width < catalogueImageRules.minWidth ||
    height < catalogueImageRules.minHeight
  )
    throw new CatalogueImageError("CATALOGUE_IMAGE_TOO_SMALL");

  const { large, card } = catalogueImageSizes;
  try {
    // One crop for both sizes, so the card shows exactly the large framing.
    const cropped = await sharp(original, decodeOptions)
      .rotate()
      .resize(large.width, large.height, {
        fit: "cover",
        position: "attention",
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const raw = {
      raw: {
        width: cropped.info.width,
        height: cropped.info.height,
        channels: cropped.info.channels,
      },
    };
    const [largeBytes, cardBytes] = await Promise.all([
      sharp(cropped.data, raw).webp({ quality: 82 }).toBuffer(),
      sharp(cropped.data, raw)
        .resize(card.width, card.height)
        .webp({ quality: 80 })
        .toBuffer(),
    ]);
    return {
      large: { bytes: largeBytes, ...large },
      card: { bytes: cardBytes, ...card },
    };
  } catch (error) {
    if (error instanceof Error && /pixel limit/i.test(error.message))
      throw new CatalogueImageError("CATALOGUE_IMAGE_TOO_LARGE_PIXELS");
    throw new CatalogueImageError("DOCUMENT_FILE_SIGNATURE_INVALID");
  }
}
