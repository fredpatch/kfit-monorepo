/**
 * In-memory fixed-window IP rate limiter for the public request-submission endpoint.
 *
 * Adequate for a single-process V1 deployment. It resets on restart and does not
 * coordinate across replicas; revisit with a shared store before horizontal scaling.
 */
export class IpRateLimiter {
  private readonly hits = new Map<string, { count: number; windowStartedAt: number }>();

  constructor(private readonly options: { windowMs: number; maxPerWindow: number }) {}

  allow(ip: string, now: number = Date.now()): boolean {
    const key = ip || "unknown";
    const entry = this.hits.get(key);

    if (!entry || now - entry.windowStartedAt >= this.options.windowMs) {
      this.hits.set(key, { count: 1, windowStartedAt: now });
      return true;
    }

    if (entry.count >= this.options.maxPerWindow) {
      return false;
    }

    entry.count += 1;
    return true;
  }
}
