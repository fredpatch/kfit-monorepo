import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Download, FilePlus2, Link2, RefreshCw, ShieldCheck, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { PersonalizedDocument, PersonalizedDocumentType } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, NativeSelect } from "../../components/ui/input.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { dateTimeFr } from "../../lib/format.js";
import { progressApi } from "../../progress/api/progress-api.js";
import { documentErrorMessage, documentsApi } from "../api/documents-api.js";

const labels:Record<PersonalizedDocumentType,string>={meal_plan:"Plan alimentaire",workout_plan:"Plan d'entraînement",progress_summary:"Bilan de progression",progress_photo:"Photo de progression",other_personalized:"Document personnalisé"};
type UploadType="meal_plan"|"workout_plan"|"other_personalized";

function downloadBlob(blob:Blob,filename:string){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}

function DocumentCard({doc,onChanged}:{doc:PersonalizedDocument;onChanged:()=>void}){
  const [file,setFile]=useState<File|null>(null);
  const [issued,setIssued]=useState<{url:string;code?:string}|null>(null);
  const current=doc.versions.find(v=>v.id===doc.currentVersionId)??doc.versions.at(-1);
  const versionMutation=useMutation({mutationFn:()=>file?documentsApi.addVersion(doc.id,file):Promise.reject(new Error("file")),onSuccess:()=>{setFile(null);toast.success("Nouvelle version enregistrée");onChanged();},onError:e=>toast.error(documentErrorMessage(e))});
  const linkMutation=useMutation({mutationFn:()=>current?documentsApi.issueLink(current.id,{expiresAt:new Date(Date.now()+24*60*60_000).toISOString(),maxUses:3}):Promise.reject(new Error("version")),
    onSuccess:r=>{setIssued({url:window.location.origin+"/document/"+r.token,code:r.verificationCode});onChanged();},onError:e=>toast.error(documentErrorMessage(e))});
  const revokeMutation=useMutation({mutationFn:()=>documentsApi.revoke(doc.id),onSuccess:()=>{toast.success("Document révoqué");onChanged();},onError:e=>toast.error(documentErrorMessage(e))});
  const archiveMutation=useMutation({mutationFn:()=>documentsApi.archive(doc.id),onSuccess:()=>{toast.success("Document archivé");onChanged();},onError:e=>toast.error(documentErrorMessage(e))});
  return <article className="rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-bold">{labels[doc.documentType]}</h3><p className="text-xs text-muted-foreground">{doc.sensitivity==="sensitive_health"?"Donnée sensible · vérification renforcée":"Privé"} · {doc.status}</p></div>
      {current?<Button size="sm" variant="secondary" onClick={async()=>{try{downloadBlob(await documentsApi.adminDownload(current.id),labels[doc.documentType]+".pdf");}catch(e){toast.error(documentErrorMessage(e));}}}><Download/>Télécharger</Button>:null}
    </div>
    <div className="mt-4 space-y-2">
      {doc.versions.map(v=><div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
        <span>Version {v.versionNumber}{v.isCurrent?" · actuelle":""} · {Math.ceil(v.sizeBytes/1024)} Ko · {dateTimeFr(v.createdAt)}</span>
        <span className="font-mono text-xs text-muted-foreground">{v.sha256.slice(0,10)}…</span>
      </div>)}
    </div>
    {doc.status==="available"?<div className="mt-4 grid gap-3 lg:grid-cols-2">
      <div className="rounded-md border border-border p-3"><p className="mb-2 text-sm font-semibold">Ajouter une version</p><Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setFile(e.target.files?.[0]??null)}/><Button className="mt-2" size="sm" variant="secondary" disabled={!file||versionMutation.isPending} onClick={()=>versionMutation.mutate()}><Upload/>Versionner</Button></div>
      {doc.documentType!=="progress_photo"?<div className="rounded-md border border-border p-3"><p className="mb-2 text-sm font-semibold">Lien temporaire</p><Button size="sm" disabled={!current||linkMutation.isPending} onClick={()=>linkMutation.mutate()}><Link2/>Créer un lien 24 h · 3 usages</Button>
        {issued?<div className="mt-3 rounded-md bg-brand-50 p-3 text-xs"><p className="break-all font-semibold">{issued.url}</p>{issued.code?<p className="mt-2">Code séparé à communiquer : <strong className="font-mono text-base">{issued.code}</strong></p>:null}<p className="mt-1 text-muted-foreground">Le secret/code n'est affiché qu'après cette création.</p></div>:null}</div>:<div className="rounded-md border border-border p-3 text-sm text-muted-foreground">Photo privée : aucun lien public n’est généré en V1 Core.</div>}
    </div>:null}
    {doc.deliveryLinks.length?<div className="mt-4"><p className="mb-2 text-sm font-semibold">Liens émis</p>{doc.deliveryLinks.map(l=><div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle py-2 text-xs"><span>{l.state} · {l.useCount}/{l.maxUses??"∞"} usages · expire {dateTimeFr(l.expiresAt)}</span>{l.state==="available"?<Button size="sm" variant="ghost" onClick={async()=>{try{await documentsApi.revokeLink(l.id);toast.success("Lien révoqué");onChanged();}catch(e){toast.error(documentErrorMessage(e));}}}>Révoquer</Button>:null}</div>)}</div>:null}
    {doc.status==="available"?<div className="mt-4 flex gap-2 border-t border-border-subtle pt-3"><Button size="sm" variant="destructive" disabled={revokeMutation.isPending} onClick={()=>revokeMutation.mutate()}><Trash2/>Révoquer</Button><Button size="sm" variant="secondary" disabled={archiveMutation.isPending} onClick={()=>archiveMutation.mutate()}><Archive/>Archiver</Button></div>:null}
  </article>;
}

export function AdminDocumentsPanel({subscriptionId}:{subscriptionId:string}){
  const qc=useQueryClient();
  const key=["documents",subscriptionId];
  const query=useQuery({queryKey:key,queryFn:()=>documentsApi.list(subscriptionId)});
  const progress=useQuery({queryKey:["progress",subscriptionId],queryFn:()=>progressApi.progress(subscriptionId)});
  const [type,setType]=useState<UploadType>("meal_plan"),[file,setFile]=useState<File|null>(null);
  const [photoFile,setPhotoFile]=useState<File|null>(null),[measurementId,setMeasurementId]=useState("");
  const refresh=()=>void qc.invalidateQueries({queryKey:key});
  const upload=useMutation({mutationFn:()=>file?documentsApi.upload(subscriptionId,type,file):Promise.reject(new Error("file")),onSuccess:()=>{setFile(null);toast.success("Document enregistré");refresh();},onError:e=>toast.error(documentErrorMessage(e))});
  const summary=useMutation({mutationFn:()=>documentsApi.generateSummary(subscriptionId),onSuccess:()=>{toast.success("Bilan PDF généré");refresh();},onError:e=>toast.error(documentErrorMessage(e))});
  const photo=useMutation({mutationFn:()=>photoFile&&measurementId?documentsApi.addPhoto(measurementId,photoFile,{photoType:"progress"}):Promise.reject(new Error("photo")),onSuccess:()=>{setPhotoFile(null);toast.success("Photo privée enregistrée");refresh();},onError:e=>toast.error(documentErrorMessage(e))});
  const measurements=progress.data?.progress.measurements??[];
  const docs=useMemo(()=>query.data?.documents??[],[query.data]);
  if(query.isPending)return <p role="status" className="text-sm text-muted-foreground">Chargement des documents…</p>;
  if(query.isError)return <EmptyState title="Impossible de charger les documents" description="Réessaie dans un instant." action={<Button variant="secondary" onClick={()=>void query.refetch()}><RefreshCw/>Réessayer</Button>}/>;
  return <div className="space-y-5">
    <section className="grid gap-4 rounded-xl border border-border bg-card p-4 lg:grid-cols-3">
      <div><h2 className="font-bold">Ajouter un document</h2><p className="text-xs text-muted-foreground">PDF/JPG/PNG/WebP · 10 Mo max · analyse antivirus avant enregistrement.</p>
        <NativeSelect className="mt-3" value={type} onChange={e=>setType(e.target.value as UploadType)}><option value="meal_plan">Plan alimentaire</option><option value="workout_plan">Plan d'entraînement</option><option value="other_personalized">Autre document</option></NativeSelect>
        <Input className="mt-2" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setFile(e.target.files?.[0]??null)}/><Button className="mt-2" disabled={!file||upload.isPending} onClick={()=>upload.mutate()}><FilePlus2/>Enregistrer</Button></div>
      <div><h2 className="font-bold">Bilan de progression</h2><p className="text-xs text-muted-foreground">PDF généré depuis les faits K'FIT. Le consentement santé doit être actuellement accordé.</p><Button className="mt-3" variant="secondary" disabled={summary.isPending} onClick={()=>summary.mutate()}><ShieldCheck/>Générer le bilan</Button></div>
      <div><h2 className="font-bold">Photo de progression privée</h2><p className="text-xs text-muted-foreground">Nécessite le consentement stockage photo. Aucune publication n'est créée.</p>
        <NativeSelect className="mt-3" value={measurementId} onChange={e=>setMeasurementId(e.target.value)}><option value="">Associer à une mesure…</option>{measurements.map(m=><option key={m.id} value={m.id}>{dateTimeFr(m.measuredAt)}</option>)}</NativeSelect>
        <Input className="mt-2" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={e=>setPhotoFile(e.target.files?.[0]??null)}/><Button className="mt-2" variant="secondary" disabled={!measurementId||!photoFile||photo.isPending} onClick={()=>photo.mutate()}><Upload/>Stocker la photo</Button></div>
    </section>
    {docs.length?<div className="grid gap-4 xl:grid-cols-2">{docs.map(d=><DocumentCard key={d.id} doc={d} onChanged={refresh}/>)}</div>:<EmptyState title="Aucun document" description="Ajoute un plan, génère un bilan ou enregistre une photo de progression privée."/>}
  </div>;
}
