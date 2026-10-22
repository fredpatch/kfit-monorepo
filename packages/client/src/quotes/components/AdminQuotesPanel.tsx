import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuoteDetail, QuoteVersion, QuoteStatus, QuoteResponse } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, Textarea } from "../../components/ui/input.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { dateTimeFr, fromLocalInput, toLocalInput } from "../../lib/format.js";
import { downloadQuote, quoteErrorMessage, quotesApi } from "../api/quotes-api.js";
const statusLabels: Record<QuoteStatus, string> = { draft: "Brouillon", issued: "Émis", accepted: "Accepté", declined: "Refusé", changes_requested: "Modification demandée", cancelled: "Annulé" };
const amountLabel = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;
type Mode = { kind: "create" } | { kind: "version"; quote: QuoteDetail }
  | { [K in "edit" | "issue" | "share" | "synchronize"]: { kind: K; version: QuoteVersion } }["edit" | "issue" | "share" | "synchronize"]
  | { kind: "revoke"; id: string } | { kind: "cancel"; quote: QuoteDetail };
const titles: Record<Mode["kind"], string> = { create: "Nouveau devis", version: "Créer une nouvelle version", edit: "Modifier le brouillon", issue: "Émettre le devis", share: "Partager le devis", synchronize: "Synchroniser avec l’abonnement", revoke: "Révoquer le lien", cancel: "Annuler le devis" };
export function AdminQuotesPanel({ subscriptionId }: { subscriptionId: string }) {
  const client = useQueryClient(), queryKey = ["quotes", subscriptionId] as const;
  const query = useQuery({ queryKey, queryFn: () => quotesApi.list(subscriptionId), refetchInterval: 30000 });
  const [mode, setMode] = useState<Mode | null>(null), [amount, setAmount] = useState(""), [validity, setValidity] = useState(""), [terms, setTerms] = useState("");
  const [expires, setExpires] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [share, setShare] = useState<QuoteResponse["share"]>(), inFlight = useRef(false), opener = useRef<HTMLButtonElement | null>(null), refresh = useRef<HTMLButtonElement>(null);
  function open(next: Mode, button: HTMLButtonElement) {
    const v = "version" in next ? next.version : next.kind === "version" ? next.quote.versions.at(-1) : undefined;
    opener.current = button; setMode(next); setError(null); setAmount(v ? String(v.amountXaf) : ""); setTerms(v?.terms ?? "");
    setValidity(v?.validUntil ? toLocalInput(new Date(v.validUntil)) : ""); setExpires("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!mode || inFlight.current) return;
    let run: () => Promise<QuoteResponse>;
    if (mode.kind === "create" || mode.kind === "version" || mode.kind === "edit") {
      const validUntil = fromLocalInput(validity), amountXaf = Number(amount);
      if (!amount.trim() || !validUntil || !Number.isSafeInteger(amountXaf) || amountXaf < 0 || !terms.trim()) { setError("Renseigne un montant entier, la validité et les conditions commerciales."); return; }
      const input = { amountXaf, validUntil, terms };
      run = mode.kind === "create" ? () => quotesApi.create(subscriptionId, input) : mode.kind === "version" ? () => quotesApi.version(mode.quote.id, input) : () => quotesApi.edit(mode.version.id, input);
    } else if (mode.kind === "share") {
      const expiresAt = fromLocalInput(expires); if (!expiresAt) { setError("Renseigne l’expiration du lien."); return; }
      run = () => quotesApi.share(mode.version.id, expiresAt);
    } else run = mode.kind === "issue" ? () => quotesApi.issue(mode.version.id) : mode.kind === "synchronize" ? () => quotesApi.synchronize(mode.version.id) : mode.kind === "revoke" ? () => quotesApi.revoke(mode.id) : () => quotesApi.cancel(mode.quote.id);
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const result = await run(); setShare(result.share); setMode(null); setNotice("Opération enregistrée. Le devis a été actualisé.");
      await client.invalidateQueries({ queryKey });
      if (mode.kind === "synchronize") { await client.invalidateQueries({ queryKey: ["finance", subscriptionId] }); await client.invalidateQueries({ queryKey: ["customers", "detail"] }); }
    } catch (failure) { setError(quoteErrorMessage(failure)); await query.refetch(); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function pdf(q: QuoteDetail, v: QuoteVersion) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(null);
    try { downloadQuote(await quotesApi.pdf(v.id), `${q.quoteNumber}-v${v.versionNumber}.pdf`); } catch (failure) { setError(quoteErrorMessage(failure)); } finally { inFlight.current = false; setBusy(false); }
  }
  if (query.isPending) return <p role="status" className="text-sm text-muted-foreground">Chargement des devis…</p>;
  if (query.isError || !query.data) return <EmptyState title="Devis indisponibles" description={quoteErrorMessage(query.error)} action={<Button onClick={() => void query.refetch()}>Réessayer</Button>} />;
  return <section aria-label="Devis de l’abonnement" className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-extrabold">Devis</h2><p className="mt-1 text-sm text-muted-foreground">Une acceptation client nécessite une synchronisation explicite du coach.</p></div><div className="flex flex-wrap gap-2"><Button ref={refresh} variant="secondary" disabled={busy || query.isFetching} onClick={() => void query.refetch()}>Actualiser les devis</Button><Button disabled={busy} onClick={e => open({ kind: "create" }, e.currentTarget)}>Nouveau devis</Button></div></div>
    {notice && <p role="status" className="rounded-lg bg-success-soft p-3 text-sm">{notice}</p>}
    {error && !mode && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    {share && <section className="space-y-3 rounded-xl border border-border bg-brand-50 p-4" aria-label="Lien du devis"><p className="font-bold">Lien temporaire créé</p><p className="text-sm">Conserve ce lien pour le transmettre au client. Il ne sera plus affiché après fermeture de ce panneau. Expiration : {dateTimeFr(share.expiresAt)}.</p><label className="block text-sm">Lien à transmettre<Input readOnly value={`${window.location.origin}/devis/${share.token}`} onFocus={e => e.currentTarget.select()} /></label><a className="inline-block text-sm font-semibold underline" href={`/devis/${share.token}`} target="_blank" rel="noopener noreferrer">Ouvrir la page du devis</a><Button variant="ghost" onClick={() => setShare(undefined)}>Masquer le lien</Button></section>}
    {query.data.quotes.length === 0 && <EmptyState title="Aucun devis" description="Crée un brouillon avec son montant, sa validité et ses conditions commerciales explicites." />}
    {query.data.quotes.map(q => <article key={q.id} className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{q.quoteNumber ?? "Devis sans numéro — brouillon"}</h3><p className="text-sm text-muted-foreground">{statusLabels[q.status]} · Créé le {dateTimeFr(q.createdAt)}</p></div>{q.status !== "cancelled" && <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy || q.versions.some(v => !v.issuedAt)} onClick={e => open({ kind: "version", quote: q }, e.currentTarget)}>Créer une nouvelle version</Button><Button variant="destructive" disabled={busy} onClick={e => open({ kind: "cancel", quote: q }, e.currentTarget)}>Annuler le devis</Button></div>}</div>
      {q.versions.map(v => <section key={v.id} className="space-y-3 rounded-lg border border-border-subtle p-4" aria-label={`Version ${v.versionNumber}`}>
        <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-bold">Version {v.versionNumber} · {amountLabel(v.amountXaf)}</h4><span className="text-sm">{v.response ? statusLabels[v.response] : v.issuedAt ? "Émise" : "Brouillon"}{q.currentVersionId === v.id ? " · courante" : ""}</span></div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Émission</dt><dd>{dateTimeFr(v.issuedAt)}</dd></div><div><dt className="text-muted-foreground">Validité — Libreville</dt><dd>{dateTimeFr(v.validUntil)}</dd></div><div><dt className="text-muted-foreground">Réponse client</dt><dd>{v.response ? `${statusLabels[v.response]} · ${dateTimeFr(v.respondedAt)}` : "Aucune réponse"}</dd></div><div><dt className="text-muted-foreground">Synchronisation</dt><dd>{v.synchronized ? "Version liée à l’abonnement" : v.response === "accepted" ? "Non synchronisée" : "Acceptation requise"}</dd></div></dl>
        <details className="text-sm"><summary className="cursor-pointer font-semibold">Conditions commerciales</summary><p className="mt-2 whitespace-pre-wrap break-words">{v.terms}</p></details>
        <div className="flex flex-wrap gap-2">{!v.issuedAt && q.status !== "cancelled" && <><Button variant="secondary" disabled={busy} onClick={e => open({ kind: "edit", version: v }, e.currentTarget)}>Modifier le brouillon</Button><Button disabled={busy} onClick={e => open({ kind: "issue", version: v }, e.currentTarget)}>Émettre</Button></>}{v.pdfDocumentId && <Button variant="secondary" disabled={busy} onClick={() => void pdf(q, v)}>Télécharger le PDF</Button>}{v.issuedAt && q.currentVersionId === v.id && q.status === "issued" && !v.response && <Button disabled={busy} onClick={e => open({ kind: "share", version: v }, e.currentTarget)}>Partager</Button>}{v.response === "accepted" && q.currentVersionId === v.id && q.status === "accepted" && !v.synchronized && <Button disabled={busy} onClick={e => open({ kind: "synchronize", version: v }, e.currentTarget)}>Synchroniser avec l’abonnement</Button>}</div>
      </section>)}
      {q.links.length > 0 && <details><summary className="cursor-pointer text-sm font-semibold">Liens de réponse</summary><ul className="mt-3 space-y-2">{q.links.map(link => <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3 text-sm"><span>Version {q.versions.find(v => v.id === link.versionId)?.versionNumber} · {link.revokedAt ? "Révoqué" : link.usedAt ? "Réponse enregistrée" : Date.parse(link.expiresAt) <= Date.now() ? "Expiré" : "Disponible"} · {dateTimeFr(link.expiresAt)}</span>{!link.revokedAt && <Button size="sm" variant="secondary" disabled={busy} onClick={e => open({ kind: "revoke", id: link.id }, e.currentTarget)}>Révoquer le lien</Button>}</li>)}</ul></details>}
    </article>)}
    <Dialog open={Boolean(mode)} onOpenChange={open => { if (!open && !busy) setMode(null); }}>{mode && <DialogContent title={titles[mode.kind]} description="Les opérations et états sont vérifiés par le serveur." className="max-h-[90dvh] max-w-xl overflow-y-auto" onCloseAutoFocus={event => { event.preventDefault(); (opener.current?.isConnected ? opener.current : refresh.current)?.focus(); }}>
      <form onSubmit={submit}><fieldset disabled={busy} className="space-y-4">
        {(mode.kind === "create" || mode.kind === "version" || mode.kind === "edit") && <><label className="block text-sm">Montant total (FCFA)<Input type="number" required min="0" max="2147483647" step="1" value={amount} onChange={e => setAmount(e.target.value)} /></label><label className="block text-sm">Valable jusqu’au — heure de Libreville<Input type="datetime-local" required value={validity} onChange={e => setValidity(e.target.value)} /></label><label className="block text-sm">Conditions commerciales explicites<Textarea required rows={6} maxLength={10000} value={terms} onChange={e => setTerms(e.target.value)} /></label><p className="text-xs text-muted-foreground">Le service, la formule et la durée seront figés depuis l’abonnement lors de l’émission. Aucune clause juridique n’est ajoutée automatiquement.</p></>}
        {mode.kind === "share" && <><p className="text-sm">Le lien vise exactement la version {mode.version.versionNumber}. Il permet une réponse explicite et expire au plus tard à la fin de validité du devis.</p><label className="block text-sm">Expiration du lien — heure de Libreville<Input type="datetime-local" required value={expires} max={mode.version.validUntil ? toLocalInput(new Date(mode.version.validUntil)) : undefined} onChange={e => setExpires(e.target.value)} /></label></>}
        {mode.kind === "issue" && <p className="text-sm">Confirmer l’émission de la version {mode.version.versionNumber} ? Le montant, les informations commerciales, les conditions, la validité et le PDF seront figés. Toute modification nécessitera une nouvelle version.</p>}
        {mode.kind === "synchronize" && <p className="text-sm">Confirmer la liaison de cette version acceptée à l’abonnement et son montant de {amountLabel(mode.version.amountXaf)} ? Si le montant diffère et qu’une activité financière existe, le serveur refusera l’opération. Le service, la formule, la durée, les composantes et le statut restent inchangés.</p>}
        {mode.kind === "revoke" && <p className="text-sm">Confirmer la révocation de ce lien ? Il ne permettra plus l’accès ou une nouvelle réponse. L’historique sera conservé.</p>}
        {mode.kind === "cancel" && <p className="text-sm">Confirmer l’annulation du devis ? Les versions, réponses et PDF restent conservés. L’abonnement et la finance ne sont pas modifiés.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setMode(null)}>Retour</Button><Button type="submit">{busy ? "Enregistrement…" : "Confirmer"}</Button></div>
      </fieldset></form>
    </DialogContent>}</Dialog>
  </section>;
}
