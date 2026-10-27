import { and, eq, inArray } from "drizzle-orm";
import type { db as appDb } from "../../../db/client.js";
import {
  medicalClearanceRecords,
  onboardingItems,
} from "../../../db/schema/onboarding.js";
import { medicalAlwaysRequired } from "../services/onboarding.service.js";

type Tx = Parameters<Parameters<typeof appDb.transaction>[0]>[0];
/** Same open statuses the start gate treats as blocking (subscriptions.repository.ts). */
export const activeMedicalStatuses = [
  "required",
  "pending",
  "awaiting_document",
  "under_review",
] as const;
/** Trigger of a requirement held by the offer rules, as opposed to `questionnaire:<id>` for a risk flag. */
export const policyMedicalTrigger = "service_policy";

/**
 * CAT-03 D4/D5: the offer's « required » medical policy holds one open requirement without any risk flag.
 * The blocking « medical_clearance » item mirrors the open requirements, exactly as in the risk-flag flow.
 * Lifting the policy closes only the requirement it opened; risk-flag requirements stay. Caller holds the subscription row lock.
 */
export async function syncPolicyMedicalRequirement(
  tx: Tx,
  subscriptionId: string,
  policy: string | null,
  audit: (
    eventType: string,
    metadata: Record<string, string | number>,
  ) => Promise<unknown>,
): Promise<void> {
  const open = await tx
    .select()
    .from(medicalClearanceRecords)
    .where(
      and(
        eq(medicalClearanceRecords.subscriptionId, subscriptionId),
        inArray(medicalClearanceRecords.status, [...activeMedicalStatuses]),
      ),
    )
    .for("update");
  let stillOpen = open.length;
  if (medicalAlwaysRequired(policy) && open.length === 0) {
    const [record] = await tx
      .insert(medicalClearanceRecords)
      .values({
        subscriptionId,
        status: "required",
        triggerSource: policyMedicalTrigger,
      })
      .returning({ id: medicalClearanceRecords.id });
    if (!record)
      throw new Error("Medical requirement insert did not return a row");
    await audit("medical_clearance.required", {
      medicalClearanceRecordId: record.id,
      triggerSource: policyMedicalTrigger,
    });
    stillOpen = 1;
  } else if (!medicalAlwaysRequired(policy)) {
    const held = open.filter(
      (record) => record.triggerSource === policyMedicalTrigger,
    );
    if (held.length) {
      await tx
        .update(medicalClearanceRecords)
        .set({ status: "waived" })
        .where(
          inArray(
            medicalClearanceRecords.id,
            held.map((record) => record.id),
          ),
        );
      await audit("medical_clearance.requirement_lifted", {
        triggerSource: policyMedicalTrigger,
        count: held.length,
      });
      stillOpen -= held.length;
    }
  }
  const [item] = await tx
    .select()
    .from(onboardingItems)
    .where(
      and(
        eq(onboardingItems.subscriptionId, subscriptionId),
        eq(onboardingItems.itemType, "medical_clearance"),
      ),
    );
  if (stillOpen > 0 && (item?.status !== "pending" || !item.isBlocking)) {
    await tx
      .insert(onboardingItems)
      .values({
        subscriptionId,
        itemType: "medical_clearance",
        label: "Validation médicale requise",
        status: "pending",
        isBlocking: true,
      })
      .onConflictDoUpdate({
        target: [onboardingItems.subscriptionId, onboardingItems.itemType],
        set: {
          status: "pending",
          isBlocking: true,
          completedAt: null,
          waivedAt: null,
          waiverReason: null,
          updatedAt: new Date(),
        },
      });
  } else if (stillOpen === 0 && item?.status === "pending") {
    // A medical item can be neither completed nor waived by the coach, so with no open requirement it must go.
    await tx.delete(onboardingItems).where(eq(onboardingItems.id, item.id));
  }
}
