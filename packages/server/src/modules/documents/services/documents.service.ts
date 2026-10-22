import { documentTypes, type DocumentErrorCode, type PersonalizedDocumentType } from "@kfit/shared";
import type { PrivateDocumentStorage, StoredDocumentFile } from "./document-storage.service.js";

export type DocumentActor = { userId: string | null; requestId: string; ipAddress: string | null; userAgent: string | null };
export type UploadPayload = { bytes: Buffer; mimeType: string; originalFilename: string };

export type DocumentCommand =
  | { action: "list" }
  | { action: "read" }
  | { action: "create-upload"; documentType: Exclude<PersonalizedDocumentType, "progress_summary" | "progress_photo">; file: StoredDocumentFile }
  | { action: "add-version"; file: StoredDocumentFile }
  | { action: "generate-summary"; file: StoredDocumentFile; templateVersion: string }
  | { action: "add-photo"; measurementId: string; photoType: string | null; takenAt: Date | null; file: StoredDocumentFile }
  | { action: "issue-link"; expiresAt: Date; maxUses: number }
  | { action: "revoke-link" }
  | { action: "revoke" }
  | { action: "archive" }
  | { action: "admin-download-prepare" }
  | { action: "admin-download-audit" }
  | { action: "public-read"; rawToken: string }
  | { action: "public-verify"; rawToken: string; code: string }
  | { action: "public-download-prepare"; rawToken: string }
  | { action: "public-download-commit"; rawToken: string };

export type DocumentResult = { ok: true; body: any } | { ok: false; error: DocumentErrorCode };
export interface DocumentRepository {
  execute(id: string, command: DocumentCommand, actor: DocumentActor): Promise<DocumentResult>;
  summaryData(subscriptionId: string): Promise<DocumentResult>;
}
export interface ProgressSummaryRenderer {
  readonly templateVersion: string;
  render(data: unknown): Promise<Buffer>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export class DocumentsService {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly storage: Pick<PrivateDocumentStorage, "persist" | "read" | "remove">,
    private readonly renderer: ProgressSummaryRenderer,
  ) {}
  private invalid(): DocumentResult { return { ok:false,error:"DOCUMENT_INVALID_INPUT" }; }
  async execute(id: string, action: DocumentCommand["action"], body: unknown, actor: DocumentActor): Promise<DocumentResult> {
    if (!uuid.test(id) && !action.startsWith("public-")) return this.invalid();
    switch(action) {
      case "list": case "read": case "revoke": case "archive":
        return this.repository.execute(id,{action} as DocumentCommand,actor);
      case "revoke-link":
        return this.repository.execute(id,{action},actor);
      case "issue-link": {
        if (!object(body) || typeof body.expiresAt!=="string") return this.invalid();
        const expiresAt=new Date(body.expiresAt), maxUses=body.maxUses===undefined ? 3 : Number(body.maxUses);
        if (!Number.isFinite(expiresAt.getTime()) || expiresAt<=new Date() || !Number.isSafeInteger(maxUses) || maxUses<1 || maxUses>20) return this.invalid();
        return this.repository.execute(id,{action,expiresAt,maxUses},actor);
      }
      case "public-read":
      case "public-download-prepare":
      case "public-download-commit": {
        if (!object(body) || typeof body.token!=="string") return {ok:false,error:"DOCUMENT_LINK_INVALID"};
        return this.repository.execute(id,{action,rawToken:body.token} as DocumentCommand,actor);
      }
      case "public-verify": {
        if (!object(body) || typeof body.token!=="string" || typeof body.code!=="string" || !/^\d{6}$/.test(body.code))
          return {ok:false,error:"DOCUMENT_VERIFICATION_INVALID"};
        return this.repository.execute(id,{action,rawToken:body.token,code:body.code},actor);
      }
      default: return this.invalid();
    }
  }
  private async persistThen<T extends DocumentCommand>(id: string, payload: UploadPayload, command: (file: StoredDocumentFile)=>T, actor: DocumentActor) {
    let file: StoredDocumentFile | null=null;
    try {
      file=await this.storage.persist(payload);
      const result=await this.repository.execute(id,command(file),actor);
      if (!result.ok) await this.storage.remove(file.storageKey);
      return result;
    } catch (error: any) {
      if (file) await this.storage.remove(file.storageKey);
      const code=error?.code;
      if (typeof code==="string" && code.startsWith("DOCUMENT_")) return {ok:false,error:code as DocumentErrorCode} satisfies DocumentResult;
      throw error;
    }
  }
  upload(subscriptionId: string, documentType: unknown, payload: UploadPayload, actor: DocumentActor) {
    const type=parseUploadDocumentType(documentType);
    return type ? this.persistThen(subscriptionId,payload,file=>({action:"create-upload",documentType:type,file}),actor) : Promise.resolve(this.invalid());
  }
  addVersion(documentId: string, payload: UploadPayload, actor: DocumentActor) {
    return uuid.test(documentId) ? this.persistThen(documentId,payload,file=>({action:"add-version",file}),actor) : Promise.resolve(this.invalid());
  }
  async generateSummary(subscriptionId: string, actor: DocumentActor): Promise<DocumentResult> {
    if (!uuid.test(subscriptionId)) return this.invalid();
    const data=await this.repository.summaryData(subscriptionId);
    if (!data.ok) return data;
    const bytes=await this.renderer.render(data.body);
    return this.persistThen(subscriptionId,{bytes,mimeType:"application/pdf",originalFilename:"kfit-progress-summary-"+this.renderer.templateVersion+".pdf"},
      file=>({action:"generate-summary",file,templateVersion:this.renderer.templateVersion}),actor);
  }
  addPhoto(measurementId: string, payload: UploadPayload, body: unknown, actor: DocumentActor) {
    if (!uuid.test(measurementId) || !object(body)) return Promise.resolve(this.invalid());
    const photoType=typeof body.photoType==="string" && body.photoType.trim() ? body.photoType.trim().slice(0,50) : null;
    const takenAt=typeof body.takenAt==="string" ? new Date(body.takenAt) : null;
    if (takenAt && !Number.isFinite(takenAt.getTime())) return Promise.resolve(this.invalid());
    return this.persistThen(measurementId,payload,file=>({action:"add-photo",measurementId,photoType,takenAt,file}),actor);
  }
  async adminDownload(versionId: string, actor: DocumentActor): Promise<DocumentResult> {
    if (!uuid.test(versionId)) return this.invalid();
    const prepared=await this.repository.execute(versionId,{action:"admin-download-prepare"},actor);
    if (!prepared.ok) return prepared;
    const bytes=await this.storage.read(prepared.body.storageKey);
    const audited=await this.repository.execute(versionId,{action:"admin-download-audit"},actor);
    if (!audited.ok) return audited;
    return {ok:true,body:{bytes,mimeType:prepared.body.mimeType,filename:prepared.body.filename}};
  }
  async publicDownload(token: string, actor: DocumentActor): Promise<DocumentResult> {
    const prepared=await this.repository.execute("",{action:"public-download-prepare",rawToken:token},actor);
    if (!prepared.ok) return prepared;
    const bytes=await this.storage.read(prepared.body.storageKey);
    const committed=await this.repository.execute("",{action:"public-download-commit",rawToken:token},actor);
    if (!committed.ok) return committed;
    return {ok:true,body:{bytes,mimeType:prepared.body.mimeType,filename:prepared.body.filename}};
  }
}

export function parseUploadDocumentType(value: unknown): Exclude<PersonalizedDocumentType,"progress_summary"|"progress_photo"> | null {
  const found=documentTypes.find(v=>v===value);
  return found && found!=="progress_summary" && found!=="progress_photo" ? found : null;
}
