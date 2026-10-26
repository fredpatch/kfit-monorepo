import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export type SupportedDocumentMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
const signatures: Record<SupportedDocumentMime, (b: Buffer) => boolean> = {
  "application/pdf": b => b.subarray(0, 5).toString("ascii") === "%PDF-",
  "image/jpeg": b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": b => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),
  "image/webp": b => b.length >= 12 && b.subarray(0,4).toString("ascii") === "RIFF" && b.subarray(8,12).toString("ascii") === "WEBP",
};
const extensions: Record<SupportedDocumentMime, string> = {
  "application/pdf":"pdf", "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp",
};
export type StoredDocumentFile = {
  storageKey: string; originalFilename: string; mimeType: SupportedDocumentMime; sizeBytes: number; sha256: string;
};
export class DocumentStorageError extends Error {
  constructor(public readonly code: "DOCUMENT_FILE_TOO_LARGE" | "DOCUMENT_FILE_TYPE_UNSUPPORTED" | "DOCUMENT_FILE_SIGNATURE_INVALID" | "DOCUMENT_FILE_INFECTED" | "DOCUMENT_FILE_SCAN_FAILED" | "DOCUMENT_STORAGE_FAILURE") { super(code); }
}
/** PRIVATE_STORAGE_ROOT, or storage/private/documents at the repository root when the API runs from packages/server. Shared with the ops scripts (S7.4b). */
export const resolvePrivateStorageRoot = (root: string | undefined) => path.resolve(root ?? path.join(process.cwd(), "../../storage/private/documents"));
export class PrivateDocumentStorage {
  private readonly root: string;
  constructor(private readonly options: { root?: string; clamavHost?: string; clamavPort?: number } = {}) {
    this.root = resolvePrivateStorageRoot(options.root ?? process.env.PRIVATE_STORAGE_ROOT);
  }
  validate(bytes: Buffer, mimeType: string, originalFilename?: string) {
    if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new DocumentStorageError("DOCUMENT_FILE_TOO_LARGE");
    if (!(mimeType in signatures)) throw new DocumentStorageError("DOCUMENT_FILE_TYPE_UNSUPPORTED");
    const mime = mimeType as SupportedDocumentMime;
    if (!signatures[mime](bytes)) throw new DocumentStorageError("DOCUMENT_FILE_SIGNATURE_INVALID");
    if (originalFilename) {
      const extension = path.extname(originalFilename).slice(1).toLowerCase();
      const allowedExtensions = mime === "application/pdf" ? ["pdf"]
        : mime === "image/jpeg" ? ["jpg", "jpeg"]
        : mime === "image/png" ? ["png"] : ["webp"];
      if (!allowedExtensions.includes(extension)) throw new DocumentStorageError("DOCUMENT_FILE_SIGNATURE_INVALID");
    }
    return mime;
  }
  private scan(bytes: Buffer): Promise<void> {
    const host = this.options.clamavHost ?? process.env.CLAMAV_HOST ?? "127.0.0.1";
    const port = this.options.clamavPort ?? Number(process.env.CLAMAV_PORT ?? 3310);
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      const chunks: Buffer[] = [];
      const fail = () => reject(new DocumentStorageError("DOCUMENT_FILE_SCAN_FAILED"));
      socket.once("error", fail);
      socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        for (let offset=0; offset<bytes.length; offset+=8192) {
          const chunk=bytes.subarray(offset, Math.min(offset+8192, bytes.length));
          const header=Buffer.allocUnsafe(4); header.writeUInt32BE(chunk.length,0); socket.write(header); socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
      socket.on("data", c => chunks.push(c));
      socket.on("close", () => {
        const result=Buffer.concat(chunks).toString("utf8").replace(/\0/g,"").trim();
        if (result.includes("FOUND")) reject(new DocumentStorageError("DOCUMENT_FILE_INFECTED"));
        else if (result.includes("OK")) resolve();
        else fail();
      });
    });
  }
  async persist(input: { bytes: Buffer; mimeType: string; originalFilename: string }): Promise<StoredDocumentFile> {
    const mimeType=this.validate(input.bytes, input.mimeType, input.originalFilename);
    await this.scan(input.bytes);
    await mkdir(this.root,{recursive:true});
    const storageKey=randomUUID()+"."+extensions[mimeType];
    try { await writeFile(path.join(this.root,storageKey),input.bytes,{flag:"wx"}); }
    catch { throw new DocumentStorageError("DOCUMENT_STORAGE_FAILURE"); }
    return { storageKey, originalFilename: input.originalFilename.slice(0,255) || ("document."+extensions[mimeType]), mimeType, sizeBytes:input.bytes.length,
      sha256:createHash("sha256").update(input.bytes).digest("hex") };
  }
  async read(storageKey: string) {
    if (!/^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i.test(storageKey)) throw new DocumentStorageError("DOCUMENT_STORAGE_FAILURE");
    try { return await readFile(path.join(this.root,storageKey)); } catch { throw new DocumentStorageError("DOCUMENT_STORAGE_FAILURE"); }
  }
  async remove(storageKey: string) { await rm(path.join(this.root,storageKey),{force:true}); }
}
