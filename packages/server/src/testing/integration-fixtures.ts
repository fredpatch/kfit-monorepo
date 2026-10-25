import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** POL-01 D1: integration tests write only to the disposable local kfit_dev database (same rule as quotes.repository.integration.ts). */
export function isLocalTestDatabase(url: string | undefined): boolean {
  try {
    const target = new URL(url ?? "");
    return ["localhost", "127.0.0.1"].includes(target.hostname) && target.port === "5433" && target.pathname === "/kfit_dev" && !target.search;
  } catch {
    return false;
  }
}

export function assertLocalTestDatabase(url = process.env.DATABASE_URL): void {
  assert.ok(isLocalTestDatabase(url), "integration tests require the local kfit_dev database on port 5433");
}

/** POL-01 D1: fixture names stand out in the catalogue and lists if a run ever leaks. */
export const testFixtureName = (name: string) => `[TEST] ${name}`;

/** POL-01 D1: one Gabon-shaped WhatsApp number per call, so runs never share a prospect. */
export function uniqueTestWhatsapp(seed: string = randomUUID()): string {
  const digits = BigInt(`0x${seed.replaceAll("-", "").slice(0, 12)}`).toString().padStart(8, "0").slice(-8);
  return `+241${digits}`;
}

/**
 * POL-01 D1: runs every cleanup step in the given (reverse FK) order even when one fails,
 * then reports all failures together so a leak is never silent.
 */
export async function cleanupInOrder(steps: Array<readonly [label: string, run: () => Promise<unknown>]>): Promise<void> {
  const failures: Array<{ label: string; error: unknown }> = [];
  for (const [label, run] of steps) {
    try {
      await run();
    } catch (error) {
      failures.push({ label, error });
    }
  }
  if (failures.length) throw new AggregateError(failures.map((f) => f.error), `Integration cleanup failed: ${failures.map((f) => f.label).join(", ")}`);
}
