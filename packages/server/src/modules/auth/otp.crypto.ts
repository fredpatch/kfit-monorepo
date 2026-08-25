import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function digestOtp(code: string, pepper: string): string {
  return createHmac("sha256", pepper).update(code).digest("hex");
}

export function verifyOtpDigest(candidate: string, expectedDigest: string, pepper: string): boolean {
  const actual = Buffer.from(digestOtp(candidate, pepper), "hex");
  const expected = Buffer.from(expectedDigest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
