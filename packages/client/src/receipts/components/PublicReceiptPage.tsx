import { useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { FinancePaymentMethod, ReceiptCorrectionState } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { dateTimeFr } from "../../lib/format.js";
import { receiptsApi, receiptErrorMessage, downloadReceipt } from "../api/receipts-api.js";
const methods: Record<FinancePaymentMethod, string> = { cash: "Espèces", bank_transfer: "Virement bancaire", mobile_money: "Mobile Money" };
const corrections: Record<ReceiptCorrectionState, string> = { none: "Aucune correction du paiement.", partially_corrected: "Le paiement associé a été partiellement corrigé.", fully_corrected: "Le paiement associé a été entièrement corrigé." };
export function PublicReceiptPage() {
  useLayoutEffect(() => { const existing = document.querySelector<HTMLMetaElement>('meta[name="referrer"]'), meta = existing ?? document.createElement("meta"), previous = meta.content; meta.name = "referrer"; meta.content = "no-referrer"; if (!existing) document.head.appendChild(meta); return () => { if (existing) meta.content = previous; else meta.remove(); }; }, []);
  const { token = "" } = useParams(), query = useQuery({ queryKey: ["public-receipt", token], queryFn: () => receiptsApi.publicMetadata(token), enabled: Boolean(token), retry: false, refetchOnWindowFocus: false });
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), inFlight = useRef(false);
  async function download() {
    if (inFlight.current || !query.data) return; inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try { downloadReceipt(await receiptsApi.publicPdf(token), query.data.receiptNumber); setNotice("PDF historique téléchargé. Le reçu conserve les informations figées à son émission."); }
    catch (failure) { setError(receiptErrorMessage(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (token && query.isPending) return <main className="mx-auto max-w-xl px-5 py-12"><p role="status">Chargement du reçu…</p></main>;
  if (!token || query.isError || !query.data) return <main className="mx-auto max-w-xl px-5 py-12"><p className="text-xl font-extrabold text-primary">K'FIT</p><h1 className="mt-8 text-2xl font-extrabold">Reçu indisponible</h1><p role="alert" className="mt-3 text-sm text-muted-foreground">{receiptErrorMessage(query.error)}</p><Button variant="secondary" className="mt-5" onClick={() => void query.refetch()}>Réessayer</Button></main>;
  const r = query.data;
  return <main className="min-h-screen bg-background px-4 py-8 sm:py-12"><article className="mx-auto max-w-xl space-y-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8"><header className="space-y-3 border-b border-border-subtle pb-5"><p className="text-xl font-extrabold text-primary">K'FIT</p><h1 className="text-3xl font-extrabold">Reçu de paiement</h1><p className="font-semibold">{r.receiptNumber}</p><p className="text-sm text-muted-foreground">Émis le {dateTimeFr(r.issuedAt)} — heure de Libreville</p></header>
    {r.state === "voided" ? <section className="rounded-xl border border-danger/30 bg-danger-soft p-5"><h2 className="text-2xl font-extrabold text-danger">ANNULÉ</h2><p className="mt-2 text-sm">Le paiement associé a été entièrement corrigé. Le numéro et le PDF original sont conservés comme documents historiques.</p></section> : <p className="text-sm font-semibold">Reçu émis</p>}
    <dl className="space-y-4"><div><dt className="text-sm text-muted-foreground">Client</dt><dd className="break-words font-semibold">{r.customerName}</dd></div><div><dt className="text-sm text-muted-foreground">Abonnement</dt><dd className="break-all text-sm">{r.subscriptionReference}</dd></div><div className="rounded-xl bg-brand-50 p-5"><dt className="text-sm">Montant du reçu original</dt><dd className="mt-2 text-3xl font-extrabold tabular-nums">{r.amountXaf.toLocaleString("fr-FR")} FCFA</dd></div><div><dt className="text-sm text-muted-foreground">Paiement du {dateTimeFr(r.occurredAt)}</dt><dd className="font-semibold">{methods[r.paymentMethod]}</dd></div></dl>
    {r.correctionState !== "none" && <p className="text-sm">{corrections[r.correctionState]} Montant effectif actuel : {r.effectiveAmountXaf.toLocaleString("fr-FR")} FCFA. Le PDF conserve les faits d’origine.</p>}
    <Button disabled={busy || !r.canDownload} className="w-full" onClick={() => void download()}>{busy ? "Téléchargement…" : "Télécharger le PDF historique"}</Button>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}{notice && <p role="status" className="rounded-lg bg-success-soft p-3 text-sm">{notice}</p>}
    <footer className="border-t border-border-subtle pt-4 text-xs text-muted-foreground">Lien personnel, temporaire et limité en téléchargements. Ne le partage pas. Pour toute question, contacte ton coach.</footer>
  </article></main>;
}
