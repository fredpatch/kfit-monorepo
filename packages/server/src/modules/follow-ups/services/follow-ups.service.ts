import { followUpTypes, type FollowUpErrorCode, type FollowUpResponse, type FollowUpQueueResponse, type FollowUpType } from "@kfit/shared";
import { parseLifecycleDate } from "../../subscriptions/services/subscription-lifecycle.policy.js";
import { validCadence } from "./follow-up-cadence.policy.js";
export type FollowUpActor = { userId: string; requestId: string; ipAddress: string | null; userAgent: string | null };
export type FollowUpCommand = { action: "read" } | { action: "queue" } | { action: "complete" } | { action: "cancel"; reason: string }
  | { action: "cadence"; frequencyDays: number | null }
  | { action: "create"; followUpType: FollowUpType; occurredAt: Date; note: string | null; nextAction: string | null; nextActionAt: Date | null };
export type FollowUpResult = { ok: true; body: FollowUpResponse | FollowUpQueueResponse } | { ok: false; error: FollowUpErrorCode };
export const followUpFailure = (error: FollowUpErrorCode): FollowUpResult => ({ ok: false, error });
export interface FollowUpsRepository { execute(id: string, command: FollowUpCommand, actor: FollowUpActor): Promise<FollowUpResult> }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields: Record<FollowUpCommand["action"], string[]> = { read: [], queue: [], complete: [], cancel: ["reason"], cadence: ["frequencyDays"], create: ["followUpType", "occurredAt", "note", "nextAction", "nextActionAt"] };
export class FollowUpsService {
  constructor(private readonly repository: FollowUpsRepository) {}
  async execute(id: string, action: FollowUpCommand["action"], body: unknown, actor: FollowUpActor): Promise<FollowUpResult> {
    if (action !== "queue" && !uuid.test(id) || !body || typeof body !== "object" || Array.isArray(body)) return followUpFailure("FOLLOW_UP_INVALID_INPUT");
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some(key => !fields[action].includes(key))) return followUpFailure("FOLLOW_UP_INVALID_INPUT");
    let command: FollowUpCommand;
    if (action === "create") {
      const type = followUpTypes.find(type => type === input.followUpType), occurredAt = parseLifecycleDate(input.occurredAt);
      if (!type || !occurredAt || input.note !== undefined && input.note !== null && (typeof input.note !== "string" || input.note.length > 4000)
        || input.nextAction !== undefined && input.nextAction !== null && (typeof input.nextAction !== "string" || input.nextAction.length > 2000)) return followUpFailure("FOLLOW_UP_INVALID_INPUT");
      const nextAction = typeof input.nextAction === "string" ? input.nextAction.trim() : null;
      const pairSupplied = input.nextAction !== undefined && input.nextAction !== null || input.nextActionAt !== undefined && input.nextActionAt !== null;
      if (pairSupplied && (!nextAction || input.nextActionAt === undefined || input.nextActionAt === null)) return followUpFailure("FOLLOW_UP_NEXT_ACTION_PAIR_REQUIRED");
      const nextActionAt = pairSupplied ? parseLifecycleDate(input.nextActionAt) : null;
      if (pairSupplied && (!nextActionAt || nextActionAt <= occurredAt)) return followUpFailure("FOLLOW_UP_NEXT_ACTION_DATE_INVALID");
      command = { action, followUpType: type, occurredAt, note: typeof input.note === "string" ? input.note.trim() || null : null, nextAction, nextActionAt };
    } else if (action === "cadence") {
      if (input.frequencyDays !== null && !validCadence(input.frequencyDays)) return followUpFailure("FOLLOW_UP_CADENCE_INVALID");
      command = { action, frequencyDays: input.frequencyDays };
    } else if (action === "cancel") {
      if (typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 2000) return followUpFailure("FOLLOW_UP_INVALID_INPUT"); command = { action, reason: input.reason.trim() };
    } else command = { action };
    return this.repository.execute(id, command, actor);
  }
}
