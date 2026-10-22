import { financePaymentMethods, type FinancePaymentMethod, type FinanceErrorCode, type FinanceResponse } from "@kfit/shared";
import { financeDate, sumXaf, validXaf, FinanceInvariantError } from "./finance.policy.js";

export type FinanceActor = { userId: string; requestId: string; ipAddress: string | null; userAgent: string | null };
export type FinanceSchedule = Array<{ amountXaf: number; dueDate: Date }>;
export type FinanceCommand = { action: "read" } | { action: "create"; installments: FinanceSchedule } | { action: "revise"; installments: FinanceSchedule }
  | { action: "activate" } | { action: "cancel" }
  | { action: "record"; amountXaf: number; paymentMethod: FinancePaymentMethod; occurredAt: Date; externalReference: string | null; idempotencyKey: string }
  | { action: "correct"; amountXaf: number; occurredAt: Date; idempotencyKey: string };
export type FinanceResult = { ok: true; body: FinanceResponse } | { ok: false; error: FinanceErrorCode };
export const financeFailure = (error: FinanceErrorCode): FinanceResult => ({ ok: false, error });
export interface FinanceRepository { execute(id: string, command: FinanceCommand, actor: FinanceActor): Promise<FinanceResult> }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields: Record<FinanceCommand["action"], readonly string[]> = { read: [], create: ["installments"], revise: ["installments"], activate: [], cancel: [],
  record: ["amountXaf", "paymentMethod", "occurredAt", "externalReference", "idempotencyKey"], correct: ["amountXaf", "occurredAt", "idempotencyKey"] };
function object(input: unknown): input is Record<string, unknown> { return Boolean(input) && typeof input === "object" && !Array.isArray(input); }
export class FinanceService {
  constructor(private readonly repository: FinanceRepository) {}
  async execute(id: string, action: FinanceCommand["action"], body: unknown, actor: FinanceActor): Promise<FinanceResult> {
    if (!uuid.test(id) || !object(body) || Object.keys(body).some(key => !fields[action].includes(key))) return financeFailure("FINANCE_INVALID_INPUT");
    let command: FinanceCommand;
    if (action === "create" || action === "revise") {
      if (!Array.isArray(body.installments) || body.installments.length > 200) return financeFailure("FINANCE_INVALID_INPUT");
      const schedule: FinanceSchedule = [];
      for (const input of body.installments) {
        if (!object(input) || Object.keys(input).some(key => key !== "amountXaf" && key !== "dueDate") || !validXaf(input.amountXaf)) return financeFailure("FINANCE_INVALID_INPUT");
        const dueDate = financeDate(input.dueDate); if (!dueDate) return financeFailure("FINANCE_INVALID_INPUT");
        schedule.push({ amountXaf: input.amountXaf, dueDate });
      }
      try { sumXaf(schedule.map(item => item.amountXaf)); } catch (error) { if (error instanceof FinanceInvariantError) return financeFailure("FINANCE_INVALID_INPUT"); throw error; }
      command = { action, installments: schedule };
    } else if (action === "record" || action === "correct") {
      const occurredAt = financeDate(body.occurredAt);
      if (!validXaf(body.amountXaf) || !occurredAt || typeof body.idempotencyKey !== "string" || !uuid.test(body.idempotencyKey)) return financeFailure("FINANCE_INVALID_INPUT");
      if (action === "record") {
        const method = financePaymentMethods.find(method => method === body.paymentMethod);
        if (!method || body.externalReference !== undefined && body.externalReference !== null && typeof body.externalReference !== "string") return financeFailure("FINANCE_INVALID_INPUT");
        const externalReference = typeof body.externalReference === "string" ? body.externalReference.normalize("NFKC").trim() || null : null;
        if (externalReference && (externalReference.length > 200 || /[\u0000-\u001f\u007f]/.test(externalReference))) return financeFailure("FINANCE_INVALID_INPUT");
        command = { action, amountXaf: body.amountXaf, occurredAt, paymentMethod: method, externalReference, idempotencyKey: body.idempotencyKey.toLowerCase() };
      } else command = { action, amountXaf: body.amountXaf, occurredAt, idempotencyKey: body.idempotencyKey.toLowerCase() };
    } else command = { action };
    return this.repository.execute(id, command, actor);
  }
}
