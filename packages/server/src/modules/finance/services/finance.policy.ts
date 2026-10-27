import type { FinancialStatus, FinanceInstallmentStatus } from "@kfit/shared";
import { parseLifecycleDate } from "../../subscriptions/services/subscription-lifecycle.policy.js";

export const maximumXaf = 2_147_483_647;
export class FinanceInvariantError extends Error {
  constructor() {
    super("Invalid finance state");
  }
}
export const validXaf = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= maximumXaf;
export function sumXaf(values: readonly number[]): number {
  let total = 0n;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) throw new FinanceInvariantError();
    total += BigInt(value);
  }
  if (total < 0n || total > BigInt(maximumXaf))
    throw new FinanceInvariantError();
  return Number(total);
}
export function financeDate(value: unknown): Date | null {
  const date = parseLifecycleDate(value);
  if (
    !date ||
    typeof value !== "string" ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    (value[16] === ":" && Number(value.slice(17, 19)) > 59)
  )
    return null;
  return date;
}
export function installmentStatus(
  amountXaf: number,
  paidXaf: number,
  dueDate: Date,
  now: Date,
): FinanceInstallmentStatus {
  if (paidXaf === amountXaf) return "paid";
  if (dueDate < now) return "overdue";
  if (paidXaf > 0) return "partially_paid";
  return dueDate.getTime() === now.getTime() ? "due" : "upcoming";
}
export function financialStatus(agreed: number, paid: number): FinancialStatus {
  return paid === agreed ? "paid" : paid === 0 ? "unpaid" : "partially_paid";
}
export function allocateFifo(
  amountXaf: number,
  installments: readonly {
    id: string;
    dueDate: string;
    sequenceNumber: number;
    remainingXaf: number;
  }[],
  reverse = false,
) {
  const ordered = [...installments].sort(
    (a, b) =>
      (Date.parse(a.dueDate) - Date.parse(b.dueDate) ||
        a.sequenceNumber - b.sequenceNumber ||
        a.id.localeCompare(b.id)) * (reverse ? -1 : 1),
  );
  let outstanding = amountXaf;
  const allocations: Array<{ installmentId: string; amountXaf: number }> = [];
  for (const item of ordered) {
    if (!outstanding) break;
    const amount = Math.min(outstanding, item.remainingXaf);
    if (amount > 0) {
      allocations.push({ installmentId: item.id, amountXaf: amount });
      outstanding -= amount;
    }
  }
  if (outstanding !== 0) throw new FinanceInvariantError();
  return allocations;
}
