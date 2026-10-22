import { customerAnalyticsPeriods, normalizeWhatsapp, type AdminCustomer, type AdminCustomerOverviewResponse, type AdminCustomerDetailResponse, type CustomerAnalytics, type CustomerAnalyticsPeriod } from "@kfit/shared";
import { computeCustomerAnalytics, selectFocusSubscription, type AnalyticsSource } from "./customer-analytics.policy.js";
import { computeCustomerOverview, type OverviewSource } from "./customer-overview.policy.js";

export type NormalizedCustomerInput = {
  fullName: string;
  whatsapp: string;
  email: string | null;
  city: string | null;
  country: string | null;
  preferredContactChannel: string;
};
export type CustomerActorContext = {
  userId: string;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};
export type CreateCustomerResult =
  | { status: "ok"; customer: AdminCustomer }
  | { status: "duplicate" }
  | { status: "invalid"; reason: string };
export interface CustomersRepository {
  listActive(): Promise<AdminCustomer[]>;
  searchActive(whatsapp: string): Promise<AdminCustomer[]>;
  createManual(input: NormalizedCustomerInput, actor: CustomerActorContext): Promise<Exclude<CreateCustomerResult, { status: "invalid" }>>;
  /** Active customer with all their subscriptions (any status), newest first. Null when unknown, archived or anonymized. */
  getDetail(customerId: string): Promise<AdminCustomerDetailResponse | null>;
  /** Raw rows for the client analytics (UX-4c). Null when the customer is unknown, archived or anonymized. */
  getAnalyticsSource(customerId: string): Promise<AnalyticsSource | null>;
  /** Raw rows for the clients overview (UX-5): active customers and their subscription activity. */
  getOverviewSource(now: Date): Promise<OverviewSource>;
}
export type CustomerAnalyticsResult =
  | { status: "ok"; analytics: CustomerAnalytics }
  | { status: "not_found" }
  | { status: "invalid"; reason: string };
export type CustomerDetailResult =
  | { status: "ok"; detail: AdminCustomerDetailResponse }
  | { status: "not_found" }
  | { status: "invalid"; reason: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}
function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  if (value.trim() === "") return null;
  return text(value, max) ?? undefined;
}
function phone(value: unknown): string | null {
  const raw = text(value, 30);
  return raw ? normalizeWhatsapp(raw) : null;
}

export class CustomersService {
  constructor(private readonly repository: CustomersRepository, private readonly clock: () => Date = () => new Date()) {}

  /** Read-only clients overview (UX-5): one row per active client + view counts. */
  async getOverview(): Promise<AdminCustomerOverviewResponse> {
    const now = this.clock();
    return computeCustomerOverview(await this.repository.getOverviewSource(now), now);
  }

  /** Read-only client analytics (UX-4c). Query: periode=30j|abonnement|tout (default 30j), abonnement=<subscription id of this customer>. */
  async getAnalytics(customerId: unknown, query: { periode?: unknown; abonnement?: unknown }): Promise<CustomerAnalyticsResult> {
    if (typeof customerId !== "string" || !uuidPattern.test(customerId)) return { status: "invalid", reason: "customer_id_invalid" };
    const period = query.periode === undefined ? "30j" : customerAnalyticsPeriods.find((p) => p === query.periode);
    if (!period) return { status: "invalid", reason: "period_invalid" };
    if (query.abonnement !== undefined && (typeof query.abonnement !== "string" || !uuidPattern.test(query.abonnement))) return { status: "invalid", reason: "subscription_id_invalid" };
    const source = await this.repository.getAnalyticsSource(customerId.toLowerCase());
    if (!source) return { status: "not_found" };
    const requested = typeof query.abonnement === "string" ? query.abonnement.toLowerCase() : null;
    const focus = selectFocusSubscription(source.subscriptions, requested);
    if (requested && !focus) return { status: "invalid", reason: "subscription_not_owned" };
    return { status: "ok", analytics: computeCustomerAnalytics(source, { period: period as CustomerAnalyticsPeriod, focus, now: this.clock() }) };
  }

  listActive(): Promise<AdminCustomer[]> {
    return this.repository.listActive();
  }

  /** Read-only client profile (UX-4). No business rule changes: it only aggregates existing rows. */
  async getDetail(customerId: unknown): Promise<CustomerDetailResult> {
    if (typeof customerId !== "string" || !uuidPattern.test(customerId)) return { status: "invalid", reason: "customer_id_invalid" };
    const detail = await this.repository.getDetail(customerId.toLowerCase());
    return detail ? { status: "ok", detail } : { status: "not_found" };
  }

  async search(whatsapp: unknown): Promise<{ status: "ok"; customers: AdminCustomer[] } | { status: "invalid"; reason: string }> {
    const normalized = phone(whatsapp);
    if (!normalized) return { status: "invalid", reason: "whatsapp_invalid" };
    return { status: "ok", customers: await this.repository.searchActive(normalized) };
  }

  async createManual(body: unknown, actor: CustomerActorContext): Promise<CreateCustomerResult> {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: "invalid", reason: "body_invalid" };
    const input = body as Record<string, unknown>;
    const fullName = text(input.fullName, 200);
    if (!fullName) return { status: "invalid", reason: "full_name_invalid" };
    const whatsapp = phone(input.whatsapp);
    if (!whatsapp) return { status: "invalid", reason: "whatsapp_invalid" };
    const email = optionalText(input.email, 254);
    if (email === undefined || (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { status: "invalid", reason: "email_invalid" };
    const city = optionalText(input.city, 200);
    if (city === undefined) return { status: "invalid", reason: "city_invalid" };
    const country = optionalText(input.country, 200);
    if (country === undefined) return { status: "invalid", reason: "country_invalid" };
    const preferredContactChannel = input.preferredContactChannel === undefined ? "whatsapp" : text(input.preferredContactChannel, 50);
    if (!preferredContactChannel) return { status: "invalid", reason: "preferred_contact_channel_invalid" };
    return this.repository.createManual({ fullName, whatsapp, email, city, country, preferredContactChannel }, actor);
  }
}
