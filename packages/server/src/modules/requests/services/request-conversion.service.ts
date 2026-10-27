import type { RequestConversionResponse } from "@kfit/shared";

export type ConversionFailure =
  | "not_found"
  | "already_converted"
  | "not_eligible"
  | "qualification_invalid"
  | "start_date_required"
  | "duration_invalid";
export type ConversionResult =
  | { status: "ok"; response: RequestConversionResponse }
  | { status: ConversionFailure };
export type ConversionActor = {
  userId: string;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};
export interface RequestConversionRepository {
  convert(
    requestId: string,
    plannedStartDate: Date | null,
    actor: ConversionActor,
  ): Promise<ConversionResult>;
}

type Qualification = {
  outcome: string;
  finalVariantId: string | null;
  agreedPriceXaf: number | null;
  targetStartDate: Date | null;
};
/** Called with authoritative state loaded under the request's transaction lock. */
export function resolveConversionDecision(
  status: string,
  reviews: Qualification[],
  fallbackStart: Date | null,
):
  | {
      status: "ok";
      variantId: string | null;
      agreedPriceXaf: number;
      plannedStartDate: Date;
    }
  | {
      status: "not_eligible" | "qualification_invalid" | "start_date_required";
    } {
  if (status !== "qualified" && status !== "qualified_with_conditions")
    return { status: "not_eligible" };
  const review = reviews[0];
  // REG-F1 R3: a null option is a valid snapshot (offer sold as is); the qualification is honoured as recorded.
  if (
    reviews.length !== 1 ||
    !review ||
    review.outcome !== status ||
    review.agreedPriceXaf === null ||
    !Number.isInteger(review.agreedPriceXaf) ||
    review.agreedPriceXaf < 0
  ) {
    return { status: "qualification_invalid" };
  }
  const plannedStartDate = review.targetStartDate ?? fallbackStart;
  if (!plannedStartDate) return { status: "start_date_required" };
  if (!Number.isFinite(plannedStartDate.getTime()))
    return { status: "qualification_invalid" };
  return {
    status: "ok",
    variantId: review.finalVariantId,
    agreedPriceXaf: review.agreedPriceXaf,
    plannedStartDate,
  };
}

function parseStartDate(value: unknown): Date | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      value,
    )
  )
    return null;
  const parsed = new Date(value);
  const day = new Date(value.slice(0, 10));
  if (
    !Number.isFinite(parsed.getTime()) ||
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== value.slice(0, 10)
  )
    return null;
  return parsed;
}

export class RequestConversionService {
  constructor(private readonly repository: RequestConversionRepository) {}

  async convert(
    requestId: string,
    body: unknown,
    actor: ConversionActor,
  ): Promise<ConversionResult | { status: "invalid" }> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        requestId,
      ) ||
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    )
      return { status: "invalid" };
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => key !== "plannedStartDate"))
      return { status: "invalid" };
    const plannedStartDate =
      input.plannedStartDate === undefined
        ? null
        : parseStartDate(input.plannedStartDate);
    if (input.plannedStartDate !== undefined && !plannedStartDate)
      return { status: "invalid" };
    return this.repository.convert(requestId, plannedStartDate, actor);
  }
}
