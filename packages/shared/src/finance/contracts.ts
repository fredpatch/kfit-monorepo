export const financePaymentMethods = [
  "cash",
  "bank_transfer",
  "mobile_money",
] as const;
export type FinancePaymentMethod = (typeof financePaymentMethods)[number];
export const financeEventTypes = [
  "payment_received",
  "payment_correction",
] as const;
export type FinanceEventType = (typeof financeEventTypes)[number];
export type FinancePlanStatus =
  | "draft"
  | "active"
  | "superseded"
  | "settled"
  | "cancelled";
export type FinanceInstallmentStatus =
  | "upcoming"
  | "due"
  | "partially_paid"
  | "paid"
  | "overdue";
export type FinancialStatus = "unpaid" | "partially_paid" | "paid";
export const financeApiRoutes = {
  detail: "/admin/subscriptions/:subscriptionId/finance",
  plans: "/admin/subscriptions/:subscriptionId/payment-plans",
  activate: "/admin/payment-plans/:paymentPlanId/activate",
  revise: "/admin/payment-plans/:paymentPlanId/revise",
  cancel: "/admin/payment-plans/:paymentPlanId/cancel",
  payments: "/admin/subscriptions/:subscriptionId/payments",
  correct: "/admin/payment-events/:paymentEventId/correct",
} as const;
export const financeErrorCodes = [
  "FINANCE_NOT_FOUND",
  "FINANCE_INVALID_INPUT",
  "FINANCE_PLAN_ALREADY_ACTIVE",
  "FINANCE_PLAN_TOTAL_MISMATCH",
  "FINANCE_INSTALLMENTS_TOTAL_MISMATCH",
  "FINANCE_INVALID_STATE",
  "FINANCE_PAYMENT_EXCEEDS_OUTSTANDING",
  "FINANCE_DUPLICATE_PAYMENT",
  "FINANCE_CORRECTION_INVALID",
  "FINANCE_CONCURRENCY_CONFLICT",
  "FINANCE_ADMIN_FORBIDDEN",
  "FINANCE_ROUTE_UNEXPECTED_FAILURE",
] as const;
export type FinanceErrorCode = (typeof financeErrorCodes)[number];
export type FinanceInstallmentInput = { amountXaf: number; dueDate: string };
export type CreateFinancePlanInput = {
  installments: FinanceInstallmentInput[];
};
export type RecordFinancePaymentInput = {
  amountXaf: number;
  paymentMethod: FinancePaymentMethod;
  occurredAt: string;
  externalReference?: string | null;
  idempotencyKey: string;
};
export type CorrectFinancePaymentInput = {
  amountXaf: number;
  occurredAt: string;
  idempotencyKey: string;
};
export type FinanceAllocation = {
  id: string;
  subscriptionId: string;
  installmentId: string;
  paymentPlanId: string;
  amountXaf: number;
  createdAt: string;
};
export type FinancePaymentEvent = {
  id: string;
  eventType: FinanceEventType;
  amountXaf: number;
  currency: "XAF";
  paymentMethod: FinancePaymentMethod;
  occurredAt: string;
  confirmedAt: string;
  confirmedByUserId: string | null;
  correctionOfEventId: string | null;
  externalReference: string | null;
  correctableXaf: number;
  allocations: FinanceAllocation[];
};
export type FinanceInstallment = {
  id: string;
  sequenceNumber: number;
  amountXaf: number;
  dueDate: string;
  paidXaf: number;
  remainingXaf: number;
  effectiveStatus: FinanceInstallmentStatus;
};
export type FinancePlan = {
  id: string;
  totalExpectedXaf: number;
  status: FinancePlanStatus;
  revisedFromPlanId: string | null;
  createdAt: string;
  installments: FinanceInstallment[];
  availableCommands: Array<"activate" | "revise" | "cancel">;
};
export type FinanceDetail = {
  subscriptionId: string;
  subscriptionStatus: string;
  asOf: string;
  currency: "XAF";
  agreedAmountXaf: number;
  confirmedPaidXaf: number;
  remainingXaf: number;
  financialStatus: FinancialStatus;
  hasOverdueInstallment: boolean;
  activePaymentPlan: FinancePlan | null;
  plans: FinancePlan[];
  paymentHistory: FinancePaymentEvent[];
  scheduleRequiresRevision: boolean;
  canCreatePlan: boolean;
  canRecordPayment: boolean;
};
export type FinanceResponse = {
  finance: FinanceDetail;
  replayed?: boolean;
  paymentEventId?: string;
};
