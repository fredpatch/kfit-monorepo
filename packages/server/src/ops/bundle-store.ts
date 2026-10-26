import { randomBytes } from "node:crypto";
import { copyFile, mkdir, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { sha256File } from "./backup-crypto.js";
import { BUNDLE_PART_FILES, MANIFEST_FILE, verifyManifest, type BackupManifest, type BundlePartName } from "./backup-manifest.js";
import { planRotation, type RotationEntry } from "./backup-rotation.js";
import { OpsError } from "./ops-errors.js";

const partNames = Object.keys(BUNDLE_PART_FILES) as BundlePartName[];

/** Working directory beside the final bundle; never matches the bundle name pattern, so rotation ignores leftovers. */
export const tempBundleDir = (parent: string, name: string) => path.join(parent, `.tmp-${name}-${randomBytes(3).toString("hex")}`);

/** fsync of a directory entry after rename; not supported on Windows (NTFS commits the rename itself). */
export async function syncDirectory(dir: string): Promise<void> {
  if (process.platform === "win32") return;
  const handle = await open(dir, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function writeDurable(filePath: string, text: string): Promise<void> {
  const handle = await open(filePath, "wx");
  try { await handle.writeFile(text, "utf8"); await handle.sync(); } finally { await handle.close(); }
}

/** B6.1: reads and authenticates manifest.json; MANIFEST_INVALID / BACKUP_KEY_INVALID before anything else is read. */
export async function readManifest(bundleDir: string, key: Buffer): Promise<BackupManifest> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(bundleDir, MANIFEST_FILE), "utf8"));
  } catch {
    throw new OpsError("MANIFEST_INVALID", "manifest missing or not JSON");
  }
  const verified = verifyManifest(raw, key);
  if (!verified.ok) throw new OpsError(verified.code, verified.detail);
  return verified.manifest;
}

/** Re-reads every part: size and SHA-256 of the ciphertext must match the manifest. Names the failing parts only. */
export async function verifyParts(bundleDir: string, manifest: BackupManifest): Promise<void> {
  const failed: string[] = [];
  for (const name of partNames) {
    const part = manifest.parts[name];
    try {
      const actual = await sha256File(path.join(bundleDir, part.file));
      if (actual.bytes !== part.bytes || actual.sha256 !== part.sha256) failed.push(name);
    } catch {
      failed.push(name);
    }
  }
  if (failed.length) throw new OpsError("VERIFY_FAILED", `part hash mismatch: ${failed.join(", ")}`);
}

/** B5: every entry of `dir`; a bundle counts as valid only when its manifest verifies and names the directory. */
export async function listBundles(dir: string, key: Buffer): Promise<Array<RotationEntry & { manifest: BackupManifest | null }>> {
  const entries = await readdir(dir, { withFileTypes: true });
  return Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory()) return { name: entry.name, manifestValid: false, manifest: null };
    const manifest = await readManifest(path.join(dir, entry.name), key).catch(() => null);
    const valid = manifest !== null && manifest.bundle === entry.name;
    return { name: entry.name, manifestValid: valid, manifest: valid ? manifest : null };
  }));
}

export async function rotateBundles(dir: string, key: Buffer, now: Date): Promise<{ kept: number; deleted: number }> {
  const plan = planRotation(await listBundles(dir, key), now);
  for (const name of plan.delete) await rm(path.join(dir, name), { recursive: true, force: true });
  return { kept: plan.keep.length, deleted: plan.delete.length };
}

/** B4: copies a verified bundle into `parent` under a temp name, flushes each file, renames, then re-verifies the copy. */
export async function copyBundle(bundleDir: string, manifest: BackupManifest, parent: string): Promise<string> {
  await mkdir(parent, { recursive: true });
  const finalDir = path.join(parent, manifest.bundle), workDir = tempBundleDir(parent, manifest.bundle);
  if (await stat(finalDir).then(() => true, () => false)) throw new Error("bundle already present in the destination");
  await mkdir(workDir);
  try {
    for (const file of [...partNames.map((name) => manifest.parts[name].file), MANIFEST_FILE]) {
      const target = path.join(workDir, file);
      await copyFile(path.join(bundleDir, file), target);
      const handle = await open(target, "r+");
      try { await handle.sync(); } finally { await handle.close(); }
    }
    await rename(workDir, finalDir);
    await syncDirectory(parent);
  } catch (error) {
    await rm(workDir, { recursive: true, force: true });
    throw error;
  }
  await verifyParts(finalDir, manifest);
  return finalDir;
}

/** Regular files under `root` (count and total bytes); a missing root is an error. */
export async function fileStats(root: string): Promise<{ count: number; bytes: number }> {
  const totals = { count: 0, bytes: 0 };
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) { totals.count += 1; totals.bytes += (await stat(full)).size; }
    }
  };
  await walk(root);
  return totals;
}

export async function directoryIsEmpty(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length === 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}
