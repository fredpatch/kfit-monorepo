import { useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuoteDecision } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
import { dateTimeFr } from "../../lib/format.js";
import { downloadQuote, quoteErrorMessage, quotesApi } from "../api/quotes-api.js";

const labels: Record<QuoteDecision, string> = { accepted: "Accepter", declined: "Refuser", changes_requested: "Demander une modification" };
const outcomes: Record<QuoteDecision, string> = { accepted: "Devis accepté", declined: "Devis refusé", changes_requested: "Demande de modification enregistrée" };
export function PublicQuotePage() {
  useLayoutEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="referrer"]'), meta = existing ?? document.createElement("meta"), previous = meta.content;
    meta.name = "referrer"; meta.content = "no-referrer"; if (!existing) document.head.appendChild(meta);
    return () => { if (existing) meta.content = previous; else meta.remove(); };
  }, []);
  const { token = "" } = useParams(), client = useQueryClient(), queryKey = ["public-quote", token] as const;
  const query = useQuery({ queryKey, queryFn: () => quotesApi.publicDetail(token), retry: false, enabled: Boolean(token) });
  const [decision, setDecision] = useState<QuoteDecision | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false), opener = useRef<HTMLButtonElement | null>(null), heading = useRef<HTMLHeadingElement>(null);
  async function respond() {
    if (!decision || inFlight.current) return; inFlight.current = true; setBusy(true); setError(null);
    try { const result = await quotesApi.respond(token, decision); client.setQueryData(queryKey, result); setDecision(null); }
    catch (failure) { setError(quoteErrorMessage(failure)); await query.refetch(); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function pdf() {
    if (inFlight.current || !query.data) return; inFlight.current = true; setBusy(true); setError(null);
    try { downloadQuote(await quotesApi.publicPdf(token), `${query.data.snapshot.quoteNumber}-v${query.data.snapshot.versionNumber}.pdf`); }
    catch (failure) { setError(quoteErrorMessage(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (token && query.isPending) return <main className="mx-auto max-w-2xl px-5 py-12"><p role="status">Chargement du devis…</p></main>;
  if (!token || query.isError || !query.data) return <main className="mx-auto max-w-xl px-5 py-12"><p className="font-extrabold text-primary">K'FIT</p><h1 className="mt-8 text-2xl font-extrabold">Devis indisponible</h1><p className="mt-3 text-sm text-muted-foreground">{quoteErrorMessage(query.error)}</p><Button className="mt-5" variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button></main>;
  const data = query.data, s = data.snapshot;
  return <main className="min-h-screen bg-background px-4 py-8 sm:py-12"><article className="mx-auto max-w-2xl space-y-7 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
    <header className="space-y-3 border-b border-border-subtle pb-6"><p className="text-xl font-extrabold tracking-tight text-primary">K'FIT</p><h1 ref={heading} tabIndex={-1} className="break-words text-3xl font-extrabold">Devis {s.quoteNumber}</h1><p className="text-sm text-muted-foreground">Version {s.versionNumber} · Émis le {dateTimeFr(s.issuedAt)}</p><p className="text-sm">Valable jusqu’au <strong>{dateTimeFr(s.validUntil)}</strong> — heure de Libreville</p></header>
    <section className="space-y-3" aria-label="Prestation proposée"><h2 className="text-lg font-bold">{s.serviceLabel}</h2>{s.variantLabel && <p className="text-sm">Formule : {s.variantLabel}</p>}{s.durationValue !== null && <p className="text-sm">Durée : {s.durationValue} {s.durationUnit === "week" ? "semaine(s)" : s.durationUnit === "month" ? "mois" : s.durationUnit === "day" ? "jour(s)" : s.durationUnit}</p>}{s.components.length > 0 && <ul className="list-inside list-disc space-y-1 text-sm">{s.components.map((item, i) => <li key={i}>{item.label} · {item.quantity}</li>)}</ul>}<p className="rounded-xl bg-brand-50 p-5 text-2xl font-extrabold tabular-nums">Total : {s.amountXaf.toLocaleString("fr-FR")} FCFA</p></section>
    <section aria-label="Conditions commerciales"><h2 className="text-lg font-bold">Conditions commerciales</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{s.terms}</p></section>
    <Button variant="secondary" className="w-full sm:w-auto" disabled={busy} onClick={() => void pdf()}>Télécharger le PDF</Button>
    <section className="space-y-4 border-t border-border-subtle pt-6" aria-label="Réponse au devis">
      {data.response ? <div role="status" className="rounded-lg bg-success-soft p-4"><h2 className="font-bold">{outcomes[data.response]}</h2><p className="mt-2 text-sm">Ta réponse est enregistrée pour cette version. Ton coach assurera la suite.</p></div> : <><h2 className="text-lg font-bold">Ta réponse</h2><p className="text-sm text-muted-foreground">La consultation et le téléchargement du PDF n’enregistrent aucune réponse.</p><div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{(["accepted", "declined", "changes_requested"] as const).map(value => <Button key={value} disabled={busy || !data.canRespond} variant={value === "accepted" ? "default" : "secondary"} onClick={event => { opener.current = event.currentTarget; setDecision(value); setError(null); }}>{labels[value]}</Button>)}</div></>}
      {error && !decision && <p role="alert" className="text-sm text-danger">{error}</p>}
    </section><footer className="text-xs leading-relaxed text-muted-foreground">Lien personnel et temporaire. Ne le partage pas. Pour toute question, contacte directement ton coach.</footer>
  </article>
    <Dialog open={Boolean(decision)} onOpenChange={open => { if (!open && !busy) setDecision(null); }}>{decision && <DialogContent title={labels[decision]} description={`Confirme ta réponse pour le devis ${s.quoteNumber}, version ${s.versionNumber}.`} onCloseAutoFocus={event => { event.preventDefault(); (opener.current?.isConnected ? opener.current : heading.current)?.focus(); }}>
      <p className="text-sm">Cette réponse sera définitive pour cette version du devis. Vérifie le montant de {s.amountXaf.toLocaleString("fr-FR")} FCFA, la validité et les conditions avant de confirmer.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button disabled={busy} variant="secondary" onClick={() => setDecision(null)}>Retour</Button><Button disabled={busy} onClick={() => void respond()}>{busy ? "Enregistrement…" : "Confirmer ma réponse"}</Button></div>
    </DialogContent>}</Dialog>
  </main>;
}
