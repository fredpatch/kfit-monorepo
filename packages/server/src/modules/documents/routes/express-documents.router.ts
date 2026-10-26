import { respondIfSubjectArchived } from "../../privacy/routes/subject-archived.response.js";
import { randomUUID } from "node:crypto";
import { Router, raw, type Request, type Response } from "express";
import { documentApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import { requireCsrf, requireSameOrigin } from "../../auth/middleware/auth.middleware.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import type { DocumentsController, DocumentControllerResult } from "../controllers/documents.controller.js";

const uploadRaw=raw({type:["application/pdf","image/jpeg","image/png","image/webp"],limit:"11mb"});
export function createExpressDocumentsRouter(deps:{controller:DocumentsController;resolveSession:ExpressAuthSessionResolver;rateLimiter?:IpRateLimiter;onRateLimited?:(() => void) | undefined}){
  const router=Router(), limiter=deps.rateLimiter??new IpRateLimiter({windowMs:60_000,maxPerWindow:30,onRefused:deps.onRateLimited});
  const param=(req:Request,name:string)=>typeof req.params[name]==="string"?req.params[name]:"";
  async function context(req:Request,isPublic=false):Promise<AuthHttpRequestContext>{
    const headers:Record<string,string|undefined>={}; for(const [k,v] of Object.entries(req.headers)) headers[k]=Array.isArray(v)?v[0]:v;
    return {requestId:headers["x-request-id"]??randomUUID(),method:req.method as AuthHttpRequestContext["method"],path:isPublic?"/public/documents/[redacted]":req.path,
      headers,cookies:parseCookieHeader(headers.cookie),session:isPublic?null:await deps.resolveSession(req),ipAddress:req.ip??null,userAgent:headers["user-agent"]??null};
  }
  function send(res:Response,result:DocumentControllerResult){
    res.set({"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"});
    if("binary" in result){
      const safe=result.binary.filename.replace(/[\r\n"]/g,"_");
      res.status(result.status).set({"Content-Type":result.binary.mimeType,"Content-Disposition":'attachment; filename="'+safe+'"'}).send(result.binary.bytes); return;
    }
    res.status(result.status).json(result.body);
  }
  async function admin(req:Request,res:Response,fn:(ctx:AuthHttpRequestContext)=>Promise<DocumentControllerResult>,mutating:boolean){
    try{
      const ctx=await context(req);
      const guard=requireSameOrigin(ctx)??(mutating?requireCsrf(ctx):null);
      if(guard){res.status(guard.status).json(guard.body);return;}
      send(res,await fn(ctx));
    }catch(error){if(!respondIfSubjectArchived(res,error))res.status(500).json({error:"DOCUMENT_ROUTE_UNEXPECTED_FAILURE"});}
  }
  const payload=(req:Request)=>({bytes:Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0),mimeType:req.headers["content-type"]??"",
    originalFilename:typeof req.headers["x-file-name"]==="string"?req.headers["x-file-name"]:"document"});

  router.get(documentApiRoutes.list,(q,s)=>void admin(q,s,c=>deps.controller.execute(c,param(q,"subscriptionId"),"list",{}),false));
  router.post(documentApiRoutes.create,uploadRaw,(q,s)=>void admin(q,s,c=>deps.controller.upload(c,param(q,"subscriptionId"),q.query.type,payload(q)),true));
  router.get(documentApiRoutes.detail,(q,s)=>void admin(q,s,c=>deps.controller.execute(c,param(q,"documentId"),"read",{}),false));
  router.post(documentApiRoutes.addVersion,uploadRaw,(q,s)=>void admin(q,s,c=>deps.controller.addVersion(c,param(q,"documentId"),payload(q)),true));
  router.get(documentApiRoutes.adminDownload,(q,s)=>void admin(q,s,c=>deps.controller.adminDownload(c,param(q,"versionId")),false));
  router.post(documentApiRoutes.issueLink,(q,s)=>void admin(q,s,c=>deps.controller.execute(c,param(q,"versionId"),"issue-link",q.body??{}),true));
  router.post(documentApiRoutes.revokeLink,(q,s)=>void admin(q,s,c=>deps.controller.execute(c,param(q,"tokenId"),"revoke-link",{}),true));
  router.post(documentApiRoutes.revoke,(q,s)=>void admin(q,s,c=>deps.controller.execute(c,param(q,"documentId"),"revoke",{}),true));
  router.post(documentApiRoutes.archive,(q,s)=>void admin(q,s,c=>deps.controller.execute(c,param(q,"documentId"),"archive",{}),true));
  router.post(documentApiRoutes.generateProgressSummary,(q,s)=>void admin(q,s,c=>deps.controller.generateSummary(c,param(q,"subscriptionId")),true));
  router.post(documentApiRoutes.addProgressPhoto,uploadRaw,(q,s)=>void admin(q,s,c=>deps.controller.addPhoto(c,param(q,"measurementId"),payload(q),{photoType:q.query.photoType,takenAt:q.query.takenAt}),true));

  async function publicRoute(req:Request,res:Response,fn:(ctx:AuthHttpRequestContext)=>Promise<DocumentControllerResult>){
    res.set({"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"});
    if(!limiter.allow(req.ip??"unknown")){res.status(429).json({error:"DOCUMENT_RATE_LIMITED"});return;}
    try{send(res,await fn(await context(req,true)));}catch(error){if(!respondIfSubjectArchived(res,error))res.status(500).json({error:"DOCUMENT_ROUTE_UNEXPECTED_FAILURE"});}
  }
  router.get(documentApiRoutes.publicMeta,(q,s)=>void publicRoute(q,s,c=>deps.controller.publicMeta(param(q,"token"),c)));
  router.post(documentApiRoutes.publicVerify,(q,s)=>void publicRoute(q,s,c=>deps.controller.publicVerify(param(q,"token"),q.body??{},c)));
  router.get(documentApiRoutes.publicDownload,(q,s)=>void publicRoute(q,s,c=>deps.controller.publicDownload(param(q,"token"),c)));
  return router;
}
