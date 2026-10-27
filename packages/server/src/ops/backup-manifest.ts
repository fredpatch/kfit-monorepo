import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/*
 * S7.4b B3: one bundle = one directory holding three encrypted parts and a manifest. The manifest is authenticated with a key
 * derived from BACKUP_ENCRYPTION_KEY, so a part hash, IV or auth tag cannot be swapped without the key.
 */
export const BACKUP_FORMAT_VERSION = 1;
export const BUNDLE_PREFIX = "kfit-backup-";
export const MANIFEST_FILE = "manifest.json";
export const BUNDLE_PART_FILES = {
  database: "db.dump.enc",
  files: "files.tar.enc",
  journal: "journal.jsonl.enc",
} as const;
export type BundlePartName = keyof typeof BUNDLE_PART_FILES;
export const KEY_FINGERPRINT_LABEL = "kfit-backup-key-id";
export const MANIFEST_MAC_INFO = "kfit-backup-manifest";

export type BundlePart = {
  file: string;
  bytes: number;
  sha256: string;
  iv: string;
  authTag: string;
};
export type BackupManifest = {
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  bundle: string;
  createdAt: string;
  sourceDatabase: string;
  migration: { id: string; applied: number };
  tableCounts: Record<string, number>;
  files: { count: number; bytes: number };
  journal: { lines: number };
  tools: { pgDump: string; tar: string };
  parts: Record<BundlePartName, BundlePart>;
  keyFingerprint: string;
  manifestMac: string;
};
export type UnsignedManifest = Omit<
  BackupManifest,
  "keyFingerprint" | "manifestMac"
>;

const bundlePattern =
  /^kfit-backup-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

/** `kfit-backup-<UTC yyyyMMddTHHmmssZ>` (B3), to the second. */
export function bundleName(at: Date): string {
  return `${BUNDLE_PREFIX}${at.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

export function parseBundleName(name: string): Date | null {
  const match = bundlePattern.exec(name);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const at = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  return Number.isFinite(at.getTime()) && bundleName(at) === name ? at : null;
}

/** JSON with object keys sorted at every level: the MAC input does not depend on key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export const keyFingerprint = (key: Buffer) =>
  createHmac("sha256", key)
    .update(KEY_FINGERPRINT_LABEL)
    .digest("hex")
    .slice(0, 16);
const macKey = (key: Buffer) =>
  Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), MANIFEST_MAC_INFO, 32));
const macOf = (
  unsigned: UnsignedManifest & { keyFingerprint: string },
  key: Buffer,
) =>
  createHmac("sha256", macKey(key))
    .update(canonicalJson(unsigned))
    .digest("hex");

export function signManifest(
  unsigned: UnsignedManifest,
  key: Buffer,
): BackupManifest {
  const withFingerprint = { ...unsigned, keyFingerprint: keyFingerprint(key) };
  return { ...withFingerprint, manifestMac: macOf(withFingerprint, key) };
}

const hexEqual = (a: string, b: string) =>
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));

/** B6.1: shape, then key fingerprint (wrong key), then MAC (tampered field). Nothing is touched before this passes. */
export function verifyManifest(
  raw: unknown,
  key: Buffer,
):
  | { ok: true; manifest: BackupManifest }
  | {
      ok: false;
      code: "MANIFEST_INVALID" | "BACKUP_KEY_INVALID";
      detail: string;
    } {
  const manifest = parseManifest(raw);
  if (!manifest)
    return {
      ok: false,
      code: "MANIFEST_INVALID",
      detail: "unreadable manifest",
    };
  if (!hexEqual(manifest.keyFingerprint, keyFingerprint(key)))
    return {
      ok: false,
      code: "BACKUP_KEY_INVALID",
      detail: "key fingerprint mismatch",
    };
  const { manifestMac, ...signed } = manifest;
  if (!hexEqual(manifestMac, macOf(signed, key)))
    return {
      ok: false,
      code: "MANIFEST_INVALID",
      detail: "manifest MAC mismatch",
    };
  return { ok: true, manifest };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const isHex = (value: unknown, length: number): value is string =>
  typeof value === "string" &&
  value.length === length &&
  /^[0-9a-f]+$/.test(value);
const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200;

function parsePart(raw: unknown, file: string): BundlePart | null {
  if (
    !isRecord(raw) ||
    raw.file !== file ||
    !isCount(raw.bytes) ||
    !isHex(raw.sha256, 64) ||
    !isHex(raw.iv, 24) ||
    !isHex(raw.authTag, 32)
  )
    return null;
  return {
    file,
    bytes: raw.bytes,
    sha256: raw.sha256,
    iv: raw.iv,
    authTag: raw.authTag,
  };
}

/** Parses external JSON into a manifest; null on any missing or ill-typed field (extra fields are dropped, so they are not MAC'd). */
export function parseManifest(raw: unknown): BackupManifest | null {
  if (
    !isRecord(raw) ||
    raw.formatVersion !== BACKUP_FORMAT_VERSION ||
    typeof raw.bundle !== "string" ||
    !parseBundleName(raw.bundle)
  )
    return null;
  const createdAt =
    typeof raw.createdAt === "string" ? new Date(raw.createdAt) : null;
  if (
    !createdAt ||
    !Number.isFinite(createdAt.getTime()) ||
    createdAt.toISOString() !== raw.createdAt ||
    !isText(raw.sourceDatabase)
  )
    return null;
  const { migration, tableCounts, files, journal, tools, parts } = raw;
  if (
    !isRecord(migration) ||
    typeof migration.id !== "string" ||
    !isCount(migration.applied)
  )
    return null;
  if (!isRecord(tableCounts) || !Object.values(tableCounts).every(isCount))
    return null;
  if (
    !isRecord(files) ||
    !isCount(files.count) ||
    !isCount(files.bytes) ||
    !isRecord(journal) ||
    !isCount(journal.lines)
  )
    return null;
  if (
    !isRecord(tools) ||
    !isText(tools.pgDump) ||
    !isText(tools.tar) ||
    !isRecord(parts)
  )
    return null;
  const database = parsePart(parts.database, BUNDLE_PART_FILES.database),
    filesPart = parsePart(parts.files, BUNDLE_PART_FILES.files),
    journalPart = parsePart(parts.journal, BUNDLE_PART_FILES.journal);
  if (
    !database ||
    !filesPart ||
    !journalPart ||
    !isHex(raw.keyFingerprint, 16) ||
    !isHex(raw.manifestMac, 64)
  )
    return null;
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    bundle: raw.bundle,
    createdAt: raw.createdAt as string,
    sourceDatabase: raw.sourceDatabase,
    migration: { id: migration.id, applied: migration.applied },
    tableCounts: { ...(tableCounts as Record<string, number>) },
    files: { count: files.count, bytes: files.bytes },
    journal: { lines: journal.lines },
    tools: { pgDump: tools.pgDump, tar: tools.tar },
    parts: { database, files: filesPart, journal: journalPart },
    keyFingerprint: raw.keyFingerprint,
    manifestMac: raw.manifestMac,
  };
}
