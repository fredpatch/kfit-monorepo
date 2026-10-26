import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { Transform, type Readable, type Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { BundlePart } from "./backup-manifest.js";

/** S7.4b B3: AES-256-GCM, one random 12-byte IV per part, streamed end to end (no whole-file buffer). */
export const BACKUP_CIPHER = "aes-256-gcm";
export const BACKUP_IV_BYTES = 12;
export const BACKUP_KEY_ENV = "BACKUP_ENCRYPTION_KEY";

/** 64 hex characters (32 bytes) or null. The key itself is never logged or written to the manifest. */
export function parseBackupKey(hex: string | undefined): Buffer | null {
  return hex && /^[0-9a-fA-F]{64}$/.test(hex.trim()) ? Buffer.from(hex.trim(), "hex") : null;
}

function meter() {
  const hash = createHash("sha256");
  let bytes = 0;
  const stream = new Transform({ transform(chunk: Buffer, _encoding, callback) { hash.update(chunk); bytes += chunk.length; callback(null, chunk); } });
  return { stream, result: () => ({ bytes, sha256: hash.digest("hex") }) };
}

/** Encrypts `source` into a new file (`wx`, flushed to disk on close); returns what the manifest records for the part. */
export async function encryptToFile(source: Readable, key: Buffer, filePath: string): Promise<BundlePart> {
  const iv = randomBytes(BACKUP_IV_BYTES);
  const cipher = createCipheriv(BACKUP_CIPHER, key, iv);
  const counted = meter();
  await pipeline(source, cipher, counted.stream, createWriteStream(filePath, { flags: "wx", flush: true }));
  return { file: path.basename(filePath), ...counted.result(), iv: iv.toString("hex"), authTag: cipher.getAuthTag().toString("hex") };
}

/** Streams the plaintext of an encrypted part into `destination`; rejects when the auth tag does not match. */
export async function decryptFileTo(filePath: string, key: Buffer, part: Pick<BundlePart, "iv" | "authTag">, destination: Writable): Promise<void> {
  const decipher = createDecipheriv(BACKUP_CIPHER, key, Buffer.from(part.iv, "hex"));
  decipher.setAuthTag(Buffer.from(part.authTag, "hex"));
  await pipeline(createReadStream(filePath), decipher, destination);
}

export async function sha256File(filePath: string): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) { hash.update(chunk as Buffer); bytes += (chunk as Buffer).length; }
  return { bytes, sha256: hash.digest("hex") };
}
