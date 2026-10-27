import assert from "node:assert/strict";
import test from "node:test";
import {
  documentApiRoutes,
  documentErrorCodes,
  documentStatuses,
  documentTypes,
} from "./contracts.js";
test("document contracts expose stable V1 vocabularies", () => {
  assert.deepEqual(documentTypes, [
    "meal_plan",
    "workout_plan",
    "progress_summary",
    "progress_photo",
    "other_personalized",
  ]);
  assert.ok(documentStatuses.includes("available"));
  assert.equal(new Set(documentErrorCodes).size, documentErrorCodes.length);
});
test("document routes separate admin and public surfaces", () => {
  assert.ok(
    Object.entries(documentApiRoutes)
      .filter(([k]) => !k.startsWith("public"))
      .every(([, v]) => v.startsWith("/admin/")),
  );
  assert.ok(documentApiRoutes.publicMeta.startsWith("/public/documents/"));
  assert.equal(
    documentApiRoutes.issueLink,
    "/admin/document-versions/:versionId/delivery-links",
  );
});
