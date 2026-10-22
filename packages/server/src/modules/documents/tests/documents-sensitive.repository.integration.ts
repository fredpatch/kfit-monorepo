import "dotenv/config";
import assert from "node:assert/strict";
import { createHash,randomUUID } from "node:crypto";
import { after,before,test } from "node:test";
import { eq,inArray } from "drizzle-orm";
import { db,pool } from "../../../db/client.js";
import { users,auditEvents } from "../../../db/schema/auth.js";
import { progressMeasurements,progressPhotos } from "../../../db/schema/coaching.js";
import { customers,subscriptions } from "../../../db/schema/customers.js";
import { services } from "../../../db/schema/catalogue.js";
import { consentDefinitions,consentRecords } from "../../../db/schema/onboarding.js";
import { documents,documentVersions,externalAccessEvents,secureAccessTokens } from "../../../db/schema/documents.js";
import { DrizzleDocumentsRepository } from "../repositories/documents.repository.js";

const userId=randomUUID(),customerId=randomUUID(),serviceId=randomUUID(),healthId=randomUUID(),photoId=randomUUID(),subs:string[]=[];
const now=new Date("2026-10-22T12:00:00Z");
const repo=new DrizzleDocumentsRepository(db,{auditHashPepper:"doc-audit-pepper-1234567890123456789012",tokenPepper:"doc-token-pepper-1234567890123456789012",verificationPepper:"doc-code-pepper-1234567890123456789012"},()=>new Date(now));
const actor={userId,requestId:randomUUID(),ipAddress:null,userAgent:"sensitive-doc-test"},anon={userId:null,requestId:randomUUID(),ipAddress:null,userAgent:"sensitive-public-test"};
const pdf={storageKey:randomUUID()+".pdf",originalFilename:"summary.pdf",mimeType:"application/pdf" as const,sizeBytes:100,sha256:"d".repeat(64)};
before(async()=>{
 const u=new URL(process.env.DATABASE_URL??"");assert.ok(["localhost","127.0.0.1"].includes(u.hostname)&&u.port==="5433"&&u.pathname==="/kfit_dev");
 await db.insert(users).values({id:userId,email:`docs-sensitive-${userId}@example.invalid`,passwordHash:"x",role:"admin",status:"active"});
 await db.insert(customers).values({id:customerId,fullName:"Sensitive Docs Test",whatsapp:"+241000000002"});
 await db.insert(services).values({id:serviceId,name:"Sensitive Docs Service",slug:`docs-sensitive-${serviceId}`,pricingMode:"quote",deliveryType:"time_based",capacityMode:"unlimited"});
 for(const [id,type] of [[healthId,"health_data"],[photoId,"progress_photo_storage"]] as const){const content="Synthetic "+type;await db.insert(consentDefinitions).values({id,consentType:type,version:"2147483646",title:content,content,contentHash:createHash("sha256").update(content).digest("hex"),status:"published",publishedAt:new Date(now.getTime()-10000)});}
});
after(async()=>{try{
 const ds=subs.length?await db.select({id:documents.id}).from(documents).where(inArray(documents.ownerId,subs)):[],dids=ds.map(x=>x.id);
 const vs=dids.length?await db.select({id:documentVersions.id}).from(documentVersions).where(inArray(documentVersions.documentId,dids)):[],vids=vs.map(x=>x.id);
 const ts=vids.length?await db.select({id:secureAccessTokens.id}).from(secureAccessTokens).where(inArray(secureAccessTokens.resourceId,vids)):[],tids=ts.map(x=>x.id);
 if(tids.length)await db.delete(externalAccessEvents).where(inArray(externalAccessEvents.secureAccessTokenId,tids));
 if(vids.length)await db.delete(secureAccessTokens).where(inArray(secureAccessTokens.resourceId,vids));
 if(subs.length)await db.delete(progressPhotos).where(inArray(progressPhotos.subscriptionId,subs));
 if(vids.length)await db.delete(documentVersions).where(inArray(documentVersions.id,vids));if(dids.length)await db.delete(documents).where(inArray(documents.id,dids));
 if(subs.length){await db.delete(progressMeasurements).where(inArray(progressMeasurements.subscriptionId,subs));await db.delete(consentRecords).where(inArray(consentRecords.subscriptionId,subs));await db.delete(subscriptions).where(inArray(subscriptions.id,subs));}
 await db.delete(auditEvents).where(eq(auditEvents.actorUserId,userId));await db.delete(consentDefinitions).where(inArray(consentDefinitions.id,[healthId,photoId]));await db.delete(services).where(eq(services.id,serviceId));await db.delete(customers).where(eq(customers.id,customerId));await db.delete(users).where(eq(users.id,userId));
}finally{await pool.end();}});
async function makeSub(){const id=randomUUID();subs.push(id);await db.insert(subscriptions).values({id,reference:`SUB-SDOC-${id}`,customerId,serviceId,status:"active",agreedPriceXaf:1,createdByUserId:userId});return id;}
async function grant(subId:string,defId:string){await db.insert(consentRecords).values({customerId,subscriptionId:subId,consentDefinitionId:defId,decision:"granted",capturedVia:"coach_assisted",capturedByUserId:userId,capturedAt:now});}

test("progress summary requires health consent and verification before download",async()=>{
 const id=await makeSub();assert.deepEqual(await repo.execute(id,{action:"generate-summary",file:pdf,templateVersion:"v1"},actor),{ok:false,error:"DOCUMENT_HEALTH_CONSENT_REQUIRED"});
 await grant(id,healthId);const created=await repo.execute(id,{action:"generate-summary",file:pdf,templateVersion:"v1"},actor);assert.ok(created.ok);
 const issued=await repo.execute(created.body.document.currentVersionId,{action:"issue-link",expiresAt:new Date(now.getTime()+60000),maxUses:3},actor);assert.ok(issued.ok);assert.match(issued.body.verificationCode,/^\d{6}$/);
 const [token]=await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id,issued.body.link.id));assert.ok(!JSON.stringify(token?.contextJson).includes(issued.body.verificationCode));
 assert.deepEqual(await repo.execute("",{action:"public-download-commit",rawToken:issued.body.token},anon),{ok:false,error:"DOCUMENT_VERIFICATION_REQUIRED"});
 const wrong=issued.body.verificationCode==="000000"?"999999":"000000";assert.deepEqual(await repo.execute("",{action:"public-verify",rawToken:issued.body.token,code:wrong},anon),{ok:false,error:"DOCUMENT_VERIFICATION_INVALID"});
 assert.ok((await repo.execute("",{action:"public-verify",rawToken:issued.body.token,code:issued.body.verificationCode},anon)).ok);assert.ok((await repo.execute("",{action:"public-download-commit",rawToken:issued.body.token},anon)).ok);
});

test("progress photo requires dedicated consent and has no public delivery link",async()=>{
 const id=await makeSub(),measurementId=randomUUID();await db.insert(progressMeasurements).values({id:measurementId,subscriptionId:id,measuredAt:now,weightKg:"80.00",createdByUserId:userId});
 const image={storageKey:randomUUID()+".jpg",originalFilename:"progress.jpg",mimeType:"image/jpeg" as const,sizeBytes:100,sha256:"e".repeat(64)};
 assert.deepEqual(await repo.execute(measurementId,{action:"add-photo",measurementId,photoType:"front",takenAt:now,file:image},actor),{ok:false,error:"DOCUMENT_PHOTO_CONSENT_REQUIRED"});
 await grant(id,photoId);const created=await repo.execute(measurementId,{action:"add-photo",measurementId,photoType:"front",takenAt:now,file:image},actor);assert.ok(created.ok);
 const [link]=await db.select().from(progressPhotos).where(eq(progressPhotos.documentId,created.body.document.id));assert.ok(link);assert.equal(link.marketingAuthorizationId,null);
 assert.deepEqual(await repo.execute(created.body.document.currentVersionId,{action:"issue-link",expiresAt:new Date(now.getTime()+60000),maxUses:3},actor),{ok:false,error:"DOCUMENT_STATUS_INVALID"});
});

test("sensitive verification locks after five wrong attempts without exposing document bytes",async()=>{
 const id=await makeSub();await grant(id,healthId);
 const localPdf={...pdf,storageKey:randomUUID()+".pdf",sha256:"9".repeat(64)};
 const created=await repo.execute(id,{action:"generate-summary",file:localPdf,templateVersion:"v1"},actor);assert.ok(created.ok);
 const issued=await repo.execute(created.body.document.currentVersionId,{action:"issue-link",expiresAt:new Date(now.getTime()+60000),maxUses:3},actor);assert.ok(issued.ok);
 const wrong=issued.body.verificationCode==="000000"?"999999":"000000";
 for(let n=1;n<=4;n++)assert.deepEqual(await repo.execute("",{action:"public-verify",rawToken:issued.body.token,code:wrong},anon),{ok:false,error:"DOCUMENT_VERIFICATION_INVALID"});
 assert.deepEqual(await repo.execute("",{action:"public-verify",rawToken:issued.body.token,code:wrong},anon),{ok:false,error:"DOCUMENT_VERIFICATION_LOCKED"});
 assert.deepEqual(await repo.execute("",{action:"public-verify",rawToken:issued.body.token,code:issued.body.verificationCode},anon),{ok:false,error:"DOCUMENT_VERIFICATION_LOCKED"});
 const [stored]=await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id,issued.body.link.id));const ctx=stored?.contextJson as any;assert.equal(ctx?.verification?.attempts,5);
});
