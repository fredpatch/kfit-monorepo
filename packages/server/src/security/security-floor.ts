/*
 * SEC-01 D1: runtime security floor. Pure: no I/O, no dependency.
 * Runtime advisories only (Node itself); npm packages stay with `npm audit`.
 * Adding the next advisory is a one-entry change to SECURITY_FLOOR: the evaluator, the startup check and the CI script
 * (scripts/security/check-runtime-floor.mjs) all read this table.
 */

export type RuntimeAdvisory = {
  id: string;
  component: "node";
  /** Minimum patched version per supported major line; a line absent here is unsupported (EOL or not yet reviewed). */
  minimumByLine: Readonly<Record<number, string>>;
  publishedAt: string;
  note: string;
};

export const SECURITY_FLOOR: readonly RuntimeAdvisory[] = [
  { id: "CVE-2026-111497", component: "node", minimumByLine: { 22: "22.23.4", 24: "24.22.1", 26: "26.12.1" }, publishedAt: "2026-10-22", note: "Brotli decoder OOB write (Node2Shell / HTTP2Shell)" },
];

export type RuntimeFloorFailure = { id: string; reason: "below_minimum" | "unsupported_line"; current: string; required?: string };
export type RuntimeFloorResult = { ok: true } | { ok: false; failures: RuntimeFloorFailure[] };

type Version = [number, number, number];

/** "v22.23.4" or "22.23.4" only (a pre-release or build suffix is not a release); anything else is null, so the caller fails closed. */
export function parseNodeVersion(version: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compare(a: Version, b: Version): number {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

export function evaluateRuntimeFloor(version: string, floor: readonly RuntimeAdvisory[] = SECURITY_FLOOR): RuntimeFloorResult {
  const current = parseNodeVersion(version);
  const failures: RuntimeFloorFailure[] = [];
  for (const advisory of floor) {
    // A version that cannot be read fails closed, as an unsupported line.
    if (!current) { failures.push({ id: advisory.id, reason: "unsupported_line", current: version }); continue; }
    const minimum = advisory.minimumByLine[current[0]];
    const required = minimum ? parseNodeVersion(minimum) : null;
    if (!minimum || !required) failures.push({ id: advisory.id, reason: "unsupported_line", current: version });
    else if (compare(current, required) < 0) failures.push({ id: advisory.id, reason: "below_minimum", current: version, required: minimum });
  }
  return failures.length ? { ok: false, failures } : { ok: true };
}
