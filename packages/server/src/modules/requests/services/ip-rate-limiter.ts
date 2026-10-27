/**
 * In-memory fixed-window IP rate limiter for the public request-submission endpoint.
 *
 * Adequate for a single-process V1 deployment. It resets on restart and does not
 * coordinate across replicas; revisit with a shared store before horizontal scaling.
 */
export class IpRateLimiter {
  private readonly hits = new Map<
    string,
    { count: number; windowStartedAt: number }
  >();

  /** `onRefused` counts each refusal (S7.4b B9); it must not throw. */
  constructor(
    private readonly options: {
      windowMs: number;
      maxPerWindow: number;
      onRefused?: (() => void) | undefined;
    },
  ) {}

  allow(ip: string, now: number = Date.now()): boolean {
    const key = ip || "unknown";
    const entry = this.hits.get(key);

    if (!entry || now - entry.windowStartedAt >= this.options.windowMs) {
      this.hits.set(key, { count: 1, windowStartedAt: now });
      return true;
    }

    if (entry.count >= this.options.maxPerWindow) {
      this.options.onRefused?.();
      return false;
    }

    entry.count += 1;
    return true;
  }
}
