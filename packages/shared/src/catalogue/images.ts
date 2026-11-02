import {
  catalogueApiRoutes,
  catalogueImageRules,
  catalogueImageSizes,
  type CatalogueImageSize,
  type CatalogueServiceImage,
} from "./contracts.js";

/* CAT-04 pure helpers shared by the server routes, the public pages and the admin sheet. */

export type CatalogueImageScope = "public" | "admin";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function catalogueImageUrl(
  scope: CatalogueImageScope,
  imageId: string,
  size: CatalogueImageSize,
): string {
  const route =
    scope === "public"
      ? catalogueApiRoutes.publicImage
      : catalogueApiRoutes.adminImage;
  return route.replace(":file", `${imageId}-${size}.webp`);
}

export function catalogueImageUrls(
  scope: CatalogueImageScope,
  imageId: string,
): Record<CatalogueImageSize, string> {
  return {
    card: catalogueImageUrl(scope, imageId, "card"),
    large: catalogueImageUrl(scope, imageId, "large"),
  };
}

/** `<imageId>-<card|large>.webp` → its parts; anything else (unknown size, other extension) → null. */
export function parseCatalogueImageFile(
  file: string,
): { imageId: string; size: CatalogueImageSize } | null {
  const match = /^(.{36})-(card|large)\.webp$/.exec(file);
  if (!match || !uuidPattern.test(match[1]!)) return null;
  return { imageId: match[1]!, size: match[2] as CatalogueImageSize };
}

/** C7: trimmed, 1 to 150 characters (counted as the user sees them), else null. */
export function normalizeCatalogueImageAlt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const alt = value.replace(/\s+/g, " ").trim();
  const length = [...alt].length;
  return length >= 1 && length <= catalogueImageRules.altMaxLength ? alt : null;
}

/** K2: header-safe UTF-8 (base64url, no padding). */
export function encodeCatalogueImageAlt(alt: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(alt))
    binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Inverse of encodeCatalogueImageAlt; a malformed header or invalid UTF-8 → null. */
export function decodeCatalogueImageAlt(header: unknown): string | null {
  if (typeof header !== "string" || !/^[A-Za-z0-9_-]{1,1024}$/.test(header))
    return null;
  try {
    const binary = atob(header.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** `srcset` for `<img>`: the 640 px card and the 1600 px large file. */
export function catalogueImageSrcSet(image: CatalogueServiceImage): string {
  return `${image.urls.card} ${catalogueImageSizes.card.width}w, ${image.urls.large} ${catalogueImageSizes.large.width}w`;
}

/** C2: what the cover area shows - the photo, or the family colour + icon fallback. */
export function catalogueCover(service: {
  image: CatalogueServiceImage | null;
}): { kind: "photo"; image: CatalogueServiceImage } | { kind: "family" } {
  return service.image
    ? { kind: "photo", image: service.image }
    : { kind: "family" };
}

/** C2: « Avant publication » items that are recommended but never block publishing. */
export const catalogueRecommendations = ["image_missing"] as const;
export type CatalogueRecommendation = (typeof catalogueRecommendations)[number];

export function catalogueMissingRecommendations(service: {
  image: CatalogueServiceImage | null;
}): CatalogueRecommendation[] {
  return service.image ? [] : ["image_missing"];
}
