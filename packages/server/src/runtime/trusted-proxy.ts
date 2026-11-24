import { isIPv4 } from "node:net";

/*
 * S9A.3: host nginx reaches the API through a Docker port published on 127.0.0.1, and Docker delivers that hop from
 * the gateway of the API's edge network, not from loopback (measured on the Hostinger VPS, 2026-11-24). Production
 * therefore trusts loopback plus exactly that gateway address, injected by docker-compose.prod.yml from the same
 * value as the kfit_edge IPAM gateway. Never a range, a hop count or `true`.
 */

export const TRUSTED_PROXY_IP_ENV = "KFIT_TRUSTED_PROXY_IP";

const PRIVATE_IPV4 = [
  (a: number) => a === 10,
  (a: number, b: number) => a === 172 && b >= 16 && b <= 31,
  (a: number, b: number) => a === 192 && b === 168,
];

/** A single private (RFC 1918) IPv4 address in canonical dotted form, or null. */
export function parseTrustedProxyIp(value: string | undefined): string | null {
  const ip = value?.trim() ?? "";
  if (!isIPv4(ip)) return null;
  const parts = ip.split(".");
  const octets = parts.map(Number);
  if (parts.some((part, i) => String(octets[i]) !== part)) return null;
  const [a, b, , d] = octets as [number, number, number, number];
  if (!PRIVATE_IPV4.some((isPrivate) => isPrivate(a, b))) return null;
  if (d === 0 || d === 255) return null;
  return ip;
}

export class TrustedProxyConfigError extends Error {
  readonly code = "TRUSTED_PROXY_INVALID";
  constructor() {
    super(
      `${TRUSTED_PROXY_IP_ENV} must be the single private IPv4 gateway of kfit_edge`,
    );
  }
}

/** Express `trust proxy` value for production: loopback and the one configured edge gateway. Throws when unusable. */
export function productionTrustProxy(
  env: NodeJS.ProcessEnv,
): readonly ["loopback", string] {
  const gateway = parseTrustedProxyIp(env[TRUSTED_PROXY_IP_ENV]);
  if (!gateway) throw new TrustedProxyConfigError();
  return ["loopback", gateway];
}
