import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { financePaymentMethods, type FinancePaymentMethod, type PaymentProof, type PaymentProofStatus } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, NativeSelect, Textarea } from "../../components/ui/input.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
import { dateTimeFr, fromLocalInput, moneyXaf } from "../../lib/format.js";
import { paymentProofsApi, paymentProofErrorMessage, type ProofReviewAction } from "../api/payment-proofs-api.js";

const methods: Record<FinancePaymentMethod, string> = { cash: "Espèces", bank_transfer: "Virement bancaire", mobile_money: "Mobile Money" };
const statuses: Record<PaymentProofStatus, string> = { pending_review: "À vérifier", confirmed: "Confirmé", partially_confirmed: "Partiellement confirmé", correction_requested: "Correction demandée", rejected: "Rejeté", duplicate: "Doublon", superseded: "Remplacé" };
const actions: Record<ProofReviewAction, string> = { confirm: "Confirmer", partiallyConfirm: "Confirmer partiellement", requestCorrection: "Demander une correction", reject: "Rejeter", markDuplicate: "Marquer comme doublon" };
type Mode = { kind: "link"; parent: string | null } | { kind: "review"; proof: PaymentProof; action: ProofReviewAction };
export function AdminPaymentProofsPanel({ subscriptionId }: { subscriptionId: string }) {
  const client = useQueryClient(), queryKey = ["payment-proofs", subscriptionId] as const;
  const query = useQuery({ queryKey, queryFn: () => paymentProofsApi.list(subscriptionId), refetchInterval: 30000 });
  const [mode, setMode] = useState<Mode | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null), [url, setUrl] = useState<string | null>(null), [expires, setExpires] = useState("");
  const [amount, setAmount] = useState(""), [method, setMethod] = useState<FinancePaymentMethod>("cash"), [occurred, setOccurred] = useState("");
  const [reference, setReference] = useState(""), [note, setNote] = useState(""), [message, setMessage] = useState("");
  const inFlight = useRef(false), opener = useRef<HTMLButtonElement | null>(null), refresh = useRef<HTMLButtonElement>(null);
  function open(next: Mode, button: HTMLButtonElement) {
    opener.current = button; setMode(next); setError(null); setExpires(""); setAmount(""); setMethod("cash"); setOccurred(""); setReference(""); setNote(""); setMessage("");
  }
  async function perform(operation: () => Promise<unknown>, success: string, close = false) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try { await operation(); if (close) setMode(null); setNotice(success); }
    catch (failure) { setError(paymentProofErrorMessage(failure)); }
    finally {
      await Promise.allSettled([client.invalidateQueries({ queryKey }), client.invalidateQueries({ queryKey: ["finance", subscriptionId] })]);
      inFlight.current = false; setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!mode || inFlight.current) return;
    if (mode.kind === "link") {
      const expiresAt = fromLocalInput(expires);
      if (!expiresAt) { setError("Renseigne une date d’expiration valide en heure de Libreville."); return; }
      await perform(async () => { const result = await paymentProofsApi.issue(subscriptionId, { expiresAt, supersedesProofId: mode.parent }); setUrl(`${window.location.origin}/justificatif/${encodeURIComponent(result.token)}`); }, "Lien créé. Copie-le maintenant : il ne sera plus affiché après avoir quitté cet écran.", true);
      return;
    }
    const { proof, action } = mode;
    if (action === "confirm" || action === "partiallyConfirm") {
      const confirmedAmountXaf = Number(amount), confirmedOccurredAt = fromLocalInput(occurred);
      if (!confirmedOccurredAt || !Number.isSafeInteger(confirmedAmountXaf) || confirmedAmountXaf <= 0 || (action === "confirm" ? confirmedAmountXaf !== proof.claimedAmountXaf : confirmedAmountXaf >= proof.claimedAmountXaf)) { setError("Vérifie le montant confirmé et la date. Le montant complet égale la déclaration ; le montant partiel doit être inférieur et positif."); return; }
      await perform(() => paymentProofsApi.review(proof.id, action, { confirmedAmountXaf, confirmedOccurredAt, confirmedPaymentMethod: method, externalReference: reference.trim() || null, reviewNote: note.trim() || null }), "Paiement confirmé et réparti par le serveur. Le justificatif conserve les déclarations d’origine.", true);
    } else await perform(() => paymentProofsApi.review(proof.id, action, { reviewNote: note.trim() || null, ...(action === "requestCorrection" ? { customerMessage: message.trim() || null } : {}) }), "Décision enregistrée. Aucun paiement n’a été créé.", true);
  }
  async function download(proof: PaymentProof) {
    await perform(async () => {
      const blob = await paymentProofsApi.document(proof.id), objectUrl = URL.createObjectURL(blob), anchor = document.createElement("a");
      const extension = proof.mimeType === "application/pdf" ? "pdf" : proof.mimeType === "image/png" ? "png" : proof.mimeType === "image/webp" ? "webp" : "jpg";
      anchor.href = objectUrl; anchor.download = `justificatif-${proof.id}.${extension}`; anchor.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }, "Justificatif téléchargé.");
  }
  return <section aria-label="Justificatifs de paiement" className="space-y-4 border-t border-border pt-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold">Justificatifs de paiement</h3><p className="text-sm text-muted-foreground">Un dépôt constitue une preuve à vérifier. Seule une confirmation crée un paiement.</p></div><div className="flex flex-wrap gap-2"><Button ref={refresh} variant="secondary" disabled={busy || query.isFetching} onClick={() => void query.refetch()}>Actualiser les justificatifs</Button><Button disabled={busy} onClick={event => open({ kind: "link", parent: null }, event.currentTarget)}>Créer un lien de dépôt</Button></div></div>
    {query.isPending && <p role="status" className="text-sm">Chargement des justificatifs…</p>}
    {query.isError && <p role="alert" className="text-sm text-danger">{paymentProofErrorMessage(query.error)}</p>}
    {notice && <p role="status" className="rounded-lg bg-success-soft p-3 text-sm">{notice}</p>}
    {url && <div className="space-y-2 rounded-xl border border-border p-4"><label className="block text-sm font-semibold">Lien personnel de dépôt<Input readOnly value={url} onFocus={event => event.currentTarget.select()} /></label><p className="text-xs text-muted-foreground">À partager uniquement avec le client concerné. Un seul dépôt réussi est autorisé.</p><Button size="sm" variant="secondary" onClick={() => setUrl(null)}>Masquer le lien</Button></div>}
    {error && !mode && <p role="alert" className="text-sm text-danger">{error}</p>}
    {query.data?.proofs.length === 0 && <p className="text-sm text-muted-foreground">Aucun justificatif déposé.</p>}
    <ol className="space-y-3">{query.data?.proofs.map(proof => <li key={proof.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{moneyXaf(proof.claimedAmountXaf)} déclarés · {methods[proof.claimedPaymentMethod]}</p><p className="text-sm text-muted-foreground">Dépôt : {dateTimeFr(proof.submittedAt)}</p></div><span className="rounded-md bg-muted px-3 py-1 text-sm font-semibold">{statuses[proof.status]}</span></div>
      <p className="text-sm">Date de paiement déclarée : {dateTimeFr(proof.claimedOccurredAt)}</p>
      {proof.claimedExternalReference && <p className="break-all text-sm">Référence déclarée : {proof.claimedExternalReference}</p>}
      <p className="break-all text-xs text-muted-foreground">Justificatif {proof.id} · {proof.mimeType} · {(proof.sizeBytes / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Ko</p>
      {proof.supersedesProofId && <p className="break-all text-sm">Remplace le justificatif {proof.supersedesProofId}.</p>}
      {proof.paymentEventId && <p className="break-all text-sm">Paiement confirmé : {moneyXaf(proof.confirmedAmountXaf ?? 0)} · {proof.confirmedPaymentMethod && methods[proof.confirmedPaymentMethod]} · {proof.confirmedOccurredAt && dateTimeFr(proof.confirmedOccurredAt)}<span className="block text-xs text-muted-foreground">Écriture {proof.paymentEventId}</span></p>}
      {proof.reviewedAt && <p className="text-xs text-muted-foreground">Décision du {dateTimeFr(proof.reviewedAt)}</p>}
      {proof.reviewNote && <p className="whitespace-pre-wrap break-words text-sm"><strong>Note privée :</strong> {proof.reviewNote}</p>}
      {proof.customerMessage && <p className="whitespace-pre-wrap break-words text-sm"><strong>Message au client :</strong> {proof.customerMessage}</p>}
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={busy} onClick={() => void download(proof)}>Télécharger le justificatif</Button>
        {proof.status === "pending_review" && (Object.keys(actions) as ProofReviewAction[]).map(action => <Button key={action} size="sm" variant={action === "confirm" ? "default" : "secondary"} disabled={busy || (action === "partiallyConfirm" && proof.claimedAmountXaf < 2)} onClick={event => open({ kind: "review", proof, action }, event.currentTarget)}>{actions[action]}</Button>)}
        {proof.status === "correction_requested" && <Button size="sm" disabled={busy} onClick={event => open({ kind: "link", parent: proof.id }, event.currentTarget)}>Créer le lien de correction</Button>}
      </div>
    </li>)}</ol>
    {Boolean(query.data?.links.length) && <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Historique des liens de dépôt</summary><ul className="mt-3 space-y-3">{query.data?.links.map(link => <li key={link.id} className="space-y-1 text-sm"><p>Expire le {dateTimeFr(link.expiresAt)} · {link.revokedAt ? "Révoqué" : link.usedAt ? "Utilisé" : "Non utilisé"}</p>{link.supersedesProofId && <p className="break-all text-xs">Correction du justificatif {link.supersedesProofId}</p>}{!link.revokedAt && !link.usedAt && <Button size="sm" variant="destructive" disabled={busy} onClick={() => void perform(() => paymentProofsApi.revoke(link.id), "Lien révoqué.")}>Révoquer ce lien</Button>}</li>)}</ul></details>}
    <Dialog open={Boolean(mode)} onOpenChange={open => { if (!open && !busy) setMode(null); }}>{mode && <DialogContent title={mode.kind === "link" ? "Créer un lien de dépôt" : actions[mode.action]} description={mode.kind === "link" ? "Choisis une expiration explicite. Le lien permet un seul dépôt réussi." : "Les déclarations du client restent conservées. La décision est contrôlée par le serveur."} className="max-h-[90dvh] overflow-y-auto" onCloseAutoFocus={event => { event.preventDefault(); (opener.current?.isConnected ? opener.current : refresh.current)?.focus(); }}>
      <form onSubmit={submit}><fieldset disabled={busy} className="space-y-4">
        {mode.kind === "link" ? <label className="block text-sm">Expiration — date et heure à Libreville<Input required type="datetime-local" value={expires} onChange={event => setExpires(event.target.value)} /></label> : <>
          <p className="text-sm">Déclaration : <strong>{moneyXaf(mode.proof.claimedAmountXaf)}</strong> · {methods[mode.proof.claimedPaymentMethod]} · {dateTimeFr(mode.proof.claimedOccurredAt)}</p>
          {(mode.action === "confirm" || mode.action === "partiallyConfirm") ? <>
            <p className="rounded-lg bg-warning-soft p-3 text-sm">Cette confirmation crée immédiatement un paiement et sa répartition sur les échéances. Vérifie le document et saisis les faits que tu confirmes.</p>
            <label className="block text-sm">Montant confirmé (XAF entiers)<Input required type="number" min={mode.action === "confirm" ? mode.proof.claimedAmountXaf : 1} max={mode.action === "confirm" ? mode.proof.claimedAmountXaf : mode.proof.claimedAmountXaf - 1} step="1" value={amount} onChange={event => setAmount(event.target.value)} /></label>
            <label className="block text-sm">Moyen de paiement confirmé<NativeSelect value={method} onChange={event => { const selected = financePaymentMethods.find(value => value === event.target.value); if (selected) setMethod(selected); }}>{financePaymentMethods.map(value => <option value={value} key={value}>{methods[value]}</option>)}</NativeSelect></label>
            <label className="block text-sm">Date du paiement confirmé — heure de Libreville<Input required type="datetime-local" value={occurred} onChange={event => setOccurred(event.target.value)} /></label>
            <label className="block text-sm">Référence externe confirmée (facultative)<Input maxLength={200} value={reference} onChange={event => setReference(event.target.value)} /></label>
          </> : <p className="text-sm">Cette décision ne crée aucun paiement.</p>}
          <label className="block text-sm">Note privée du coach (facultative)<Textarea maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></label>
          {mode.action === "requestCorrection" && <label className="block text-sm">Message au client (facultatif)<Textarea maxLength={2000} value={message} onChange={event => setMessage(event.target.value)} /><span className="text-xs text-muted-foreground">Visible sur le nouveau lien de correction que tu partageras avec le client.</span></label>}
        </>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setMode(null)}>Retour</Button><Button type="submit">{busy ? "Enregistrement…" : mode.kind === "link" ? "Créer le lien" : mode.action === "confirm" || mode.action === "partiallyConfirm" ? "Confirmer et créer le paiement" : "Enregistrer la décision"}</Button></div>
      </fieldset></form>
    </DialogContent>}</Dialog>
  </section>;
}
