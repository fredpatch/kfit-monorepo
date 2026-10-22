import { and, eq, inArray } from "drizzle-orm";
import type { DocumentDeliveryLinkSummary, DocumentStatus, PersonalizedDocument, PersonalizedDocumentType } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { documents, documentVersions, externalAccessEvents, secureAccessTokens } from "../../../db/schema/documents.js";
import { followUps, goals, progressMeasurements, progressPhotos } from "../../../db/schema/coaching.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { services } from "../../../db/schema/catalogue.js";
import { consentRecords } from "../../../db/schema/onboarding.js";
import { AuditService, hashAuditContext, type AuditMetadata } from "../../auth/services/audit.service.js";
import { lockConsentDefinitions, readConsentEvidence } from "../../consents/repositories/consent.repository.js";
import { latestDefinitions } from "../../consents/services/consent.service.js";
import { createDocumentBearer, createDocumentVerificationCode, hashDocumentBearer, hashDocumentVerificationCode, safeEqualText } from "../services/document-token.crypto.js";
import type { DocumentActor, DocumentCommand, DocumentRepository, DocumentResult } from "../services/documents.service.js";

type Database=typeof appDb;
type Tx=Parameters<Parameters<Database["transaction"]>[0]>[0];
type Doc=typeof documents.$inferSelect;
type Version=typeof documentVersions.$inferSelect;
type TokenContext={ verification?: { codeHash:string; attempts:number; maxAttempts:number; verifiedUntil:string|null } };

const tokenScope={resourceType:"document_version",action:"document_download"} as const;
const sensitive=(type:string)=>type==="progress_summary"||type==="progress_photo";
function tokenState(row: typeof secureAccessTokens.$inferSelect, now: Date): DocumentDeliveryLinkSummary["state"] {
  if (row.revokedAt) return "revoked";
  if (row.expiresAt<=now) return "expired";
  if (row.maxUses!==null && row.useCount>=row.maxUses) return "exhausted";
  return "available";
}
function context(value: unknown): TokenContext {
  if (!value || typeof value!=="object" || Array.isArray(value)) return {};
  return value as TokenContext;
}
function status(value:string):DocumentStatus {
  if (["draft","available","revoked","archived","pending_purge","purged"].includes(value)) return value as DocumentStatus;
  throw new Error("Invalid document status");
}
function dtype(value:string):PersonalizedDocumentType {
  if (["meal_plan","workout_plan","progress_summary","progress_photo","other_personalized"].includes(value)) return value as PersonalizedDocumentType;
  throw new Error("Invalid document type");
}

export class DrizzleDocumentsRepository implements DocumentRepository {
  constructor(private readonly database: Database, private readonly options: {
    auditHashPepper:string; tokenPepper:string; verificationPepper:string; verificationTtlMs?:number;
  }, private readonly clock:()=>Date=()=>new Date()) {}
  private async audit(tx:Tx, actor:DocumentActor, entityType:string, entityId:string, eventType:string, metadata:AuditMetadata) {
    await new AuditService(tx,{auditHashPepper:this.options.auditHashPepper}).record({
      actorType: actor.userId ? "user" : "anonymous", actorUserId:actor.userId, eventType, entityType, entityId, result:"success",
      requestId:actor.requestId, ipAddress:actor.ipAddress, userAgent:actor.userAgent, metadata,
    });
  }
  private accessEvent(tx:Tx, tokenId:string|null, actor:DocumentActor, eventType:string, result:string) {
    return tx.insert(externalAccessEvents).values({ secureAccessTokenId:tokenId, eventType, result,
      ipHash:hashAuditContext(actor.ipAddress,this.options.auditHashPepper), userAgentHash:hashAuditContext(actor.userAgent,this.options.auditHashPepper) });
  }
  private async consentGranted(tx:Tx, sub:typeof subscriptions.$inferSelect, consentType:"health_data"|"progress_photo_storage") {
    const evidence=await readConsentEvidence(tx,sub.id);
    const definition=latestDefinitions(evidence.definitions).find(d=>d.consentType===consentType);
    const current=evidence.current?.find(c=>c.consentType===consentType);
    if (!definition || current?.decision!=="granted" || current.consentDefinitionId!==definition.id) return false;
    const [record]=await tx.select({id:consentRecords.id}).from(consentRecords)
      .where(and(eq(consentRecords.id,current.id),eq(consentRecords.customerId,sub.customerId)));
    return Boolean(record);
  }
  private async detail(tx:Tx, doc:Doc):Promise<PersonalizedDocument> {
    const versions=await tx.select().from(documentVersions).where(eq(documentVersions.documentId,doc.id)).orderBy(documentVersions.versionNumber);
    const ids=versions.map(v=>v.id);
    const links=ids.length ? await tx.select().from(secureAccessTokens).where(and(
      eq(secureAccessTokens.resourceType,tokenScope.resourceType), eq(secureAccessTokens.action,tokenScope.action), inArray(secureAccessTokens.resourceId,ids)
    )).orderBy(secureAccessTokens.createdAt) : [];
    const now=this.clock();
    return {
      id:doc.id, subscriptionId:doc.ownerId, documentType:dtype(doc.documentType), sensitivity:doc.sensitivity==="sensitive_health"?"sensitive_health":"private",
      status:status(doc.status), currentVersionId:doc.currentVersionId, createdAt:doc.createdAt.toISOString(), updatedAt:doc.updatedAt.toISOString(),
      versions:versions.map(v=>({id:v.id,versionNumber:v.versionNumber,mimeType:v.mimeType,sizeBytes:v.sizeBytes,sha256:v.sha256,
        malwareScanStatus:"clean",createdAt:v.createdAt.toISOString(),isCurrent:v.id===doc.currentVersionId})),
      deliveryLinks:links.map(t=>({id:t.id,versionId:t.resourceId,expiresAt:t.expiresAt.toISOString(),maxUses:t.maxUses,useCount:t.useCount,
        state:tokenState(t,now),requiresVerification:t.requiresOtp})),
    };
  }
  private async createDocument(tx:Tx, subscriptionId:string, type:PersonalizedDocumentType, file:DocumentCommand & any, actor:DocumentActor, now:Date) {
    const [sub]=await tx.select().from(subscriptions).where(eq(subscriptions.id,subscriptionId)).for("update");
    if (!sub) return {ok:false,error:"DOCUMENT_NOT_FOUND"} as const;
    const existing=await tx.select({id:documents.id}).from(documents).innerJoin(documentVersions,eq(documentVersions.documentId,documents.id))
      .where(and(eq(documents.ownerType,"subscription"),eq(documents.ownerId,subscriptionId),eq(documents.documentType,type),eq(documentVersions.sha256,file.file.sha256)));
    if (existing.length) return {ok:false,error:"DOCUMENT_DUPLICATE_UPLOAD"} as const;
    const [doc]=await tx.insert(documents).values({ownerType:"subscription",ownerId:subscriptionId,documentType:type,
      sensitivity:sensitive(type)?"sensitive_health":"private",status:"available",createdByUserId:actor.userId,createdAt:now,updatedAt:now}).returning();
    if(!doc) throw new Error("Document insert returned no row");
    const [version]=await tx.insert(documentVersions).values({documentId:doc.id,versionNumber:1,storageKey:file.file.storageKey,
      originalFilename:file.file.originalFilename,mimeType:file.file.mimeType,sizeBytes:file.file.sizeBytes,sha256:file.file.sha256,
      malwareScanStatus:"clean",uploadedByType:"coach",uploadedByUserId:actor.userId,createdAt:now}).returning();
    if(!version) throw new Error("Document version insert returned no row");
    await tx.update(documents).set({currentVersionId:version.id,updatedAt:now}).where(eq(documents.id,doc.id));
    return {ok:true,doc:{...doc,currentVersionId:version.id},version} as const;
  }
  async summaryData(subscriptionId:string):Promise<DocumentResult> {
    return this.database.transaction(async tx=>{
      const [sub]=await tx.select().from(subscriptions).where(eq(subscriptions.id,subscriptionId));
      if(!sub) return {ok:false,error:"DOCUMENT_NOT_FOUND"};
      if(!await this.consentGranted(tx,sub,"health_data")) return {ok:false,error:"DOCUMENT_HEALTH_CONSENT_REQUIRED"};
      const [customer]=await tx.select({fullName:customers.fullName}).from(customers).where(eq(customers.id,sub.customerId));
      const [service]=await tx.select({name:services.name}).from(services).where(eq(services.id,sub.serviceId));
      const measurements=await tx.select().from(progressMeasurements).where(eq(progressMeasurements.subscriptionId,sub.id)).orderBy(progressMeasurements.measuredAt);
      const goalRows=await tx.select().from(goals).where(eq(goals.subscriptionId,sub.id)).orderBy(goals.createdAt);
      const followUpRows=await tx.select().from(followUps).where(eq(followUps.subscriptionId,sub.id)).orderBy(followUps.occurredAt);
      return {ok:true,body:{subscription:{reference:sub.reference,status:sub.status,actualStartDate:sub.actualStartDate?.toISOString()??null,
        plannedEndDate:sub.plannedEndDate?.toISOString()??null},customer:{fullName:customer?.fullName??"Client"},service:{name:service?.name??"Coaching"},
        measurements:measurements.map(m=>({measuredAt:m.measuredAt.toISOString(),weightKg:m.weightKg===null?null:Number(m.weightKg),
          waistCm:m.waistCm===null?null:Number(m.waistCm),hipsCm:m.hipsCm===null?null:Number(m.hipsCm),chestCm:m.chestCm===null?null:Number(m.chestCm),
          bodyFatEstimate:m.bodyFatEstimate===null?null:Number(m.bodyFatEstimate)})),
        goals:goalRows.map(g=>({label:g.label,unit:g.unit,baselineValue:g.baselineValue===null?null:Number(g.baselineValue),
          targetValue:g.targetValue===null?null:Number(g.targetValue),status:g.status,suggestedStatus:g.suggestedStatus,coachConfirmedAt:g.coachConfirmedAt?.toISOString()??null})),
        followUps:followUpRows.map(f=>({followUpType:f.followUpType,occurredAt:f.occurredAt.toISOString(),status:f.status}))}};
    },{isolationLevel:"repeatable read",accessMode:"read only"});
  }
  async execute(id:string, command:DocumentCommand, actor:DocumentActor):Promise<DocumentResult> {
    if(command.action==="list"){
      return this.database.transaction(async tx=>{
        const [sub]=await tx.select({id:subscriptions.id}).from(subscriptions).where(eq(subscriptions.id,id));
        if(!sub) return {ok:false,error:"DOCUMENT_NOT_FOUND"};
        const rows=await tx.select().from(documents).where(and(eq(documents.ownerType,"subscription"),eq(documents.ownerId,id))).orderBy(documents.createdAt);
        const out:PersonalizedDocument[]=[]; for(const row of rows) out.push(await this.detail(tx,row));
        return {ok:true,body:{subscriptionId:id,documents:out}};
      },{isolationLevel:"repeatable read",accessMode:"read only"});
    }
    if(command.action==="create-upload" || command.action==="generate-summary"){
      return this.database.transaction(async tx=>{
        if(command.action==="generate-summary"){
          const [sub]=await tx.select().from(subscriptions).where(eq(subscriptions.id,id)).for("update");
          if(!sub) return {ok:false,error:"DOCUMENT_NOT_FOUND"};
          await lockConsentDefinitions(tx);
          if(!await this.consentGranted(tx,sub,"health_data")) return {ok:false,error:"DOCUMENT_HEALTH_CONSENT_REQUIRED"};
        }
        const now=this.clock();
        const created=await this.createDocument(tx,id,command.action==="generate-summary"?"progress_summary":command.documentType,command,actor,now);
        if(!created.ok) return created;
        const eventType=command.action==="generate-summary"?"document.progress_summary_generated":"document.created";
        await this.audit(tx,actor,"document",created.doc.id,eventType,{documentId:created.doc.id,versionId:created.version.id,
          documentType:created.doc.documentType,sensitivity:created.doc.sensitivity,versionNumber:1,
          ...(command.action==="generate-summary"?{templateVersion:command.templateVersion}:{})});
        return {ok:true,body:{document:await this.detail(tx,{...created.doc,currentVersionId:created.version.id})}};
      });
    }
    if(command.action==="add-photo"){
      return this.database.transaction(async tx=>{
        const [measurement]=await tx.select().from(progressMeasurements).where(eq(progressMeasurements.id,command.measurementId)).for("share");
        if(!measurement) return {ok:false,error:"DOCUMENT_MEASUREMENT_INVALID"};
        const [sub]=await tx.select().from(subscriptions).where(eq(subscriptions.id,measurement.subscriptionId)).for("update");
        if(!sub) return {ok:false,error:"DOCUMENT_NOT_FOUND"};
        await lockConsentDefinitions(tx);
        if(!await this.consentGranted(tx,sub,"progress_photo_storage")) return {ok:false,error:"DOCUMENT_PHOTO_CONSENT_REQUIRED"};
        const now=this.clock();
        const created=await this.createDocument(tx,sub.id,"progress_photo",command,actor,now);
        if(!created.ok) return created;
        await tx.insert(progressPhotos).values({subscriptionId:sub.id,measurementId:measurement.id,documentId:created.doc.id,
          photoType:command.photoType,takenAt:command.takenAt??now,marketingAuthorizationId:null});
        await this.audit(tx,actor,"document",created.doc.id,"document.progress_photo_added",{documentId:created.doc.id,versionId:created.version.id,
          documentType:"progress_photo",sensitivity:"sensitive_health",versionNumber:1});
        return {ok:true,body:{document:await this.detail(tx,{...created.doc,currentVersionId:created.version.id})}};
      });
    }
    if(command.action==="add-version"){
      return this.database.transaction(async tx=>{
        const [doc]=await tx.select().from(documents).where(and(eq(documents.id,id),eq(documents.ownerType,"subscription"))).for("update");
        if(!doc) return {ok:false,error:"DOCUMENT_NOT_FOUND"};
        if(!["available","draft"].includes(doc.status)) return {ok:false,error:"DOCUMENT_STATUS_INVALID"};
        const versions=await tx.select().from(documentVersions).where(eq(documentVersions.documentId,doc.id)).orderBy(documentVersions.versionNumber).for("update");
        if(versions.some(v=>v.sha256===command.file.sha256)) return {ok:false,error:"DOCUMENT_DUPLICATE_UPLOAD"};
        const now=this.clock(), next=(versions.at(-1)?.versionNumber??0)+1;
        const [version]=await tx.insert(documentVersions).values({documentId:doc.id,versionNumber:next,storageKey:command.file.storageKey,
          originalFilename:command.file.originalFilename,mimeType:command.file.mimeType,sizeBytes:command.file.sizeBytes,sha256:command.file.sha256,
          malwareScanStatus:"clean",uploadedByType:"coach",uploadedByUserId:actor.userId,createdAt:now}).returning();
        if(!version) throw new Error("Version insert returned no row");
        await tx.update(documents).set({currentVersionId:version.id,status:"available",updatedAt:now}).where(eq(documents.id,doc.id));
        await this.audit(tx,actor,"document",doc.id,"document.version_added",{documentId:doc.id,versionId:version.id,documentType:doc.documentType,
          sensitivity:doc.sensitivity,versionNumber:next});
        return {ok:true,body:{document:await this.detail(tx,{...doc,currentVersionId:version.id,status:"available",updatedAt:now})}};
      });
    }
    if(command.action==="read"){
      return this.database.transaction(async tx=>{
        const [doc]=await tx.select().from(documents).where(and(eq(documents.id,id),eq(documents.ownerType,"subscription"))); if(!doc) return {ok:false,error:"DOCUMENT_NOT_FOUND"};
        return {ok:true,body:{document:await this.detail(tx,doc)}};
      },{isolationLevel:"repeatable read",accessMode:"read only"});
    }
    if(command.action==="revoke" || command.action==="archive"){
      return this.database.transaction(async tx=>{
        const [doc]=await tx.select().from(documents).where(and(eq(documents.id,id),eq(documents.ownerType,"subscription"))).for("update");
        if(!doc) return {ok:false,error:"DOCUMENT_NOT_FOUND"};
        if(["revoked","archived","pending_purge","purged"].includes(doc.status)) return {ok:false,error:"DOCUMENT_STATUS_INVALID"};
        const now=this.clock(), next=command.action==="revoke"?"revoked":"archived";
        const versions=await tx.select({id:documentVersions.id}).from(documentVersions).where(eq(documentVersions.documentId,doc.id)).for("update");
        const ids=versions.map(v=>v.id);
        if(ids.length) await tx.update(secureAccessTokens).set({revokedAt:now,updatedAt:now}).where(and(eq(secureAccessTokens.resourceType,tokenScope.resourceType),
          eq(secureAccessTokens.action,tokenScope.action),inArray(secureAccessTokens.resourceId,ids)));
        await tx.update(documents).set({status:next,archivedAt:command.action==="archive"?now:doc.archivedAt,updatedAt:now}).where(eq(documents.id,doc.id));
        await this.audit(tx,actor,"document",doc.id,command.action==="revoke"?"document.revoked":"document.archived",
          {documentId:doc.id,documentType:doc.documentType,sensitivity:doc.sensitivity});
        return {ok:true,body:{document:await this.detail(tx,{...doc,status:next,updatedAt:now,archivedAt:command.action==="archive"?now:doc.archivedAt})}};
      });
    }
    if(command.action==="issue-link"){
      return this.database.transaction(async tx=>{
        const [version]=await tx.select().from(documentVersions).where(eq(documentVersions.id,id)).for("share");
        if(!version) return {ok:false,error:"DOCUMENT_VERSION_NOT_FOUND"};
        const [doc]=await tx.select().from(documents).where(and(eq(documents.id,version.documentId),eq(documents.ownerType,"subscription"))).for("update");
        if(!doc) return {ok:false,error:"DOCUMENT_NOT_FOUND"};
        if(doc.status!=="available" || version.malwareScanStatus!=="clean" || doc.documentType==="progress_photo") return {ok:false,error:"DOCUMENT_STATUS_INVALID"};
        const raw=createDocumentBearer(), requires=sensitive(doc.documentType), code=requires?createDocumentVerificationCode():undefined;
        const now=this.clock();
        const ctx:TokenContext=requires&&code?{verification:{codeHash:hashDocumentVerificationCode(code,this.options.verificationPepper),attempts:0,maxAttempts:5,verifiedUntil:null}}:{};
        const [token]=await tx.insert(secureAccessTokens).values({tokenHash:hashDocumentBearer(raw,this.options.tokenPepper),resourceType:tokenScope.resourceType,
          resourceId:version.id,action:tokenScope.action,contextJson:ctx,requiresOtp:requires,expiresAt:command.expiresAt,maxUses:command.maxUses,useCount:0,createdAt:now,updatedAt:now}).returning();
        if(!token) throw new Error("Token insert returned no row");
        await this.audit(tx,actor,"document",doc.id,"document.delivery_link_created",{documentId:doc.id,versionId:version.id,documentType:doc.documentType,
          sensitivity:doc.sensitivity,versionNumber:version.versionNumber,tokenId:token.id});
        return {ok:true,body:{link:{id:token.id,versionId:version.id,expiresAt:token.expiresAt.toISOString(),maxUses:token.maxUses,useCount:0,
          state:"available",requiresVerification:requires},token:raw,...(code?{verificationCode:code}:{})}};
      });
    }
    if(command.action==="revoke-link"){
      return this.database.transaction(async tx=>{
        const [token]=await tx.select().from(secureAccessTokens).where(and(eq(secureAccessTokens.id,id),eq(secureAccessTokens.resourceType,tokenScope.resourceType),
          eq(secureAccessTokens.action,tokenScope.action))).for("update");
        if(!token) return {ok:false,error:"DOCUMENT_LINK_INVALID"};
        if(token.revokedAt) return {ok:false,error:"DOCUMENT_LINK_REVOKED"};
        const now=this.clock(); await tx.update(secureAccessTokens).set({revokedAt:now,updatedAt:now}).where(eq(secureAccessTokens.id,token.id));
        await this.audit(tx,actor,"document_delivery_link",token.id,"document.delivery_link_revoked",{tokenId:token.id,versionId:token.resourceId});
        return {ok:true,body:{revoked:true}};
      });
    }
    if(command.action==="admin-download-prepare" || command.action==="admin-download-audit"){
      return this.database.transaction(async tx=>{
        const [version]=await tx.select().from(documentVersions).where(eq(documentVersions.id,id));
        if(!version) return {ok:false,error:"DOCUMENT_VERSION_NOT_FOUND"};
        const [doc]=await tx.select().from(documents).where(and(eq(documents.id,version.documentId),eq(documents.ownerType,"subscription")));
        if(!doc) return {ok:false,error:"DOCUMENT_NOT_FOUND"};
        if(version.malwareScanStatus!=="clean" || doc.status==="purged" || doc.status==="pending_purge") return {ok:false,error:"DOCUMENT_STATUS_INVALID"};
        if(command.action==="admin-download-audit") {
          await this.audit(tx,actor,"document",doc.id,"document.downloaded_admin",{documentId:doc.id,versionId:version.id,documentType:doc.documentType,
            sensitivity:doc.sensitivity,versionNumber:version.versionNumber});
          return {ok:true,body:{audited:true}};
        }
        return {ok:true,body:{storageKey:version.storageKey,mimeType:version.mimeType,filename:version.originalFilename}};
      });
    }
    if(command.action==="public-read" || command.action==="public-verify" || command.action==="public-download-prepare" || command.action==="public-download-commit"){
      const raw=command.rawToken, hash=hashDocumentBearer(raw,this.options.tokenPepper), now=this.clock();
      return this.database.transaction(async tx=>{
        const [token]=await tx.select().from(secureAccessTokens).where(and(eq(secureAccessTokens.tokenHash,hash),
          eq(secureAccessTokens.resourceType,tokenScope.resourceType),eq(secureAccessTokens.action,tokenScope.action))).for(command.action==="public-read"||command.action==="public-download-prepare"?"share":"update");
        const eventType=command.action==="public-verify"?"document.verify":command.action.includes("download")?"document.download":"document.view";
        if(!token){await this.accessEvent(tx,null,actor,eventType,"invalid"); return {ok:false,error:"DOCUMENT_LINK_INVALID"};}
        const state=tokenState(token,now);
        if(state!=="available"){await this.accessEvent(tx,token.id,actor,eventType,state);
          return {ok:false,error:state==="expired"?"DOCUMENT_LINK_EXPIRED":state==="revoked"?"DOCUMENT_LINK_REVOKED":"DOCUMENT_LINK_EXHAUSTED"};}
        const [version]=await tx.select().from(documentVersions).where(eq(documentVersions.id,token.resourceId)).for("share");
        const [doc]=version?await tx.select().from(documents).where(and(eq(documents.id,version.documentId),eq(documents.ownerType,"subscription"))).for("share"):[];
        if(!version||!doc||doc.status!=="available"||version.malwareScanStatus!=="clean"){
          await this.accessEvent(tx,token.id,actor,eventType,"revoked"); return {ok:false,error:"DOCUMENT_LINK_REVOKED"};}
        const ctx=context(token.contextJson), verification=ctx.verification;
        if(command.action==="public-verify"){
          if(!token.requiresOtp || !verification){await this.accessEvent(tx,token.id,actor,eventType,"not_required");return {ok:true,body:{verified:true,verifiedUntil:token.expiresAt.toISOString()}};}
          if(verification.attempts>=verification.maxAttempts){await this.accessEvent(tx,token.id,actor,eventType,"locked");return {ok:false,error:"DOCUMENT_VERIFICATION_LOCKED"};}
          const supplied=hashDocumentVerificationCode(command.code,this.options.verificationPepper);
          if(!safeEqualText(supplied,verification.codeHash)){
            const next={...ctx,verification:{...verification,attempts:verification.attempts+1}};
            await tx.update(secureAccessTokens).set({contextJson:next,updatedAt:now}).where(eq(secureAccessTokens.id,token.id));
            await this.accessEvent(tx,token.id,actor,eventType,"verification_failed");
            return {ok:false,error:verification.attempts+1>=verification.maxAttempts?"DOCUMENT_VERIFICATION_LOCKED":"DOCUMENT_VERIFICATION_INVALID"};
          }
          const until=new Date(Math.min(token.expiresAt.getTime(),now.getTime()+(this.options.verificationTtlMs??10*60_000)));
          await tx.update(secureAccessTokens).set({contextJson:{...ctx,verification:{...verification,verifiedUntil:until.toISOString()}},updatedAt:now}).where(eq(secureAccessTokens.id,token.id));
          await this.accessEvent(tx,token.id,actor,eventType,"success");
          return {ok:true,body:{verified:true,verifiedUntil:until.toISOString()}};
        }
        if((command.action==="public-download-prepare"||command.action==="public-download-commit")&&token.requiresOtp){
          const until=verification?.verifiedUntil?new Date(verification.verifiedUntil):null;
          if(!until||until<=now){await this.accessEvent(tx,token.id,actor,eventType,"verification_required");return {ok:false,error:"DOCUMENT_VERIFICATION_REQUIRED"};}
        }
        if(command.action==="public-read"){
          await this.accessEvent(tx,token.id,actor,eventType,"success");
          return {ok:true,body:{document:{documentType:dtype(doc.documentType),versionNumber:version.versionNumber,expiresAt:token.expiresAt.toISOString(),requiresVerification:token.requiresOtp}}};
        }
        if(command.action==="public-download-prepare"){
          return {ok:true,body:{storageKey:version.storageKey,mimeType:version.mimeType,filename:version.originalFilename}};
        }
        const nextCount=token.useCount+1, exhausted=token.maxUses!==null&&nextCount>=token.maxUses;
        await tx.update(secureAccessTokens).set({useCount:nextCount,usedAt:exhausted?now:token.usedAt,updatedAt:now}).where(eq(secureAccessTokens.id,token.id));
        await this.accessEvent(tx,token.id,actor,eventType,"success");
        return {ok:true,body:{downloaded:true,useCount:nextCount}};
      });
    }
    return {ok:false,error:"DOCUMENT_INVALID_INPUT"};
  }
}
