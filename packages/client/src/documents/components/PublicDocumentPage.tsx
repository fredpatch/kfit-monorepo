import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { useParams } from "react-router";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { documentErrorMessage, documentsApi } from "../api/documents-api.js";

const labels:Record<string,string>={meal_plan:"Plan alimentaire",workout_plan:"Plan d'entraînement",progress_summary:"Bilan de progression",progress_photo:"Photo de progression",other_personalized:"Document personnalisé"};
function save(blob:Blob){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download="kfit-document";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u);}
export function PublicDocumentPage(){
  const {token=""}=useParams(),[code,setCode]=useState(""),[verified,setVerified]=useState(false),[error,setError]=useState<string|null>(null);
  const meta=useQuery({queryKey:["public-document",token],queryFn:()=>documentsApi.publicMeta(token),enabled:Boolean(token),retry:false});
  const verify=useMutation({mutationFn:()=>documentsApi.verify(token,code),onSuccess:()=>{setVerified(true);setError(null);},onError:e=>setError(documentErrorMessage(e))});
  const download=useMutation({mutationFn:()=>documentsApi.publicDownload(token),onSuccess:b=>{save(b);setError(null);},onError:e=>setError(documentErrorMessage(e))});
  if(meta.isPending)return <main className="mx-auto max-w-md p-6"><p>Chargement du document…</p></main>;
  if(meta.isError||!meta.data)return <main className="mx-auto max-w-md p-6"><h1 className="text-xl font-bold">Lien indisponible</h1><p className="mt-2 text-sm text-muted-foreground">{documentErrorMessage(meta.error)}</p></main>;
  const d=meta.data.document,needs=d.requiresVerification&&!verified;
  return <main className="mx-auto flex min-h-screen max-w-md items-center p-5"><section className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm">
    <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-brand-50 text-primary">{needs?<ShieldCheck/>:<FileText/>}</div>
    <h1 className="text-2xl font-extrabold">{labels[d.documentType]??"Document K'FIT"}</h1><p className="mt-1 text-sm text-muted-foreground">Version {d.versionNumber} · lien temporaire</p>
    {needs?<div className="mt-6"><label className="text-sm font-semibold" htmlFor="code">Code de vérification</label><p className="mb-2 text-xs text-muted-foreground">Saisis le code communiqué séparément par ton coach.</p><Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}/><Button className="mt-3 w-full" disabled={code.length!==6||verify.isPending} onClick={()=>verify.mutate()}>Vérifier</Button></div>
    :<Button className="mt-6 w-full" disabled={download.isPending} onClick={()=>download.mutate()}><Download/>Télécharger le document</Button>}
    {error?<p role="alert" className="mt-3 text-sm text-danger">{error}</p>:null}
    <p className="mt-5 text-xs text-muted-foreground">Ce lien est personnel, limité dans le temps et peut être révoqué par le coach.</p>
  </section></main>;
}
