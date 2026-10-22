import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
export const DOCUMENT_TOKEN_BYTES = 32;
export function createDocumentBearer() { return randomBytes(DOCUMENT_TOKEN_BYTES).toString("base64url"); }
export function hashDocumentBearer(token: string, pepper: string) { return createHmac("sha256", pepper).update("document-token:"+token).digest("hex"); }
export function createDocumentVerificationCode() { return String(randomInt(0, 1_000_000)).padStart(6,"0"); }
export function hashDocumentVerificationCode(code: string, pepper: string) { return createHmac("sha256", pepper).update("document-code:"+code).digest("hex"); }
export function safeEqualText(a: string, b: string) {
  const aa=Buffer.from(a), bb=Buffer.from(b);
  return aa.length===bb.length && timingSafeEqual(aa,bb);
}
