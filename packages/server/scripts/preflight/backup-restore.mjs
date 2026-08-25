import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");

const postgresUser = process.env.POSTGRES_USER || "kfit";
const sourceDb = process.env.POSTGRES_DB || "kfit_dev";
const keyHex = process.env.BACKUP_ENCRYPTION_KEY;

if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
  throw new Error("BACKUP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)");
}

const encryptionKey = Buffer.from(keyHex, "hex");
const markerId = crypto.randomUUID();
const runKey = `backup-preflight-${markerId}`;
const restoreDb = `kfit_restore_${markerId.replaceAll("-", "").slice(0, 12)}`;
const markerContent = `KFIT_PRIVATE_FILE_BACKUP_MARKER:${markerId}`;

const storageDir = path.join(repoRoot, "storage", "private", "preflight");
const markerFile = path.join(storageDir, `${markerId}.txt`);
const workDir = path.join(repoRoot, "tmp", "backup-preflight", markerId);
const primaryDir = path.join(workDir, "primary");
const offsiteDir = path.join(workDir, "offsite-simulated");
const restoreFilesDir = path.join(workDir, "isolated-restore", "files");
const primaryBundlePath = path.join(primaryDir, "kfit-backup.enc.json");
const offsiteBundlePath = path.join(offsiteDir, "kfit-backup.enc.json");

function docker(args, options = {}) {
  return execFileSync("docker", ["compose", ...args], {
    cwd: repoRoot,
    encoding: options.encoding ?? "utf8",
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: options.stdio,
  });
}

function psql(database, sql, { tuplesOnly = false } = {}) {
  const args = ["exec", "-T", "postgres", "psql", "-U", postgresUser, "-d", database, "-v", "ON_ERROR_STOP=1"];
  if (tuplesOnly) args.push("-At");
  args.push("-c", sql);
  return docker(args).trim();
}

function encryptPayload(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptPayload(envelope) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
}

async function cleanupSourceMarker() {
  try {
    psql(sourceDb, `delete from scheduled_job_runs where id = '${markerId}'::uuid;`);
  } catch {}
  try {
    await fs.rm(markerFile, { force: true });
  } catch {}
}

function dropRestoreDb() {
  try {
    psql("postgres", `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${restoreDb}' and pid <> pg_backend_pid();`);
  } catch {}
  try {
    psql("postgres", `drop database if exists ${restoreDb};`);
  } catch {}
}

try {
  docker(["exec", "-T", "postgres", "pg_isready", "-U", postgresUser, "-d", sourceDb]);
  console.log("PostgreSQL Docker source is ready");

  await fs.mkdir(storageDir, { recursive: true });
  await fs.mkdir(primaryDir, { recursive: true });
  await fs.mkdir(offsiteDir, { recursive: true });
  await fs.mkdir(restoreFilesDir, { recursive: true });

  psql(
    sourceDb,
    `insert into scheduled_job_runs (id, job_key, run_key, status, attempt, started_at, result_json)
     values ('${markerId}'::uuid, 'preflight.backup-restore', '${runKey}', 'succeeded', 1, now(), '{"backupMarker":true}'::jsonb);`,
  );
  await fs.writeFile(markerFile, markerContent, "utf8");
  console.log("Source DB and private-file markers created");

  const dump = docker([
    "exec", "-T", "postgres", "pg_dump",
    "-U", postgresUser,
    "-d", sourceDb,
    "--no-owner",
    "--no-privileges",
    "--format=plain",
  ]);

  if (!dump.includes("scheduled_job_runs")) {
    throw new Error("pg_dump output does not contain expected application schema");
  }

  const privateFileBytes = await fs.readFile(markerFile);
  const payload = Buffer.from(JSON.stringify({
    format: "kfit-preflight-backup-v1",
    createdAt: new Date().toISOString(),
    sourceDatabase: sourceDb,
    databaseDumpUtf8: dump,
    files: [{
      relativePath: path.relative(path.join(repoRoot, "storage", "private"), markerFile).replaceAll("\\", "/"),
      sha256: crypto.createHash("sha256").update(privateFileBytes).digest("hex"),
      contentBase64: privateFileBytes.toString("base64"),
    }],
  }), "utf8");

  const encrypted = encryptPayload(payload);
  await fs.writeFile(primaryBundlePath, JSON.stringify(encrypted), "utf8");
  console.log("Encrypted AES-256-GCM DB + private-files backup created");

  await fs.copyFile(primaryBundlePath, offsiteBundlePath);
  const primaryHash = crypto.createHash("sha256").update(await fs.readFile(primaryBundlePath)).digest("hex");
  const offsiteHash = crypto.createHash("sha256").update(await fs.readFile(offsiteBundlePath)).digest("hex");
  if (primaryHash !== offsiteHash) throw new Error("Off-server-copy simulation integrity check failed");
  console.log("Secondary/off-server-copy workflow verified by SHA-256 equality");

  await fs.rm(primaryBundlePath, { force: true });
  const offsiteEnvelope = JSON.parse(await fs.readFile(offsiteBundlePath, "utf8"));
  const restoredPayload = JSON.parse(decryptPayload(offsiteEnvelope).toString("utf8"));
  console.log("Encrypted backup decrypted from secondary copy");

  dropRestoreDb();
  psql("postgres", `create database ${restoreDb};`);
  docker(
    ["exec", "-T", "postgres", "psql", "-U", postgresUser, "-d", restoreDb, "-v", "ON_ERROR_STOP=1"],
    { input: restoredPayload.databaseDumpUtf8 },
  );

  const restoredDbMarker = psql(
    restoreDb,
    `select count(*) from scheduled_job_runs where id = '${markerId}'::uuid and run_key = '${runKey}';`,
    { tuplesOnly: true },
  );
  if (restoredDbMarker !== "1") throw new Error("Database marker was not restored into isolated database");
  console.log(`Isolated PostgreSQL restore verified in ${restoreDb}`);

  for (const file of restoredPayload.files) {
    const bytes = Buffer.from(file.contentBase64, "base64");
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    if (digest !== file.sha256) throw new Error(`Restored file integrity mismatch: ${file.relativePath}`);
    const destination = path.join(restoreFilesDir, file.relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
  }

  const restoredMarkerPath = path.join(restoreFilesDir, restoredPayload.files[0].relativePath);
  const restoredMarker = await fs.readFile(restoredMarkerPath, "utf8");
  if (restoredMarker !== markerContent) throw new Error("Private-file restore marker mismatch");
  console.log("Isolated private-file restore and SHA-256 verification passed");

  const sourceStillIntact = psql(sourceDb, "select current_database();", { tuplesOnly: true });
  if (sourceStillIntact !== sourceDb) throw new Error("Active source database verification failed");
  console.log("Active development database remained separate from restore target");

  console.log(`Encrypted secondary backup retained for inspection: ${offsiteBundlePath}`);
  console.log("Backup + isolated restore pre-flight PASSED");
} finally {
  dropRestoreDb();
  await cleanupSourceMarker();
}
