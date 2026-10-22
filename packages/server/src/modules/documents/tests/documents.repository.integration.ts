import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after,before,test } from "node:test";
import { eq,inArray } from "drizzle-orm";
import { db,pool } from "../../../db/client.js";
import { users,auditEvents } from "../../../db/schema/auth.js";
import { customers,subscriptions } from "../../../db/schema/customers.js";
import { services } from "../../../db/schema/catalogue.js";
import { documents,documentVersions,externalAccessEvents,secureAccessTokens } from "../../../db/schema/documents.js";
import { DrizzleDocumentsRepository } from "../repositories/documents.repository.js";

const userId=randomUUID(),customerId=randomUUID(),serviceId=randomUUID(),subs:string[]=[];
const now=new Date("2026-10-22T12:00:00Z");
const repo=new DrizzleDocumentsRepository(db,{auditHashPepper:"document-audit-pepper-12345678901234567890",tokenPepper:"document-token-pepper-12345678901234567890",verificationPepper:"document-code-pepper-12345678901234567890"},()=>new Date(now));
const actor={userId,requestId:randomUUID(),ipAddress:null,userAgent:"docs-test"};
const anon={userId:null,requestId:randomUUID(),ipAddress:null,userAgent:"docs-public-test"};
const file=(sha:string)=>({storageKey:randomUUID()+".pdf",originalFilename:"plan.pdf",mimeType:"application/pdf" as const,sizeBytes:100,sha256:sha});

before(async()=>{
 const u=new URL(process.env.DATABASE_URL??"");assert.ok(["localhost","127.0.0.1"].includes(u.hostname)&&u.port==="5433"&&u.pathname==="/kfit_dev");
 await db.insert(users).values({id:userId,email:`docs-${userId}@example.invalid`,passwordHash:"x",role:"admin",status:"active"});
 await db.insert(customers).values({id:customerId,fullName:"Docs Test",whatsapp:"+241000000001"});
 await db.insert(services).values({id:serviceId,name:"Docs Service",slug:`docs-${serviceId}`,pricingMode:"quote",deliveryType:"time_based",capacityMode:"unlimited"});
});
after(async()=>{try{
 const ds=subs.length?await db.select({id:documents.id}).from(documents).where(inArray(documents.ownerId,subs)):[],dids=ds.map(x=>x.id);
 const vs=dids.length?await db.select({id:documentVersions.id}).from(documentVersions).where(inArray(documentVersions.documentId,dids)):[],vids=vs.map(x=>x.id);
 const ts=vids.length?await db.select({id:secureAccessTokens.id}).from(secureAccessTokens).where(inArray(secureAccessTokens.resourceId,vids)):[],tids=ts.map(x=>x.id);
 if(tids.length)await db.delete(externalAccessEvents).where(inArray(externalAccessEvents.secureAccessTokenId,tids));
 if(vids.length)await db.delete(secureAccessTokens).where(inArray(secureAccessTokens.resourceId,vids));
 if(vids.length)await db.delete(documentVersions).where(inArray(documentVersions.id,vids));
 if(dids.length)await db.delete(documents).where(inArray(documents.id,dids));
 if(subs.length)await db.delete(subscriptions).where(inArray(subscriptions.id,subs));
 await db.delete(auditEvents).where(eq(auditEvents.actorUserId,userId));await db.delete(services).where(eq(services.id,serviceId));await db.delete(customers).where(eq(customers.id,customerId));await db.delete(users).where(eq(users.id,userId));
}finally{await pool.end();}});
async function makeSub(){const id=randomUUID();subs.push(id);await db.insert(subscriptions).values({id,reference:`SUB-DOC-${id}`,customerId,serviceId,status:"active",agreedPriceXaf:1,createdByUserId:userId});return id;}

test("versions are immutable and duplicate sha is rejected",async()=>{
 const id=await makeSub(),f1=file("a".repeat(64));const c=await repo.execute(id,{action:"create-upload",documentType:"meal_plan",file:f1},actor);assert.ok(c.ok);
 const doc=c.body.document;assert.equal(doc.versions.length,1);
 assert.deepEqual(await repo.execute(id,{action:"create-upload",documentType:"meal_plan",file:f1},actor),{ok:false,error:"DOCUMENT_DUPLICATE_UPLOAD"});
 const v2=await repo.execute(doc.id,{action:"add-version",file:file("b".repeat(64))},actor);assert.ok(v2.ok);assert.deepEqual(v2.body.document.versions.map((v:any)=>v.versionNumber),[1,2]);
});

test("public link is hash-only, read is non-consuming and maxUses exhausts",async()=>{
 const id=await makeSub();const c=await repo.execute(id,{action:"create-upload",documentType:"meal_plan",file:file("c".repeat(64))},actor);assert.ok(c.ok);
 const versionId=c.body.document.currentVersionId;const issued=await repo.execute(versionId,{action:"issue-link",expiresAt:new Date(now.getTime()+60000),maxUses:3},actor);assert.ok(issued.ok);
 const [stored]=await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id,issued.body.link.id));assert.ok(stored);assert.notEqual(stored.tokenHash,issued.body.token);assert.equal(stored.useCount,0);
 assert.ok((await repo.execute("",{action:"public-read",rawToken:issued.body.token},anon)).ok);
 const [afterRead]=await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id,stored.id));assert.equal(afterRead?.useCount,0);
 for(let n=1;n<=3;n++){const r=await repo.execute("",{action:"public-download-commit",rawToken:issued.body.token},anon);assert.ok(r.ok);assert.equal(r.body.useCount,n);}
 assert.deepEqual(await repo.execute("",{action:"public-download-commit",rawToken:issued.body.token},anon),{ok:false,error:"DOCUMENT_LINK_EXHAUSTED"});
});
