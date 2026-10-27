import { useRef, useState } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import axios from "axios";
import {
  isReceiptLinkClosed,
  type FinancePaymentMethod,
  type ReceiptCorrectionState,
} from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import {
  PublicCard,
  PublicLoading,
  PublicNote,
  PublicShell,
  PublicTitle,
  PublicUnavailable,
  moneyFcfa,
  publicPrimaryClass,
} from "../../components/public/PublicShell.js";
import { cn } from "../../lib/utils.js";
import { dateTimeFr } from "../../lib/format.js";
import {
  receiptsApi,
  receiptErrorMessage,
  downloadReceipt,
} from "../api/receipts-api.js";

const errorCode = (failure: unknown): unknown =>
  axios.isAxiosError<{ error?: unknown }>(failure)
    ? failure.response?.data?.error
    : null;
const methods: Record<FinancePaymentMethod, string> = {
  cash: "Espèces",
  bank_transfer: "Virement bancaire",
  mobile_money: "Mobile Money",
};
const corrections: Record<Exclude<ReceiptCorrectionState, "none">, string> = {
  partially_corrected: "Le paiement associé a été partiellement corrigé.",
  fully_corrected: "Le paiement associé a été entièrement corrigé.",
};

/** Receipt link (board 11g): amount first, facts frozen at issue, cancelled state explained. Logic unchanged from S6.4. */
export function PublicReceiptPage() {
  const { token = "" } = useParams();
  const query = useQuery({
    queryKey: ["public-receipt", token],
    queryFn: () => receiptsApi.publicMetadata(token),
    enabled: Boolean(token),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // POL-01 D3: once the link is used up, expired or revoked, the page stays readable but cannot download again.
  const [closed, setClosed] = useState(false);
  const inFlight = useRef(false);

  async function download() {
    if (inFlight.current || !query.data || closed) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      downloadReceipt(
        await receiptsApi.publicPdf(token),
        query.data.receiptNumber,
      );
      setNotice(
        "Reçu téléchargé. Il conserve les informations figées à son émission.",
      );
      const fresh = await query.refetch();
      if (fresh.isError && isReceiptLinkClosed(errorCode(fresh.error)))
        setClosed(true);
    } catch (failure) {
      setError(receiptErrorMessage(failure, "public"));
      if (isReceiptLinkClosed(errorCode(failure))) setClosed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (token && query.isPending)
    return <PublicLoading label="Chargement du reçu…" tag="Reçu" />;
  // A refetch that fails after a download keeps the receipt on screen; only a first load failure refuses the page.
  if (!token || !query.data)
    return (
      <PublicUnavailable
        title="Reçu indisponible"
        message={receiptErrorMessage(query.error, "public")}
        tag="Reçu"
        onRetry={() => void query.refetch()}
      />
    );

  const r = query.data;
  const voided = r.state === "voided";
  const remaining = closed ? 0 : r.remainingDownloads;

  return (
    <PublicShell
      tag={r.receiptNumber}
      actions={
        <>
          <p
            className="text-center text-xs text-muted-foreground"
            aria-live="polite"
          >
            {remaining > 0
              ? `${remaining} téléchargement${remaining > 1 ? "s" : ""} restant${remaining > 1 ? "s" : ""}`
              : "Plus aucun téléchargement disponible avec ce lien."}
          </p>
          <Button
            className={publicPrimaryClass}
            disabled={busy || closed || !r.canDownload}
            onClick={() => void download()}
          >
            <Download aria-hidden="true" />
            {busy
              ? "Téléchargement…"
              : voided
                ? "Télécharger le reçu d'origine"
                : "Télécharger le reçu (PDF)"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <PublicTitle>Reçu de paiement</PublicTitle>
        <span
          className={cn(
            "self-start rounded-full px-2.5 py-0.5 text-xs font-bold",
            voided
              ? "bg-danger-soft text-danger"
              : "bg-success-soft text-success",
          )}
        >
          {voided ? "Annulé" : "Reçu émis"}
        </span>
      </div>

      {voided ? (
        <section
          role="status"
          className="flex flex-col gap-1 rounded-[14px] bg-danger-soft px-4 py-3.5 text-danger"
        >
          <span className="text-sm font-extrabold">Ce reçu a été annulé</span>
          <span className="text-[13px] leading-relaxed">
            Le paiement associé a été corrigé. Le numéro et le reçu d'origine
            restent consultables tels qu'ils ont été émis.
          </span>
        </section>
      ) : null}

      <PublicCard className="gap-3.5 p-[18px]">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-muted-foreground">
            Montant reçu
          </span>
          <span
            className={cn(
              "text-[30px] font-extrabold tracking-tight tabular-nums",
              voided && "line-through decoration-2",
            )}
          >
            {moneyFcfa(r.amountXaf)}
          </span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 border-t border-border-subtle pt-3 text-sm">
          <dt className="text-muted-foreground">Paiement</dt>
          <dd className="text-right font-semibold">
            {dateTimeFr(r.occurredAt)}
          </dd>
          <dt className="text-muted-foreground">Moyen</dt>
          <dd className="text-right font-semibold">
            {methods[r.paymentMethod]}
          </dd>
          <dt className="text-muted-foreground">Nom</dt>
          <dd className="break-words text-right font-semibold">
            {r.customerName}
          </dd>
          <dt className="text-muted-foreground">Émis le</dt>
          <dd className="text-right font-semibold">{dateTimeFr(r.issuedAt)}</dd>
          <dt className="text-muted-foreground">Abonnement</dt>
          <dd className="break-all text-right text-xs text-muted-foreground">
            {r.subscriptionReference}
          </dd>
        </dl>
      </PublicCard>

      {r.correctionState !== "none" ? (
        <p className="text-sm">
          {corrections[r.correctionState]} Montant effectif actuel :{" "}
          {moneyFcfa(r.effectiveAmountXaf)}. Le reçu d'origine n'est pas
          modifié.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg bg-success-soft p-3 text-sm">
          {notice}
        </p>
      ) : null}
      <PublicNote>
        Heures de Libreville. Lien personnel, temporaire et limité en
        téléchargements : ne le partage pas. Une question ? Écris à ton coach.
      </PublicNote>
    </PublicShell>
  );
}
