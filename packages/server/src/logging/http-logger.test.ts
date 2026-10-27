import assert from "node:assert/strict";
import test from "node:test";
import { redactRequestPath } from "./http-logger.js";

test("request paths never log public-link tokens or query strings", () => {
  assert.equal(
    redactRequestPath("/public/documents/s3cr3t-token/download"),
    "/public/documents/:token/download",
  );
  assert.equal(
    redactRequestPath("/public/quotes/s3cr3t-token"),
    "/public/quotes/:token",
  );
  assert.equal(
    redactRequestPath("/admin/customers/search?whatsapp=24100000000"),
    "/admin/customers/search",
  );
  assert.equal(
    redactRequestPath("/public/payment-proofs/"),
    "/public/payment-proofs/",
  );
  assert.equal(redactRequestPath("/auth/login"), "/auth/login");
});
