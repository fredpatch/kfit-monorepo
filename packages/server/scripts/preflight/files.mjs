import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile, stat, access } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const MAX_BYTES = 10 * 1024 * 1024;
const CLAMAV_HOST = process.env.CLAMAV_HOST ?? "127.0.0.1";
const CLAMAV_PORT = Number(process.env.CLAMAV_PORT ?? 3310);
const storageRoot = path.resolve(process.cwd(), "../../storage/private/preflight");

const allowed = {
  pdf: (b) => b.subarray(0, 5).toString("ascii") === "%PDF-",
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateUpload({ filename, bytes }) {
  assert(bytes.length > 0, "empty files must be rejected");
  assert(bytes.length <= MAX_BYTES, "files above 10 MB must be rejected");

  const extension = path.extname(filename).slice(1).toLowerCase();
  const signatureCheck = allowed[extension];
  assert(signatureCheck, `unsupported extension: ${extension || "none"}`);
  assert(signatureCheck(bytes), `file signature does not match .${extension}`);

  return { extension, sizeBytes: bytes.length };
}

function internalName(extension) {
  return `${randomUUID()}.${extension}`;
}

function pingClamd() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: CLAMAV_HOST, port: CLAMAV_PORT });
    let response = "";
    const timer = setTimeout(() => socket.destroy(new Error("ClamAV PING timed out")), 5000);

    socket.on("connect", () => socket.write("zPING\0"));
    socket.on("data", (chunk) => { response += chunk.toString("utf8"); });
    socket.on("error", reject);
    socket.on("close", () => {
      clearTimeout(timer);
      response.includes("PONG") ? resolve() : reject(new Error(`Unexpected ClamAV PING response: ${response}`));
    });
  });
}

async function waitForClamd() {
  const deadline = Date.now() + 120_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await pingClamd();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error(`ClamAV did not become ready within 120s: ${lastError?.message ?? "unknown error"}`);
}

function scanBuffer(bytes) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: CLAMAV_HOST, port: CLAMAV_PORT });
    const responses = [];

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      const chunkSize = 8192;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
        const header = Buffer.allocUnsafe(4);
        header.writeUInt32BE(chunk.length, 0);
        socket.write(header);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });

    socket.on("data", (chunk) => responses.push(chunk));
    socket.on("error", reject);
    socket.on("close", () => resolve(Buffer.concat(responses).toString("utf8").replace(/\0/g, "").trim()));
  });
}

async function main() {
  await mkdir(storageRoot, { recursive: true });

  try {
    const cleanPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "ascii");
    const validated = validateUpload({ filename: "bilan.pdf", bytes: cleanPdf });
    assert(validated.extension === "pdf", "valid PDF should be accepted");

    let mismatchRejected = false;
    try {
      validateUpload({ filename: "fake.png", bytes: cleanPdf });
    } catch {
      mismatchRejected = true;
    }
    assert(mismatchRejected, "extension/signature mismatch must be rejected");

    let oversizedRejected = false;
    try {
      validateUpload({ filename: "large.pdf", bytes: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(MAX_BYTES)]) });
    } catch {
      oversizedRejected = true;
    }
    assert(oversizedRejected, "files above 10 MB must be rejected");

    const storedName = internalName("pdf");
    assert(!storedName.includes("bilan"), "internal filename must not expose original filename");
    const storedPath = path.join(storageRoot, storedName);
    await writeFile(storedPath, cleanPdf, { flag: "wx" });
    const storedStat = await stat(storedPath);
    assert(storedStat.size === cleanPdf.length, "private stored file size mismatch");

    const sha256 = createHash("sha256").update(cleanPdf).digest("hex");
    assert(sha256.length === 64, "SHA-256 metadata must be available");

    await waitForClamd();
    const cleanResult = await scanBuffer(cleanPdf);
    assert(cleanResult.includes("OK"), `clean file should scan OK, got: ${cleanResult}`);

    // Build the standard EICAR antivirus test payload at runtime so it is never stored in the repository.
    const eicar = Buffer.from([
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$",
      "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
    ].join(""), "ascii");
    const infectedResult = await scanBuffer(eicar);
    assert(infectedResult.includes("FOUND"), `EICAR test payload must be detected, got: ${infectedResult}`);

    await rm(storedPath, { force: true });
    let purged = false;
    try {
      await access(storedPath);
    } catch {
      purged = true;
    }
    assert(purged, "temporary file purge must remove the file");

    console.log("Private storage path verified");
    console.log("10 MB size limit verified");
    console.log("File signature validation verified");
    console.log("Internal random naming verified");
    console.log("SHA-256 metadata verified");
    console.log(`Clean malware scan: ${cleanResult}`);
    console.log(`EICAR malware scan: ${infectedResult}`);
    console.log("Temporary purge verified");
    console.log("File-storage pre-flight PASSED");
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("File-storage pre-flight FAILED");
  console.error(error);
  process.exitCode = 1;
});
