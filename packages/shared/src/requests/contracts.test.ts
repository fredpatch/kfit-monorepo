import assert from "node:assert/strict";
import test from "node:test";
import {
  adminRequestAllowedTransitions,
  adminRequestsApiRoutes,
  contactAttemptChannels,
  contactAttemptDirections,
  contactAttemptOutcomes,
  requestErrorCodes,
  requestsApiRoutes,
  serviceRequestStatuses,
  type AdminRequestDetailResponse,
  type AdminRequestsQueueResponse,
  type CreateContactAttemptResponse,
  type CreateQualificationReviewResponse,
  type RequestStatusTransitionResponse,
  type RequestSubmissionResponse,
} from "./contracts.js";

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
    "REQUEST_ADMIN_FORBIDDEN",
    "REQUEST_NOT_FOUND",
    "REQUEST_INVALID_TRANSITION",
    "REQUEST_CONTACT_ATTEMPT_INVALID_INPUT",
    "REQUEST_STATUS_INVALID_INPUT",
    "REQUEST_QUALIFICATION_REVIEW_INVALID_INPUT",
  ]);
});

test("admin requests shared contracts expose stable routes", () => {
  assert.deepEqual(adminRequestsApiRoutes, {
    queue: "/admin/requests",
    detail: "/admin/requests/:requestId",
    contactAttempts: "/admin/requests/:requestId/contact-attempts",
    status: "/admin/requests/:requestId/status",
    qualificationReview: "/admin/requests/:requestId/qualification-review",
  });
});

test("serviceRequestStatuses lists the full state-machine vocabulary used for trust-boundary validation", () => {
  assert.deepEqual(serviceRequestStatuses, [
    "submitted",
    "contacting",
    "qualification_in_progress",
    "qualified",
    "qualified_with_conditions",
    "waitlisted",
    "rejected",
    "abandoned",
    "converted",
    "closed_duplicate",
  ]);
});

test("admin request allowed-transition map only exposes the S3.3-approved subset", () => {
  assert.deepEqual(adminRequestAllowedTransitions, {
    submitted: ["contacting"],
    contacting: ["qualification_in_progress", "abandoned"],
    qualification_in_progress: ["abandoned"],
    abandoned: ["qualification_in_progress"],
  });

  // S3.4/S3.5-owned outcomes must never appear as a reachable target in S3.3.
  const forbiddenTargets = ["qualified", "qualified_with_conditions", "rejected", "waitlisted", "converted", "closed_duplicate"];
  for (const targets of Object.values(adminRequestAllowedTransitions)) {
    for (const target of targets) {
      assert.ok(!forbiddenTargets.includes(target), `${target} must not be reachable from S3.3`);
    }
  }
});

test("contact attempt vocabularies use the approved naming", () => {
  assert.deepEqual(contactAttemptChannels, ["whatsapp", "phone_call", "sms", "email", "other"]);
  assert.deepEqual(contactAttemptDirections, ["outbound", "inbound"]);
  assert.deepEqual(contactAttemptOutcomes, ["reached", "no_answer", "invalid_contact", "callback_requested", "not_interested", "other"]);
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

test("admin requests shared contracts type-check queue, detail, contact-attempt and status response shapes", () => {
  const summary = {
    id: "11111111-1111-1111-1111-111111111111",
    reference: "REQ-ABC123",
    status: "contacting" as const,
    submittedAt: "2026-09-17T08:00:00.000Z",
    prospect: { id: "22222222-2222-2222-2222-222222222222", fullName: "Ada Lovelace", whatsapp: "+24100000001", email: null },
    service: { id: "33333333-3333-3333-3333-333333333333", name: "Coaching" },
    requestedVariant: null,
    lastContactAttemptAt: null,
    nextActionAt: null,
  };

  const queueResponse: AdminRequestsQueueResponse = { requests: [summary] };
  assert.equal(queueResponse.requests[0]?.status, "contacting");

  const detailResponse: AdminRequestDetailResponse = {
    request: {
      ...summary,
      objective: null,
      preferredStartDate: null,
      message: null,
      duplicateOfRequestId: null,
      qualificationAvailableVariants: [{ id: "55555555-5555-5555-5555-555555555555", name: "Starter" }],
      contactAttempts: [
        {
          id: "44444444-4444-4444-4444-444444444444",
          channel: "phone_call",
          direction: "outbound",
          outcome: "callback_requested",
          note: null,
          occurredAt: "2026-09-17T09:00:00.000Z",
          nextActionAt: null,
          createdByUserId: null,
        },
      ],
      qualificationReviews: [],
    },
  };
  assert.equal(detailResponse.request.contactAttempts[0]?.outcome, "callback_requested");

  const contactAttemptResponse: CreateContactAttemptResponse = {
    contactAttempt: detailResponse.request.contactAttempts[0]!,
    request: summary,
  };
  assert.equal(contactAttemptResponse.contactAttempt.channel, "phone_call");

  const statusResponse: RequestStatusTransitionResponse = { request: { ...summary, status: "qualification_in_progress" } };
  assert.equal(statusResponse.request.status, "qualification_in_progress");

  const qualificationReviewResponse: CreateQualificationReviewResponse = {
    qualificationReview: {
      id: "66666666-6666-6666-6666-666666666666",
      version: 1,
      outcome: "qualified",
      finalVariantId: "55555555-5555-5555-5555-555555555555",
      agreedPriceXaf: 50000,
      targetStartDate: null,
      suitabilityNote: null,
      conditions: null,
      blockers: null,
      createdByUserId: null,
      createdAt: "2026-09-17T10:00:00.000Z",
      supersededAt: null,
    },
    request: { ...summary, status: "qualified" },
  };
  assert.equal(qualificationReviewResponse.qualificationReview.version, 1);
});
