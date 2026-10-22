import assert from "node:assert/strict";
import test from "node:test";
import { DocumentsService, parseUploadDocumentType, type DocumentRepository } from "../services/documents.service.js";
import { PrivateDocumentStorage, MAX_DOCUMENT_BYTES } from "../services/document-storage.service.js";
import { createDocumentBearer, createDocumentVerificationCode, hashDocumentBearer, hashDocumentVerificationCode } from "../services/document-token.crypto.js";
const id="11111111-1111-1111-8111-111111111111",actor={userId:id,requestId:id,ipAddress:null,userAgent:null};
test("upload types exclude generated summary and progress photo",()=>{
  assert.equal(parseUploadDocumentType("meal_plan"),"meal_plan"); assert.equal(parseUploadDocumentType("workout_plan"),"workout_plan");
  assert.equal(parseUploadDocumentType("progress_summary"),null); assert.equal(parseUploadDocumentType("progress_photo"),null); assert.equal(parseUploadDocumentType("x"),null);
});
test("storage signature and extension validation rejects mismatches and oversize",()=>{
  const storage=new PrivateDocumentStorage({root:"/tmp/kfit-never-written"});
  const pdf=Buffer.from("%PDF-1.4\n%%EOF","ascii");
  assert.equal(storage.validate(pdf,"application/pdf","plan.pdf"),"application/pdf");
  assert.throws(()=>storage.validate(pdf,"image/png","plan.png"),/DOCUMENT_FILE_SIGNATURE_INVALID/);
  assert.throws(()=>storage.validate(pdf,"application/pdf","plan.png"),/DOCUMENT_FILE_SIGNATURE_INVALID/);
  assert.throws(()=>storage.validate(Buffer.alloc(MAX_DOCUMENT_BYTES+1),"application/pdf","x.pdf"),/DOCUMENT_FILE_TOO_LARGE/);
});
test("document token and verification secrets are random and hashable",()=>{
  const pepper="synthetic-pepper-at-least-32-characters";
  const a=createDocumentBearer(),b=createDocumentBearer(); assert.notEqual(a,b); assert.equal(a.length,43);
  assert.equal(hashDocumentBearer(a,pepper).length,64); const code=createDocumentVerificationCode(); assert.match(code,/^\d{6}$/); assert.equal(hashDocumentVerificationCode(code,pepper).length,64);
});
test("failed DB commit removes finalized file",async()=>{
  const removed:string[]=[];
  const storage={
    async persist(){return {storageKey:"11111111-1111-1111-8111-111111111111.pdf",originalFilename:"plan.pdf",mimeType:"application/pdf" as const,sizeBytes:8,sha256:"a".repeat(64)};},
    async read(){return Buffer.from("x");}, async remove(key:string){removed.push(key);}
  };
  const repository:DocumentRepository={async execute(){return {ok:false,error:"DOCUMENT_DUPLICATE_UPLOAD"};},async summaryData(){return {ok:false,error:"DOCUMENT_NOT_FOUND"};}};
  const renderer={templateVersion:"v1",async render(){return Buffer.from("%PDF-");}};
  const service=new DocumentsService(repository,storage,renderer);
  const result=await service.upload(id,"meal_plan",{bytes:Buffer.from("%PDF-"),mimeType:"application/pdf",originalFilename:"plan.pdf"},actor);
  assert.deepEqual(result,{ok:false,error:"DOCUMENT_DUPLICATE_UPLOAD"}); assert.equal(removed.length,1);
});
test("public issue input defaults to three uses and rejects invalid limits",async()=>{
  let seen:any;
  const repository:DocumentRepository={async execute(_id,command){seen=command;return {ok:true,body:{}};},async summaryData(){return {ok:false,error:"DOCUMENT_NOT_FOUND"};}};
  const storage={async persist(){throw new Error("unused");},async read(){return Buffer.alloc(0);},async remove(){}};
  const service=new DocumentsService(repository,storage,{templateVersion:"v1",async render(){return Buffer.alloc(0);}});
  const expiresAt=new Date(Date.now()+60_000).toISOString();
  await service.execute(id,"issue-link",{expiresAt},actor); assert.equal(seen.maxUses,3);
  assert.deepEqual(await service.execute(id,"issue-link",{expiresAt,maxUses:0},actor),{ok:false,error:"DOCUMENT_INVALID_INPUT"});
});

test("thrown DB failure also removes finalized file",async()=>{
  const removed:string[]=[];
  const storage={
    async persist(){return {storageKey:"22222222-2222-4222-8222-222222222222.pdf",originalFilename:"plan.pdf",mimeType:"application/pdf" as const,sizeBytes:8,sha256:"b".repeat(64)};},
    async read(){return Buffer.from("x");}, async remove(key:string){removed.push(key);}
  };
  const repository:DocumentRepository={async execute(){throw new Error("synthetic-db-failure");},async summaryData(){return {ok:false,error:"DOCUMENT_NOT_FOUND"};}};
  const service=new DocumentsService(repository,storage,{templateVersion:"v1",async render(){return Buffer.from("%PDF-");}});
  await assert.rejects(service.upload(id,"meal_plan",{bytes:Buffer.from("%PDF-"),mimeType:"application/pdf",originalFilename:"plan.pdf"},actor),/synthetic-db-failure/);
  assert.equal(removed.length,1);
});
