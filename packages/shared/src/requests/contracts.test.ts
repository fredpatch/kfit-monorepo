import assert from "node:assert/strict";
import test from "node:test";
import { requestErrorCodes, requestsApiRoutes, type RequestSubmissionResponse } from "./contracts.js";

test("requests shared contracts expose a stable public submission route", () => {
  assert.deepEqual(requestsApiRoutes, {
    publicSubmit: "/requests",
  });

  assert.deepEqual(requestErrorCodes, [
    "REQUEST_ROUTE_UNEXPECTED_FAILURE",
    "REQUEST_INVALID_INPUT",
    "REQUEST_SERVICE_NOT_FOUND",
    "REQUEST_SERVICE_NOT_PUBLIC",
    "REQUEST_SERVICE_UNAVAILABLE",
    "REQUEST_SERVICE_ARCHIVED",
    "REQUEST_WAITLIST_REQUIRED",
    "REQUEST_VARIANT_INVALID",
    "REQUEST_RATE_LIMITED",
  ]);
});

test("requests shared contracts type-check submission response shape", () => {
  const response: RequestSubmissionResponse = {
    request: {
      id: "11111111-1111-1111-1111-111111111111",
      reference: "REQ-ABC123",
      status: "submitted",
      submittedAt: "2026-09-17T08:00:00.000Z",
    },
  };

  assert.equal(response.request.status, "submitted");
});
