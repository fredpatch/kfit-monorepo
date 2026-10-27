import type { DocumentErrorCode } from "@kfit/shared";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import { hasRole } from "../../auth/services/roles.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { DocumentsService, UploadPayload } from "../services/documents.service.js";

type BinaryBody={bytes:Buffer;mimeType:string;filename:string};
export type DocumentControllerResult={status:number;body:any}|{status:number;binary:BinaryBody};
const statusFor=(error:DocumentErrorCode)=>
  error==="DOCUMENT_NOT_FOUND"||error==="DOCUMENT_VERSION_NOT_FOUND"?404:
  error==="DOCUMENT_ADMIN_FORBIDDEN"?403:
  ["DOCUMENT_DUPLICATE_UPLOAD","DOCUMENT_HEALTH_CONSENT_REQUIRED","DOCUMENT_PHOTO_CONSENT_REQUIRED","DOCUMENT_STATUS_INVALID"].includes(error)?409:
  error==="DOCUMENT_LINK_EXPIRED"?410:
  ["DOCUMENT_LINK_REVOKED","DOCUMENT_LINK_EXHAUSTED","DOCUMENT_VERIFICATION_REQUIRED","DOCUMENT_VERIFICATION_LOCKED"].includes(error)?403:400;

export class DocumentsController {
  constructor(private readonly service:DocumentsService){}
  private actor(context:AuthHttpRequestContext){return {userId:context.session?.userId??null,requestId:context.requestId,ipAddress:context.ipAddress??null,userAgent:context.userAgent??null};}
  private admin(context:AuthHttpRequestContext):DocumentControllerResult|null{
    const auth=requireAuthenticatedSession(context);
    if(!auth.ok) return auth.response;
    if(!hasRole(auth.session,"admin")) return {status:403,body:{error:"DOCUMENT_ADMIN_FORBIDDEN"}};
    return null;
  }
  private map(result:any):DocumentControllerResult{return result.ok?{status:200,body:result.body}:{status:statusFor(result.error),body:{error:result.error}};}
  async execute(context:AuthHttpRequestContext,id:string,action:any,body:unknown):Promise<DocumentControllerResult>{
    const guard=this.admin(context); if(guard)return guard;
    return this.map(await this.service.execute(id,action,body,this.actor(context)));
  }
  async upload(context:AuthHttpRequestContext,id:string,type:unknown,payload:UploadPayload):Promise<DocumentControllerResult>{
    const guard=this.admin(context); if(guard)return guard;
    return this.map(await this.service.upload(id,type,payload,this.actor(context)));
  }
  async addVersion(context:AuthHttpRequestContext,id:string,payload:UploadPayload):Promise<DocumentControllerResult>{
    const guard=this.admin(context); if(guard)return guard;
    return this.map(await this.service.addVersion(id,payload,this.actor(context)));
  }
  async generateSummary(context:AuthHttpRequestContext,id:string):Promise<DocumentControllerResult>{
    const guard=this.admin(context); if(guard)return guard;
    return this.map(await this.service.generateSummary(id,this.actor(context)));
  }
  async addPhoto(context:AuthHttpRequestContext,measurementId:string,payload:UploadPayload,metadata:unknown):Promise<DocumentControllerResult>{
    const guard=this.admin(context); if(guard)return guard;
    return this.map(await this.service.addPhoto(measurementId,payload,metadata,this.actor(context)));
  }
  async adminDownload(context:AuthHttpRequestContext,versionId:string):Promise<DocumentControllerResult>{
    const guard=this.admin(context); if(guard)return guard;
    const result=await this.service.adminDownload(versionId,this.actor(context));
    return result.ok?{status:200,binary:result.body as BinaryBody}:this.map(result);
  }
  async publicMeta(token:string,context:AuthHttpRequestContext){return this.map(await this.service.execute("", "public-read",{token},this.actor(context)));}
  async publicVerify(token:string,body:unknown,context:AuthHttpRequestContext){
    const code=body&&typeof body==="object"&&!Array.isArray(body)?(body as any).code:undefined;
    return this.map(await this.service.execute("", "public-verify",{token,code},this.actor(context)));
  }
  async publicDownload(token:string,context:AuthHttpRequestContext):Promise<DocumentControllerResult>{
    const result=await this.service.publicDownload(token,this.actor(context));
    return result.ok?{status:200,binary:result.body as BinaryBody}:this.map(result);
  }
}
