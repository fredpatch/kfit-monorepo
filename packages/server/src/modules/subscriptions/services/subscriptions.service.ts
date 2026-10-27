import type {
  SubscriptionCommand,
  SubscriptionDetail,
  SubscriptionErrorCode,
} from "@kfit/shared";
import { parseLifecycleDate } from "./subscription-lifecycle.policy.js";

export type LifecycleCommand = {
  action: "read" | SubscriptionCommand;
  reason?: string;
  revisedEndDate?: Date | null;
  plannedStartDate?: Date;
  overrideOutstandingComponents?: boolean;
};
export type LifecycleActor = {
  userId: string;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};
export type LifecycleResult =
  | { status: "ok"; subscription: SubscriptionDetail }
  | { status: "error"; error: SubscriptionErrorCode };
export interface SubscriptionsRepository {
  execute(
    id: string,
    command: LifecycleCommand,
    actor: LifecycleActor,
  ): Promise<LifecycleResult>;
}
export const failure = (error: SubscriptionErrorCode): LifecycleResult => ({
  status: "error",
  error,
});
const fields: Record<LifecycleCommand["action"], readonly string[]> = {
  read: [],
  activate: [],
  pause: ["reason"],
  resume: ["revisedEndDate"],
  "completion-due": ["reason"],
  complete: ["overrideOutstandingComponents", "overrideReason"],
  "resume-active": ["reason", "revisedEndDate"],
  cancel: ["reason"],
  renew: ["plannedStartDate"],
};
export class SubscriptionsService {
  constructor(private readonly repository: SubscriptionsRepository) {}
  async execute(
    id: string,
    action: LifecycleCommand["action"],
    body: unknown,
    actor: LifecycleActor,
  ): Promise<LifecycleResult> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    )
      return failure("SUBSCRIPTION_INVALID_INPUT");
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !fields[action].includes(key)))
      return failure("SUBSCRIPTION_INVALID_INPUT");
    const command: LifecycleCommand = { action };
    const reasonKey = action === "complete" ? "overrideReason" : "reason";
    if (input[reasonKey] !== undefined) {
      if (
        typeof input[reasonKey] !== "string" ||
        input[reasonKey].length > 2000
      )
        return failure("SUBSCRIPTION_INVALID_INPUT");
      command.reason = input[reasonKey].trim();
    }
    if (
      ["pause", "cancel", "resume-active"].includes(action) &&
      !command.reason
    )
      return failure("SUBSCRIPTION_INVALID_INPUT");
    if (action === "complete") {
      if (typeof input.overrideOutstandingComponents !== "boolean")
        return failure("SUBSCRIPTION_INVALID_INPUT");
      command.overrideOutstandingComponents =
        input.overrideOutstandingComponents;
      if (input.overrideOutstandingComponents && !command.reason)
        return failure("SUBSCRIPTION_COMPLETION_REASON_REQUIRED");
    }
    if (input.revisedEndDate !== undefined && input.revisedEndDate !== null) {
      const date = parseLifecycleDate(input.revisedEndDate);
      if (!date) return failure("SUBSCRIPTION_RESUME_DATE_INVALID");
      command.revisedEndDate = date;
    }
    if (action === "renew") {
      const date = parseLifecycleDate(input.plannedStartDate);
      if (!date) return failure("SUBSCRIPTION_INVALID_INPUT");
      command.plannedStartDate = date;
    }
    return this.repository.execute(id, command, actor);
  }
}
