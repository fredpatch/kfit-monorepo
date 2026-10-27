import assert from "node:assert/strict";
import test from "node:test";
import type {
  AdminServiceRequestSummary,
  FollowUpQueueItem,
  OnboardingDetail,
} from "@kfit/shared";
import { buildTodayTasks } from "../services/today.policy.js";

const now = new Date("2026-10-22T09:00:00Z");
const endOfDay = new Date("2026-10-22T22:59:59.999Z");
const follow = (
  id: string,
  state: "healthy" | "due" | "overdue",
  days: number | null,
  due: string,
): FollowUpQueueItem => ({
  subscriptionId: id,
  reference: `SUB-${id}`,
  customer: { id: `c-${id}`, fullName: `Client ${id}` },
  openFollowUpCount: 0,
  overdueNextActionCount: 0,
  effectiveCadenceDays: 7,
  cadenceSource: "service",
  monitoringDisabled: false,
  cadenceEligible: true,
  clockFrozen: false,
  latestMeaningfulActivityAt: "2026-10-10T09:00:00Z",
  latestActivityType: "activation",
  nextFollowUpDueAt: due,
  cadenceState: state,
  overdueByDays: days,
  activeElapsedMs: 0,
});
const request = (
  id: string,
  status: AdminServiceRequestSummary["status"],
  submittedAt: string,
  nextActionAt: string | null = null,
): AdminServiceRequestSummary => ({
  id,
  reference: `REQ-${id}`,
  status,
  submittedAt,
  prospect: {
    id: `p-${id}`,
    fullName: `Prospect ${id}`,
    whatsapp: "+24100000000",
    email: null,
  },
  service: { id: "s", name: "Offre" },
  requestedVariant: null,
  lastContactAttemptAt: null,
  nextActionAt,
});
const onboarding = (overrides: {
  expired?: boolean;
  canReady?: boolean;
  initialized?: boolean;
  items?: Array<{ label: string; status: string; isBlocking: boolean }>;
}): OnboardingDetail =>
  ({
    subscription: {
      id: "x",
      reference: "SUB-x",
      status: "onboarding",
      plannedStartDate: "2026-10-30T00:00:00Z",
      capacityReservedUntil: "2026-10-21T00:00:00Z",
    },
    service: { id: "s", name: "Offre", variantId: null, variantName: null },
    policy: { source: "service", questionnaireRequired: false },
    capacity: {
      mode: "limited",
      limit: 4,
      scope: "service",
      occupied: 1,
      expired: overrides.expired ?? false,
      valid: !overrides.expired,
    },
    initialized: overrides.initialized ?? true,
    onboardingState: "blocked",
    canReady: overrides.canReady ?? false,
    items: (overrides.items ?? []).map((i, n) => ({
      id: `i${n}`,
      itemType: "t",
      label: i.label,
      status: i.status,
      isBlocking: i.isBlocking,
      completedAt: null,
      waivedAt: null,
      waiverReason: null,
      owner: "coach",
      canComplete: true,
      canWaive: true,
    })),
  }) as unknown as OnboardingDetail;

test("« À traiter » follows the validated order and within-kind ordering", () => {
  const tasks = buildTodayTasks({
    now,
    endOfDay,
    followUps: [
      follow("a", "overdue", 2, "2026-10-20T09:00:00Z"),
      follow("b", "overdue", 6, "2026-10-16T09:00:00Z"),
      follow("c", "healthy", null, "2026-10-22T18:00:00Z"),
      follow("d", "healthy", null, "2026-10-25T18:00:00Z"),
    ],
    offerOfSubscription: new Map([["a", "Offre A"]]),
    requests: [
      request("r2", "submitted", "2026-10-22T07:00:00Z"),
      request("r1", "submitted", "2026-10-21T07:00:00Z"),
      request(
        "r3",
        "contacting",
        "2026-10-20T07:00:00Z",
        "2026-10-22T08:00:00Z",
      ),
      request(
        "r4",
        "contacting",
        "2026-10-20T07:00:00Z",
        "2026-10-23T08:00:00Z",
      ),
    ],
    preparations: [
      {
        subscriptionId: "p1",
        customerId: "c1",
        customerName: "P1",
        offer: "O",
        detail: onboarding({
          items: [
            { label: "Paiement", status: "completed", isBlocking: true },
            { label: "Conditions", status: "pending", isBlocking: true },
          ],
        }),
      },
      {
        subscriptionId: "p2",
        customerId: "c2",
        customerName: "P2",
        offer: "O",
        detail: onboarding({ canReady: true }),
      },
      {
        subscriptionId: "p3",
        customerId: "c3",
        customerName: "P3",
        offer: "O",
        detail: onboarding({ expired: true }),
      },
    ],
    completions: [
      {
        subscriptionId: "e1",
        customerId: "c9",
        customerName: "E1",
        offer: "O",
        plannedEndDate: "2026-10-23T00:00:00Z",
      },
    ],
  });
  assert.deepEqual(
    tasks.map((t) => `${t.kind}:${t.subscriptionId ?? t.requestId}`),
    [
      "follow_up_overdue:b",
      "follow_up_overdue:a",
      "follow_up_due:c",
      "request_new:r1",
      "request_new:r2",
      "request_follow_up:r3",
      "preparation_expired:p3",
      "preparation_ready:p2",
      "preparation_waiting:p1",
      "completion_due:e1",
    ],
  );
  assert.equal(tasks[0]?.days, 6);
  assert.equal(tasks[1]?.offer, "Offre A");
  assert.equal(
    tasks.find((t) => t.kind === "preparation_waiting")?.item,
    "Conditions",
  );
});
