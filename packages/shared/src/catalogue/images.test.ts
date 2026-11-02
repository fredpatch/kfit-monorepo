import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogueDeliverabilityRules,
  type CatalogueServiceImage,
} from "./contracts.js";
import {
  catalogueCover,
  catalogueImageSrcSet,
  catalogueImageUrls,
  catalogueMissingRecommendations,
  catalogueRecommendations,
  decodeCatalogueImageAlt,
  encodeCatalogueImageAlt,
  normalizeCatalogueImageAlt,
  parseCatalogueImageFile,
} from "./images.js";

const imageId = "0b6c3a52-6f0e-4d5e-9a43-2a1f0c9d8e71";
const image: CatalogueServiceImage = {
  id: imageId,
  altText: "La coach prépare une assiette équilibrée",
  width: 1600,
  height: 1000,
  urls: catalogueImageUrls("public", imageId),
  updatedAt: "2026-11-02T08:00:00.000Z",
};

test("CAT-04 image URLs carry only the image id and the size", () => {
  assert.deepEqual(catalogueImageUrls("public", imageId), {
    card: `/public/catalogue/images/${imageId}-card.webp`,
    large: `/public/catalogue/images/${imageId}-large.webp`,
  });
  assert.equal(
    catalogueImageUrls("admin", imageId).large,
    `/admin/catalogue/images/${imageId}-large.webp`,
  );
  assert.deepEqual(parseCatalogueImageFile(`${imageId}-card.webp`), {
    imageId,
    size: "card",
  });
  for (const file of [
    `${imageId}-huge.webp`,
    `${imageId}-card.jpg`,
    `${imageId.toUpperCase()}-card.webp`,
    `../${imageId}-card.webp`,
    "card.webp",
  ])
    assert.equal(parseCatalogueImageFile(file), null, file);
});

test("CAT-04 description: UTF-8 round trip through the header, 150 characters max", () => {
  const alt = "Séance « gainage » à l'aube, côté plage 🌅";
  const header = encodeCatalogueImageAlt(alt);
  assert.match(header, /^[A-Za-z0-9_-]+$/);
  assert.equal(decodeCatalogueImageAlt(header), alt);
  assert.equal(decodeCatalogueImageAlt("not base64!"), null);
  assert.equal(
    decodeCatalogueImageAlt(encodeCatalogueImageAlt("") || ""),
    null,
  );
  assert.equal(decodeCatalogueImageAlt("_w"), null, "invalid UTF-8");

  assert.equal(normalizeCatalogueImageAlt("  deux   mots "), "deux mots");
  assert.equal(normalizeCatalogueImageAlt("   "), null);
  assert.equal(normalizeCatalogueImageAlt(42), null);
  assert.equal(normalizeCatalogueImageAlt("é".repeat(150)), "é".repeat(150));
  assert.equal(normalizeCatalogueImageAlt("é".repeat(151)), null);
});

test("CAT-04 srcset and cover fallback", () => {
  assert.equal(
    catalogueImageSrcSet(image),
    `/public/catalogue/images/${imageId}-card.webp 640w, /public/catalogue/images/${imageId}-large.webp 1600w`,
  );
  assert.deepEqual(catalogueCover({ image }), { kind: "photo", image });
  assert.deepEqual(catalogueCover({ image: null }), { kind: "family" });
});

test("CAT-04 the photo is a recommendation, never a deliverability rule (publish is not blocked)", () => {
  assert.deepEqual(catalogueMissingRecommendations({ image: null }), [
    "image_missing",
  ]);
  assert.deepEqual(catalogueMissingRecommendations({ image }), []);
  for (const recommendation of catalogueRecommendations)
    assert.equal(
      (catalogueDeliverabilityRules as readonly string[]).includes(
        recommendation,
      ),
      false,
    );
});
