import axios, { AxiosHeaders } from "axios";
import { authCsrfHeaderName, documentApiRoutes, type DocumentsResponse, type DocumentResponse, type IssueDocumentLinkInput,
  type IssueDocumentLinkResponse, type PublicDocumentMetaResponse, type VerifyDocumentResponse, type PersonalizedDocumentType, type DocumentErrorCode } from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";

const admin=axios.create({baseURL:import.meta.env.VITE_API_BASE_URL??"",withCredentials:true,headers:{accept:"application/json"}});
admin.interceptors.request.use(config=>{if(requiresCsrfHeader(config.method)){const headers=AxiosHeaders.from(config.headers),token=buildCsrfHeaders(config.method)[authCsrfHeaderName];if(token)headers.set(authCsrfHeaderName,token);config.headers=headers;}return config;});
const publicHttp=axios.create({baseURL:import.meta.env.VITE_API_BASE_URL??"",headers:{accept:"application/json"}});
const path=(route:string,id:string)=>route.replace(":subscriptionId",encodeURIComponent(id)).replace(":documentId",encodeURIComponent(id)).replace(":versionId",encodeURIComponent(id)).replace(":tokenId",encodeURIComponent(id)).replace(":measurementId",encodeURIComponent(id));
const fileHeaders=(file:File)=>({"Content-Type":file.type,"X-File-Name":file.name});

export const documentsApi={
  async list(subscriptionId:string){return (await admin.get<DocumentsResponse>(path(documentApiRoutes.list,subscriptionId))).data;},
  async upload(subscriptionId:string,type:Exclude<PersonalizedDocumentType,"progress_summary"|"progress_photo">,file:File){
    return (await admin.post<DocumentResponse>(path(documentApiRoutes.create,subscriptionId),file,{params:{type},headers:fileHeaders(file)})).data;
  },
  async addVersion(documentId:string,file:File){return (await admin.post<DocumentResponse>(path(documentApiRoutes.addVersion,documentId),file,{headers:fileHeaders(file)})).data;},
  async generateSummary(subscriptionId:string){return (await admin.post<DocumentResponse>(path(documentApiRoutes.generateProgressSummary,subscriptionId),{})).data;},
  async addPhoto(measurementId:string,file:File,meta:{photoType?:string;takenAt?:string}={}){
    return (await admin.post<DocumentResponse>(path(documentApiRoutes.addProgressPhoto,measurementId),file,{params:meta,headers:fileHeaders(file)})).data;
  },
  async issueLink(versionId:string,input:IssueDocumentLinkInput){return (await admin.post<IssueDocumentLinkResponse>(path(documentApiRoutes.issueLink,versionId),input)).data;},
  async revokeLink(tokenId:string){return (await admin.post(path(documentApiRoutes.revokeLink,tokenId),{})).data;},
  async revoke(documentId:string){return (await admin.post<DocumentResponse>(path(documentApiRoutes.revoke,documentId),{})).data;},
  async archive(documentId:string){return (await admin.post<DocumentResponse>(path(documentApiRoutes.archive,documentId),{})).data;},
  async adminDownload(versionId:string){return (await admin.get<Blob>(path(documentApiRoutes.adminDownload,versionId),{responseType:"blob"})).data;},
  async publicMeta(token:string){return (await publicHttp.get<PublicDocumentMetaResponse>(documentApiRoutes.publicMeta.replace(":token",encodeURIComponent(token)))).data;},
  async verify(token:string,code:string){return (await publicHttp.post<VerifyDocumentResponse>(documentApiRoutes.publicVerify.replace(":token",encodeURIComponent(token)),{code})).data;},
  async publicDownload(token:string){return (await publicHttp.get<Blob>(documentApiRoutes.publicDownload.replace(":token",encodeURIComponent(token)),{responseType:"blob"})).data;},
};
const messages:Partial<Record<DocumentErrorCode,string>>={
  DOCUMENT_DUPLICATE_UPLOAD:"Ce fichier est déjà enregistré pour ce document.",
  DOCUMENT_FILE_TOO_LARGE:"Le fichier dépasse la limite de 10 Mo.",
  DOCUMENT_FILE_TYPE_UNSUPPORTED:"Format non pris en charge. Utilise PDF, JPG, PNG ou WebP.",
  DOCUMENT_FILE_SIGNATURE_INVALID:"Le contenu du fichier ne correspond pas à son format.",
  DOCUMENT_FILE_INFECTED:"Le fichier a été bloqué par l'analyse antivirus.",
  DOCUMENT_FILE_SCAN_FAILED:"L'analyse antivirus est indisponible. Le fichier n'a pas été enregistré.",
  DOCUMENT_HEALTH_CONSENT_REQUIRED:"Le consentement aux données de santé est requis pour générer un bilan.",
  DOCUMENT_PHOTO_CONSENT_REQUIRED:"Le consentement au stockage des photos de progression est requis.",
  DOCUMENT_STATUS_INVALID:"Cette action n'est plus disponible pour ce document.",
  DOCUMENT_LINK_EXPIRED:"Ce lien a expiré.",DOCUMENT_LINK_REVOKED:"Ce lien a été révoqué.",DOCUMENT_LINK_EXHAUSTED:"Ce lien a atteint son nombre maximal de téléchargements.",
  DOCUMENT_VERIFICATION_REQUIRED:"Saisis le code de vérification communiqué par le coach.",DOCUMENT_VERIFICATION_INVALID:"Code incorrect.",DOCUMENT_VERIFICATION_LOCKED:"Trop de tentatives incorrectes. Demande un nouveau lien au coach.",
};
export function documentErrorMessage(error:unknown){
  const code:unknown=axios.isAxiosError<{error?:unknown}>(error)?error.response?.data.error:undefined;
  return typeof code==="string"&&Object.hasOwn(messages,code)?messages[code as DocumentErrorCode]??"Action impossible.":"Action impossible. Réessaie dans un instant.";
}
