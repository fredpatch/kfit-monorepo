import { readBootstrapToken } from "../../../runtime/production-guards.js";
import type { RateLimitScope } from "../../../security/security-event-counters.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import type { BootstrapTokenPolicy } from "./bootstrap.service.js";

/** BOOT-01 B2: POST /auth/bootstrap attempts per client address and window. */
export const BOOTSTRAP_ATTEMPTS_PER_IP = 5;
export const BOOTSTRAP_RATE_WINDOW_MS = 15 * 60_000;
export const BOOTSTRAP_RATE_LIMIT_SCOPE: RateLimitScope = "auth_bootstrap";

/** BOOT-01 B1: development is unchanged; production always asks for the token and is closed without one. */
export function bootstrapTokenPolicy(
  mode: "development" | "production",
  env: NodeJS.ProcessEnv,
): BootstrapTokenPolicy {
  return mode === "production"
    ? { required: true, token: readBootstrapToken(env) }
    : { required: false };
}

export function createBootstrapRateLimiter(
  onRefused: () => void,
): (ipAddress: string, now: number) => boolean {
  const limiter = new IpRateLimiter({
    windowMs: BOOTSTRAP_RATE_WINDOW_MS,
    maxPerWindow: BOOTSTRAP_ATTEMPTS_PER_IP,
    onRefused,
  });
  return (ipAddress, now) => limiter.allow(ipAddress, now);
}
