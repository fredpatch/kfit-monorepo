import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { toJournalLine } from "../modules/privacy/services/privacy-journal.js";
import { encryptToFile, decryptFileTo, parseBackupKey, sha256File } from "./backup-crypto.js";
import { BUNDLE_PART_FILES, bundleName, canonicalJson, keyFingerprint, parseBundleName, signManifest, verifyManifest, type UnsignedManifest } from "./backup-manifest.js";
import { isoWeekKey, planRotation, RETAIN_DAILY_BUNDLES } from "./backup-rotation.js";
import { unionJournal } from "./journal-union.js";
import { loadOpsConfig } from "./ops-config.js";
import { OpsError } from "./ops-errors.js";
import { checkRestoreTarget } from "./restore-target.js";

const key = randomBytes(32), otherKey = randomBytes(32);
const part = (file: string) => ({ file, bytes: 10, sha256: "a".repeat(64), iv: "b".repeat(24), authTag: "c".repeat(32) });
const unsigned: UnsignedManifest = {
  formatVersion: 1, bundle: "kfit-backup-20261026T101500Z", createdAt: "2026-10-26T10:15:00.000Z", sourceDatabase: "kfit_dev",
  migration: { id: "f".repeat(64), applied: 17 }, tableCounts: { "public.customers": 3, "public.documents": 2 },
  files: { count: 2, bytes: 1234 }, journal: { lines: 1 }, tools: { pgDump: "pg_dump (PostgreSQL) 16.4", tar: "bsdtar 3.7.2" },
  parts: { database: part(BUNDLE_PART_FILES.database), files: part(BUNDLE_PART_FILES.files), journal: part(BUNDLE_PART_FILES.journal) },
};
const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

test("B3: bundle names are UTC to the second and parse back; anything else is not a bundle", () => {
  const at = new Date("2026-10-26T23:30:05.123Z");
  assert.equal(bundleName(at), "kfit-backup-20261026T233005Z");
  assert.equal(parseBundleName("kfit-backup-20261026T233005Z")?.toISOString(), "2026-10-26T23:30:05.000Z");
  for (const name of ["kfit-backup-20261326T233005Z", "kfit-backup-20261026T233005", "notes", ".tmp-kfit-backup-20261026T233005Z-1a2b", "kfit-backup-20261026T233005Z.old"]) assert.equal(parseBundleName(name), null, name);
});

test("B3: canonical JSON sorts keys at every level", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 0 }], c: null } }), canonicalJson({ a: { c: null, d: [2, { y: 0, z: 1 }] }, b: 1 }));
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test("B3/B6.1: a signed manifest verifies after a JSON round trip; the key never appears in it", () => {
  const manifest = signManifest(unsigned, key);
  assert.equal(manifest.keyFingerprint, keyFingerprint(key));
  assert.equal(manifest.keyFingerprint.length, 16);
  const verified = verifyManifest(roundTrip(manifest), key);
  assert.ok(verified.ok);
  assert.deepEqual(verified.manifest, manifest);
  assert.ok(!JSON.stringify(manifest).includes(key.toString("hex")));
});

test("B6.1: tampering any field or part hash makes the manifest MANIFEST_INVALID", () => {
  const manifest = roundTrip(signManifest(unsigned, key)) as Record<string, any>;
  const tamper: Array<[string, (m: Record<string, any>) => void]> = [
    ["createdAt", (m) => { m.createdAt = "2026-10-27T10:15:00.000Z"; }],
    ["sourceDatabase", (m) => { m.sourceDatabase = "kfit_other"; }],
    ["migration", (m) => { m.migration.applied = 16; }],
    ["tableCounts", (m) => { m.tableCounts["public.customers"] = 4; }],
    ["files", (m) => { m.files.bytes = 1; }],
    ["database sha256", (m) => { m.parts.database.sha256 = "d".repeat(64); }],
    ["files authTag", (m) => { m.parts.files.authTag = "e".repeat(32); }],
    ["journal iv", (m) => { m.parts.journal.iv = "0".repeat(24); }],
    ["mac", (m) => { m.manifestMac = "0".repeat(64); }],
  ];
  for (const [label, change] of tamper) {
    const copy = structuredClone(manifest);
    change(copy);
    const result = verifyManifest(copy, key);
    assert.ok(!result.ok && result.code === "MANIFEST_INVALID", label);
  }
  for (const broken of [null, "{}", { ...manifest, formatVersion: 2 }, { ...manifest, parts: { ...manifest.parts, journal: undefined } }, { ...manifest, bundle: "x" }]) {
    const result = verifyManifest(broken, key);
    assert.ok(!result.ok && result.code === "MANIFEST_INVALID");
  }
});

test("B6.1: the wrong key is reported as a key fingerprint mismatch (BACKUP_KEY_INVALID)", () => {
  const result = verifyManifest(roundTrip(signManifest(unsigned, key)), otherKey);
  assert.deepEqual(result, { ok: false, code: "BACKUP_KEY_INVALID", detail: "key fingerprint mismatch" });
});

test("B3: BACKUP_ENCRYPTION_KEY must be 64 hex characters", () => {
  assert.equal(parseBackupKey(undefined), null);
  assert.equal(parseBackupKey("ab".repeat(31)), null);
  assert.equal(parseBackupKey("zz".repeat(32)), null);
  assert.equal(parseBackupKey("AB".repeat(32))?.length, 32);
});

test("B3: streaming encrypt/decrypt round trip on a multi-MB stream; ciphertext hash recorded; tampering fails the auth tag", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "kfit-backup-crypto-"));
  try {
    const chunks = Array.from({ length: 48 }, () => randomBytes(128 * 1024)); // 6 MiB in 128 KiB chunks
    const plainHash = createHash("sha256");
    for (const chunk of chunks) plainHash.update(chunk);
    const file = path.join(dir, BUNDLE_PART_FILES.database);
    const encrypted = await encryptToFile(Readable.from(chunks), key, file);
    assert.equal(encrypted.file, BUNDLE_PART_FILES.database);
    assert.equal(encrypted.bytes, 6 * 1024 * 1024);
    assert.deepEqual(await sha256File(file), { bytes: encrypted.bytes, sha256: encrypted.sha256 });
    assert.notEqual(encrypted.sha256, plainHash.copy().digest("hex"));

    const decryptedHash = createHash("sha256");
    let decryptedBytes = 0;
    await decryptFileTo(file, key, encrypted, new Writable({ write(chunk: Buffer, _e, done) { decryptedHash.update(chunk); decryptedBytes += chunk.length; done(); } }));
    assert.equal(decryptedBytes, 6 * 1024 * 1024);
    assert.equal(decryptedHash.digest("hex"), plainHash.digest("hex"));

    await assert.rejects(encryptToFile(Readable.from([Buffer.from("x")]), key, file), /EEXIST/, "parts are never overwritten");
    await assert.rejects(decryptFileTo(file, otherKey, encrypted, new Writable({ write(_c, _e, done) { done(); } })), "wrong key");
    const bytes = await readFile(file);
    bytes.writeUInt8(bytes.readUInt8(bytes.length - 1) ^ 0xff, bytes.length - 1);
    await writeFile(file, bytes);
    await assert.rejects(decryptFileTo(file, key, encrypted, new Writable({ write(_c, _e, done) { done(); } })), "tampered ciphertext");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const entry = (iso: string, manifestValid = true) => ({ name: bundleName(new Date(iso)), manifestValid });

test("B5: ISO weeks follow ISO 8601 across year boundaries", () => {
  assert.equal(isoWeekKey("2026-10-26"), "2026-W44");
  assert.equal(isoWeekKey("2026-01-01"), "2026-W01");
  assert.equal(isoWeekKey("2027-01-01"), "2026-W53");
  assert.equal(isoWeekKey("2024-12-30"), "2025-W01");
});

test("B5: 7 daily bundles + latest of 4 weeks; older bundles deleted; newest never deleted", () => {
  const now = new Date("2026-10-26T03:00:00Z");
  const daily = Array.from({ length: 40 }, (_, i) => entry(new Date(now.getTime() - i * 86_400_000).toISOString()));
  const plan = planRotation(daily, now);
  assert.ok(plan.keep.includes(daily[0]!.name), "newest kept");
  const keptDaily = daily.slice(0, RETAIN_DAILY_BUNDLES).map((e) => e.name);
  for (const name of keptDaily) assert.ok(plan.keep.includes(name));
  // Libreville weeks: Mon 2026-10-26 is W44 (only today), W43 latest = Sun 10-25 (already a daily), W42 = Sun 10-18, W41 = Sun 10-11.
  assert.deepEqual(plan.keep.filter((name) => !keptDaily.includes(name)), [entry("2026-10-11T03:00:00Z").name, entry("2026-10-18T03:00:00Z").name]);
  assert.equal(plan.keep.length + plan.delete.length, 40);
  assert.equal(plan.delete.length, 31);
});

test("B5: days and weeks are Libreville calendar days (UTC+1): 23:30 UTC belongs to the next day", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  const late = entry("2026-10-26T23:30:00Z"), earlier = entry("2026-10-26T22:30:00Z"), early = entry("2026-10-26T01:00:00Z");
  const plan = planRotation([late, earlier, early], now);
  // 23:30 UTC = 00:30 on 10-27 in Libreville; 22:30 UTC = 23:30 on 10-26, the latest of that day; 01:00 UTC is superseded.
  assert.deepEqual(plan.keep, [late.name, earlier.name].sort());
  assert.deepEqual(plan.delete, [early.name]);
});

test("B5: several bundles on one day keep only the latest; the one just written survives even with a single slot", () => {
  const now = new Date("2026-10-26T18:00:00Z");
  const runs = ["2026-10-26T08:00:00Z", "2026-10-26T12:00:00Z", "2026-10-26T17:59:59Z"].map((iso) => entry(iso));
  assert.deepEqual(planRotation(runs, now), { keep: [runs[2]!.name], delete: [runs[0]!.name, runs[1]!.name] });
});

test("B5: foreign directories, temp dirs and bundles with an invalid manifest are never deleted; future bundles are kept", () => {
  const now = new Date("2026-10-26T03:00:00Z");
  const old = Array.from({ length: 60 }, (_, i) => entry(new Date(now.getTime() - (i + 1) * 86_400_000).toISOString()));
  const invalid = entry("2025-01-01T00:00:00Z", false), future = entry("2026-10-27T03:00:00Z");
  const foreign = [{ name: "notes", manifestValid: true }, { name: ".tmp-kfit-backup-20250101T000000Z-ab12", manifestValid: true }, { name: "kfit-backup-latest", manifestValid: true }];
  const plan = planRotation([...old, invalid, future, ...foreign], now);
  for (const name of [invalid.name, ...foreign.map((f) => f.name)]) assert.ok(!plan.delete.includes(name) && !plan.keep.includes(name), name);
  assert.ok(plan.keep.includes(future.name));
});

const journalEvent = (id: string, at: string) => ({ eventId: id, subjectType: "customer" as const, subjectId: "11111111-1111-4111-8111-111111111111", executedAt: new Date(at), planVersion: 1, linkedSubjects: [] });
const e1 = journalEvent("33333333-3333-4333-8333-333333333331", "2026-10-20T10:00:00.000Z");
const e2 = journalEvent("33333333-3333-4333-8333-333333333332", "2026-10-21T10:00:00.000Z");
const e3 = journalEvent("33333333-3333-4333-8333-333333333333", "2026-10-19T10:00:00.000Z");

test("B6.4: journal union appends only bundle events missing from the live journal, oldest first; duplicates and malformed lines are not copied", () => {
  const live = toJournalLine(e2);
  const bundle = [toJournalLine(e2), toJournalLine(e1), "not json\n", toJournalLine(e3), toJournalLine(e1)].join("");
  const union = unionJournal(live, bundle);
  assert.deepEqual(union.append, [toJournalLine(e3), toJournalLine(e1)]);
  assert.deepEqual(union.counts, { live: 1, bundle: 4, appended: 2, malformed: 1 });
});

test("B6.4: empty live journal takes every bundle event; empty bundle appends nothing", () => {
  assert.deepEqual(unionJournal("", toJournalLine(e1) + toJournalLine(e3)).append, [toJournalLine(e3), toJournalLine(e1)]);
  assert.deepEqual(unionJournal(toJournalLine(e1), "").counts, { live: 1, bundle: 0, appended: 0, malformed: 0 });
});

test("B6.2: kfit_dev and kfit_test are refused even with --confirm-overwrite; a non-empty target needs the flag; names are identifiers", () => {
  const empty = { databaseEmpty: true, filesEmpty: true, confirmOverwrite: true };
  for (const targetDb of ["kfit_dev", "kfit_test"]) assert.equal(checkRestoreTarget({ ...empty, targetDb })?.code, "TARGET_FORBIDDEN", targetDb);
  for (const targetDb of ["", "Kfit", "kfit-restore", "x; drop database kfit", "a".repeat(64)]) assert.equal(checkRestoreTarget({ ...empty, targetDb })?.code, "TARGET_FORBIDDEN", targetDb);
  const base = { targetDb: "kfit_restore_1a2b3c4d", databaseEmpty: true, filesEmpty: true, confirmOverwrite: false };
  assert.equal(checkRestoreTarget(base), null);
  assert.equal(checkRestoreTarget({ ...base, databaseEmpty: false })?.code, "TARGET_NOT_EMPTY");
  assert.equal(checkRestoreTarget({ ...base, filesEmpty: false })?.code, "TARGET_NOT_EMPTY");
  assert.equal(checkRestoreTarget({ ...base, databaseEmpty: false, filesEmpty: false, confirmOverwrite: true }), null);
});

test("B10: ops env refuses a bad key, an unknown pg mode and overlapping directories (key names only in the detail)", () => {
  const root = path.resolve(tmpdir(), "kfit-ops-env");
  const base = { BACKUP_ENCRYPTION_KEY: key.toString("hex"), DATABASE_URL: "postgresql://u:p@localhost:5433/kfit_x", PRIVATE_STORAGE_ROOT: path.join(root, "storage"),
    KFIT_PRIVACY_JOURNAL_DIR: path.join(root, "journal"), BACKUP_DIR: path.join(root, "primary"), BACKUP_SECONDARY_DIR: path.join(root, "secondary") };
  const load = (overrides: Record<string, string>) => loadOpsConfig({ ...base, ...overrides }, { composeDir: root });
  const config = load({});
  assert.equal(config.pg.mode, "docker");
  assert.equal(config.pg.service, "postgres");
  const refusals: Array<[Record<string, string>, string]> = [
    [{ BACKUP_ENCRYPTION_KEY: "short" }, "BACKUP_KEY_INVALID"],
    [{ BACKUP_PG_MODE: "ssh" }, "ENV_INVALID"],
    [{ BACKUP_SECONDARY_DIR: path.join(root, "primary") }, "ENV_INVALID"],
    [{ BACKUP_SECONDARY_DIR: path.join(root, "primary", "copy") }, "ENV_INVALID"],
    [{ BACKUP_DIR: path.join(root, "storage", "backups") }, "ENV_INVALID"],
    [{ BACKUP_DIR: path.join(root, "journal") }, "ENV_INVALID"],
    [{ DATABASE_URL: "" }, "ENV_INVALID"],
    [{ NODE_ENV: "production", BACKUP_DIR: "backups/primary" }, "ENV_INVALID"],
    [{ NODE_ENV: "production", BACKUP_COMPOSE_FILE: "docker-compose.prod.yml" }, "ENV_INVALID"],
  ];
  for (const [overrides, code] of refusals) {
    assert.throws(() => load(overrides), (error: unknown) => error instanceof OpsError && error.code === code && !error.detail.includes(root) && !error.detail.includes("short"), JSON.stringify(Object.keys(overrides)));
  }
});
