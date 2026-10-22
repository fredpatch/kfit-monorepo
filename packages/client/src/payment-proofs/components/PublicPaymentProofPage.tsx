import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { financePaymentMethods, paymentProofMaxBytes, paymentProofMimeTypes, type FinancePaymentMethod } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, NativeSelect } from "../../components/ui/input.js";
import { dateTimeFr, fromLocalInput } from "../../lib/format.js";
import { paymentProofsApi, paymentProofErrorMessage } from "../api/payment-proofs-api.js";

const methods: Record<FinancePaymentMethod, string> = { cash: "Espèces", bank_transfer: "Virement bancaire", mobile_money: "Mobile Money" };
export function PublicPaymentProofPage() {
  useLayoutEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="referrer"]'), meta = existing ?? document.createElement("meta"), previous = meta.content;
    meta.name = "referrer"; meta.content = "no-referrer"; if (!existing) document.head.appendChild(meta);
    return () => { if (existing) meta.content = previous; else meta.remove(); };
  }, []);
  const { token = "" } = useParams();
  const [submittedToken, setSubmittedToken] = useState<string | null>(null), submitted = submittedToken === token;
  const query = useQuery({ queryKey: ["public-payment-proof", token], queryFn: () => paymentProofsApi.metadata(token), enabled: Boolean(token) && !submitted, retry: false, refetchOnWindowFocus: false });
  const [amount, setAmount] = useState(""), [method, setMethod] = useState<FinancePaymentMethod>("cash"), [occurred, setOccurred] = useState("");
  const [reference, setReference] = useState(""), [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false), success = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { if (submitted) success.current?.focus(); }, [submitted]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current || submitted) return;
    const claimedAmountXaf = Number(amount), claimedOccurredAt = fromLocalInput(occurred);
    if (!Number.isSafeInteger(claimedAmountXaf) || claimedAmountXaf <= 0 || !claimedOccurredAt) { setError("Renseigne un montant entier positif et une date valide."); return; }
    if (!file || file.size === 0 || file.size > paymentProofMaxBytes || !paymentProofMimeTypes.some(value => value === file.type)) { setError("Choisis un fichier PDF, JPEG, PNG ou WebP non vide, de 10 Mo maximum."); return; }
    inFlight.current = true; setBusy(true); setError(null);
    try { await paymentProofsApi.upload(token, file, { claimedAmountXaf, claimedPaymentMethod: method, claimedOccurredAt, claimedExternalReference: reference.trim() || null }); setSubmittedToken(token); setFile(null); }
    catch (failure) { setError(paymentProofErrorMessage(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (submitted) return <main className="mx-auto max-w-xl px-5 py-12"><p className="text-xl font-extrabold text-primary">K'FIT</p><h1 ref={success} tabIndex={-1} className="mt-8 text-2xl font-extrabold">Justificatif envoyé. Il sera vérifié par votre coach.</h1><p className="mt-4 text-sm text-muted-foreground">Le dépôt ne confirme pas le paiement. Ton coach vérifiera les informations et le document.</p></main>;
  if (token && query.isPending) return <main className="mx-auto max-w-xl px-5 py-12"><p role="status">Chargement du lien de dépôt…</p></main>;
  if (!token || query.isError || !query.data) return <main className="mx-auto max-w-xl px-5 py-12"><p className="text-xl font-extrabold text-primary">K'FIT</p><h1 className="mt-8 text-2xl font-extrabold">Lien de dépôt indisponible</h1><p role="alert" className="mt-3 text-sm text-muted-foreground">{paymentProofErrorMessage(query.error)}</p><Button className="mt-5" variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button></main>;
  return <main className="min-h-screen bg-background px-4 py-8 sm:py-12"><article className="mx-auto max-w-xl space-y-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
    <header className="space-y-3 border-b border-border-subtle pb-5"><p className="text-xl font-extrabold text-primary">K'FIT</p><h1 className="text-3xl font-extrabold">Justificatif de paiement</h1><p className="break-all text-sm">Abonnement : {query.data.subscriptionReference}</p><p className="text-xs text-muted-foreground">Lien valable jusqu’au {dateTimeFr(query.data.expiresAt)} — heure de Libreville.</p></header>
    {query.data.customerMessage && <section className="rounded-xl bg-brand-50 p-4"><h2 className="text-sm font-bold">Message de ton coach</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm">{query.data.customerMessage}</p></section>}
    <p className="text-sm text-muted-foreground">Déclare ton paiement et joins le document. Le dépôt sera vérifié par ton coach avant toute confirmation.</p>
    <form onSubmit={submit}><fieldset disabled={busy} className="space-y-4">
      <label className="block text-sm font-medium">Montant déclaré (FCFA)<Input required type="number" min="1" max="2147483647" step="1" inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value)} /></label>
      <label className="block text-sm font-medium">Moyen de paiement<NativeSelect value={method} onChange={event => { const selected = financePaymentMethods.find(value => value === event.target.value); if (selected) setMethod(selected); }}>{financePaymentMethods.map(value => <option key={value} value={value}>{methods[value]}</option>)}</NativeSelect></label>
      <label className="block text-sm font-medium">Date du paiement — heure de Libreville<Input required type="datetime-local" value={occurred} onChange={event => setOccurred(event.target.value)} /></label>
      <label className="block text-sm font-medium">Référence du paiement (facultative)<Input maxLength={200} value={reference} onChange={event => setReference(event.target.value)} /></label>
      <label className="block text-sm font-medium">Document justificatif<Input required type="file" accept={paymentProofMimeTypes.join(",")} className="h-auto py-2" aria-describedby="proof-file-help" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
      <p id="proof-file-help" className="text-xs text-muted-foreground">PDF, JPEG, PNG ou WebP · 10 Mo maximum. Le fichier sera contrôlé par un antivirus et restera réservé au coach.</p>
      {error && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full">{busy ? "Envoi et vérification du fichier…" : "Envoyer le justificatif"}</Button>
    </fieldset></form>
    <footer className="border-t border-border-subtle pt-4 text-xs text-muted-foreground">Lien personnel à usage unique. Ne le partage pas. Pour toute question, contacte ton coach.</footer>
  </article></main>;
}
