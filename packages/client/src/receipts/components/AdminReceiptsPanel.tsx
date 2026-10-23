import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FinancePaymentEvent, FinancePaymentMethod, Receipt, ReceiptCorrectionState } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, Textarea } from "../../components/ui/input.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
import { dateTimeFr, fromLocalInput, moneyXaf } from "../../lib/format.js";
import { receiptsApi, receiptErrorMessage, downloadReceipt } from "../api/receipts-api.js";
const methods: Record<FinancePaymentMethod, string> = { cash: "Espèces", bank_transfer: "Virement bancaire", mobile_money: "Mobile Money" };
const corrections: Record<ReceiptCorrectionState, string> = { none: "Aucune correction", partially_corrected: "Paiement partiellement corrigé", fully_corrected: "Paiement entièrement corrigé" };
function useReceipts(subscriptionId: string) { return useQuery({ queryKey: ["receipts", subscriptionId], queryFn: () => receiptsApi.list(subscriptionId), refetchInterval: 30000 }); }
export function ReceiptPaymentAction({ subscriptionId, payment }: { subscriptionId: string; payment: FinancePaymentEvent }) {
  const query = useReceipts(subscriptionId), client = useQueryClient(), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false), opener = useRef<HTMLButtonElement>(null), issuedId = useRef<string | null>(null);
  const existing = query.data?.receipts.find(r => r.paymentEventId === payment.id);
  async function issue() {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(null);
    try { const result = await receiptsApi.issue(payment.id); issuedId.current = result.receipt.id; setOpen(false); }
    catch (failure) { setError(receiptErrorMessage(failure)); }
    finally { await client.invalidateQueries({ queryKey: ["receipts", subscriptionId] }); inFlight.current = false; setBusy(false); }
  }
  if (payment.eventType !== "payment_received") return null;
  if (existing) return <a href={`#receipt-${existing.id}`} className="text-sm font-semibold text-primary underline underline-offset-4">{existing.receiptNumber}{existing.state === "voided" ? " · Annulé" : ""}</a>;
  return <><Button ref={opener} size="sm" variant="secondary" disabled={busy || !query.data} onClick={() => { setOpen(true); setError(null); }}>Émettre le reçu</Button><Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent title="Émettre le reçu" description="Un seul reçu officiel peut être émis pour ce paiement confirmé." onCloseAutoFocus={event => { event.preventDefault(); const target = issuedId.current ? document.getElementById(`receipt-${issuedId.current}`) : null; (target ?? opener.current)?.focus(); }}>
    <p className="text-sm">Émettre un reçu de <strong>{moneyXaf(payment.amountXaf)}</strong>, paiement du {dateTimeFr(payment.occurredAt)} ? Son numéro, ses informations historiques et son PDF seront conservés. Cette action ne crée aucun nouveau paiement.</p>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Retour</Button><Button disabled={busy} onClick={() => void issue()}>{busy ? "Émission du PDF…" : "Confirmer l’émission"}</Button></div>
  </DialogContent></Dialog></>;
}
type Mode = { kind: "share" | "void"; receipt: Receipt };
export function AdminReceiptsPanel({ subscriptionId }: { subscriptionId: string }) {
  const query = useReceipts(subscriptionId), client = useQueryClient();
  const [mode, setMode] = useState<Mode | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [expires, setExpires] = useState(""), [maxUses, setMaxUses] = useState("3"), [reason, setReason] = useState(""), [url, setUrl] = useState<string | null>(null);
  const inFlight = useRef(false), opener = useRef<HTMLButtonElement | null>(null), heading = useRef<HTMLHeadingElement>(null);
  function open(next: Mode, button: HTMLButtonElement) { opener.current = button; setMode(next); setExpires(""); setMaxUses("3"); setReason(""); setError(null); }
  async function perform(operation: () => Promise<unknown>, success: string, close = false) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try { await operation(); if (close) setMode(null); setNotice(success); }
    catch (failure) { setError(receiptErrorMessage(failure)); }
    finally { await client.invalidateQueries({ queryKey: ["receipts", subscriptionId] }); inFlight.current = false; setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!mode) return;
    if (mode.kind === "share") {
      const expiresAt = fromLocalInput(expires), uses = Number(maxUses);
      if (!expiresAt || !Number.isSafeInteger(uses) || uses < 1 || uses > 20) { setError("Renseigne une expiration valide et entre 1 et 20 téléchargements."); return; }
      await perform(async () => { const r = await receiptsApi.share(mode.receipt.id, { expiresAt, maxUses: uses }); setUrl(`${window.location.origin}/recu/${encodeURIComponent(r.share.token)}`); }, "Lien créé. Copie-le maintenant ; il ne sera plus affiché après avoir quitté cet écran.", true);
    } else await perform(() => receiptsApi.void(mode.receipt.id, reason), "Reçu annulé. Son numéro et son PDF historique restent conservés.", true);
  }
  return <section aria-label="Reçus" className="space-y-4 border-t border-border pt-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 ref={heading} tabIndex={-1} className="text-lg font-bold">Reçus</h3><p className="text-sm text-muted-foreground">Émets un reçu depuis le paiement confirmé dans l’historique ci-dessus.</p></div><Button variant="secondary" disabled={busy || query.isFetching} onClick={() => void query.refetch()}>Actualiser les reçus</Button></div>
    {query.isPending && <p role="status" className="text-sm">Chargement des reçus…</p>}
    {query.isError && <p role="alert" className="text-sm text-danger">{receiptErrorMessage(query.error)}</p>}
    {query.data?.receipts.length === 0 && <p className="text-sm text-muted-foreground">Aucun reçu émis.</p>}
    {notice && <p role="status" className="rounded-lg bg-success-soft p-3 text-sm">{notice}</p>}
    {error && !mode && <p role="alert" className="text-sm text-danger">{error}</p>}
    {url && <div className="space-y-2 rounded-xl border border-border p-4"><label className="block text-sm font-semibold">Lien personnel du reçu<Input readOnly value={url} onFocus={event => event.currentTarget.select()} /></label><p className="text-xs text-muted-foreground">À partager uniquement avec le client concerné.</p><Button size="sm" variant="secondary" onClick={() => setUrl(null)}>Masquer le lien</Button></div>}
    <ol className="space-y-3">{query.data?.receipts.map(r => <li id={`receipt-${r.id}`} tabIndex={-1} key={r.id} className="scroll-mt-6 space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{r.receiptNumber} · {moneyXaf(r.snapshot.amountXaf)}</p><p className="text-sm text-muted-foreground">{methods[r.snapshot.paymentMethod]} · Paiement du {dateTimeFr(r.snapshot.occurredAt)}</p></div><span className={`rounded-md px-3 py-1 text-sm font-semibold ${r.state === "voided" ? "bg-danger-soft text-danger" : "bg-success-soft"}`}>{r.state === "voided" ? "Annulé" : "Émis"}</span></div>
      <p className="text-xs text-muted-foreground">Émis le {dateTimeFr(r.issuedAt)}{r.voidedAt ? ` · Annulé le ${dateTimeFr(r.voidedAt)}` : ""}</p>
      <p className="text-sm">{corrections[r.correctionState]}{r.correctionState !== "none" ? ` · Montant effectif actuel : ${moneyXaf(r.effectiveAmountXaf)}` : ""}</p>
      {r.voidReason && <p className="whitespace-pre-wrap break-words text-sm"><strong>Motif privé :</strong> {r.voidReason}</p>}
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={busy} onClick={() => void perform(async () => downloadReceipt(await receiptsApi.pdf(r.id), r.receiptNumber), "PDF historique téléchargé.")}>Télécharger</Button><Button size="sm" variant="secondary" disabled={busy} onClick={event => open({ kind: "share", receipt: r }, event.currentTarget)}>Partager</Button>{r.state === "issued" && r.correctionState === "fully_corrected" && <Button size="sm" variant="destructive" disabled={busy} onClick={event => open({ kind: "void", receipt: r }, event.currentTarget)}>Annuler le reçu</Button>}</div>
      {r.links.length > 0 && <details><summary className="cursor-pointer text-sm font-semibold">Liens de partage</summary><ul className="mt-3 space-y-3">{r.links.map(link => <li key={link.id} className="space-y-1 text-sm"><p>Expire le {dateTimeFr(link.expiresAt)} · {link.useCount}/{link.maxUses} téléchargements{link.revokedAt ? " · Révoqué" : ""}</p>{!link.revokedAt && <Button size="sm" variant="destructive" disabled={busy} onClick={() => void perform(() => receiptsApi.revoke(link.id), "Lien révoqué.")}>Révoquer le lien</Button>}</li>)}</ul></details>}
    </li>)}</ol>
    <Dialog open={Boolean(mode)} onOpenChange={value => { if (!value && !busy) setMode(null); }}>{mode && <DialogContent title={mode.kind === "share" ? `Partager ${mode.receipt.receiptNumber}` : `Annuler ${mode.receipt.receiptNumber}`} description={mode.kind === "share" ? "Un lien personnel, temporaire et révocable pour le PDF historique." : "Le paiement source est entièrement corrigé. Cette action conserve le reçu."} onCloseAutoFocus={event => { event.preventDefault(); (opener.current?.isConnected ? opener.current : heading.current)?.focus(); }}>
      <form onSubmit={submit}><fieldset disabled={busy} className="space-y-4">{mode.kind === "share" ? <><label className="block text-sm">Expiration — date et heure à Libreville<Input required type="datetime-local" value={expires} onChange={event => setExpires(event.target.value)} /></label><label className="block text-sm">Nombre maximal de téléchargements<Input required type="number" min="1" max="20" step="1" value={maxUses} onChange={event => setMaxUses(event.target.value)} /></label></> : <><p className="rounded-lg bg-warning-soft p-3 text-sm">Le numéro {mode.receipt.receiptNumber} est conservé et ne sera jamais réutilisé. Le PDF reste historique et accessible par les liens encore valides. Cette action ne rembourse pas et ne corrige pas le paiement.</p><label className="block text-sm">Motif privé obligatoire<Textarea required maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label></>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setMode(null)}>Retour</Button><Button type="submit" variant={mode.kind === "void" ? "destructive-solid" : "default"}>{busy ? "Enregistrement…" : mode.kind === "share" ? "Créer le lien" : "Confirmer l’annulation"}</Button></div>
      </fieldset></form>
    </DialogContent>}</Dialog>
  </section>;
}
