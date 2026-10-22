import assert from "node:assert/strict";
import test from "node:test";
import { quoteApiRoutes, quoteDecisions, quoteErrorCodes } from "./contracts.js";
test("quotes expose only explicit structured customer decisions", () => {
  assert.deepEqual(quoteDecisions, ["accepted", "declined", "changes_requested"]);
  assert.equal(new Set(quoteErrorCodes).size, quoteErrorCodes.length);
});
test("quotes separate response and synchronization named commands", () => {
  assert.equal(quoteApiRoutes.respond, "/public/quotes/:token/respond");
  assert.equal(quoteApiRoutes.synchronize, "/admin/quote-versions/:versionId/synchronize");
  assert.equal(Object.values(quoteApiRoutes).length, 14);
});
