import { useRef, useState } from "react";
import { useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import type { QuoteDecision } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
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
import { dateFr, dateTimeFr } from "../../lib/format.js";
import {
  downloadQuote,
  quoteErrorMessage,
  quotesApi,
} from "../api/quotes-api.js";

const askTitles: Record<QuoteDecision, string> = {
  accepted: "Accepter le devis ?",
  declined: "Refuser le devis ?",
  changes_requested: "Demander un changement ?",
};
const confirmLabels: Record<QuoteDecision, string> = {
  accepted: "Oui, j'accepte",
  declined: "Oui, je refuse",
  changes_requested: "Envoyer la demande",
};
const outcomes: Record<QuoteDecision, { label: string; className: string }> = {
  accepted: {
    label: "Devis accepté",
    className: "bg-success-soft text-success",
  },
  declined: { label: "Devis refusé", className: "bg-danger-soft text-danger" },
  changes_requested: {
    label: "Changement demandé",
    className: "bg-warning-soft text-warning",
  },
};
const units: Record<string, string> = {
  week: "semaine(s)",
  month: "mois",
  day: "jour(s)",
};
/** Secondary answers sit side by side on a 390 px screen: labels may wrap to two lines. */
const answerClass =
  "h-auto min-h-11 whitespace-normal rounded-xl px-2 py-2 text-[13px] leading-tight";

/** Quote link (board 11f): one card to decide, one primary action, final answer confirmed in a dialog. Logic unchanged from S6.2. */
export function PublicQuotePage() {
  const { token = "" } = useParams();
  const client = useQueryClient();
  const queryKey = ["public-quote", token] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => quotesApi.publicDetail(token),
    retry: false,
    enabled: Boolean(token),
  });
  const [decision, setDecision] = useState<QuoteDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  async function respond() {
    if (!decision || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await quotesApi.respond(token, decision);
      client.setQueryData(queryKey, result);
      setDecision(null);
    } catch (failure) {
      setError(quoteErrorMessage(failure, "public"));
      await query.refetch();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function pdf() {
    if (inFlight.current || !query.data) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      downloadQuote(
        await quotesApi.publicPdf(token),
        `${query.data.snapshot.quoteNumber}-v${query.data.snapshot.versionNumber}.pdf`,
      );
    } catch (failure) {
      setError(quoteErrorMessage(failure, "public"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const ask =
    (value: QuoteDecision) => (event: React.MouseEvent<HTMLButtonElement>) => {
      opener.current = event.currentTarget;
      setDecision(value);
      setError(null);
    };

  if (token && query.isPending)
    return <PublicLoading label="Chargement du devis…" tag="Devis" />;
  if (!token || query.isError || !query.data)
    return (
      <PublicUnavailable
        title="Devis indisponible"
        message={quoteErrorMessage(query.error, "public")}
        tag="Devis"
        onRetry={() => void query.refetch()}
      />
    );

  const data = query.data;
  const s = data.snapshot;
  const outcome = data.response ? outcomes[data.response] : null;
  const answerable = !data.response;

  return (
    <PublicShell
      tag={`${s.quoteNumber} · v${s.versionNumber}`}
      actions={
        answerable ? (
          <>
            <Button
              className={publicPrimaryClass}
              disabled={busy || !data.canRespond}
              onClick={ask("accepted")}
            >
              Accepter le devis
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                className={answerClass}
                disabled={busy || !data.canRespond}
                onClick={ask("changes_requested")}
              >
                Demander un changement
              </Button>
              <Button
                variant="destructive"
                className={answerClass}
                disabled={busy || !data.canRespond}
                onClick={ask("declined")}
              >
                Refuser
              </Button>
            </div>
            {!data.canRespond ? (
              <p className="text-center text-xs text-muted-foreground">
                Ce devis ne peut plus recevoir de réponse.
              </p>
            ) : null}
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-1.5">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-[26px] font-extrabold leading-tight tracking-tight focus:outline-none"
        >
          Ton devis
        </h1>
        <span
          role={outcome ? "status" : undefined}
          className={cn(
            "self-start rounded-full px-2.5 py-0.5 text-xs font-bold",
            outcome ? outcome.className : "bg-info-soft text-info",
          )}
        >
          {outcome ? outcome.label : "En attente de ta réponse"}
        </span>
      </div>

      <PublicCard className="gap-3.5 p-[18px]">
        <div className="flex flex-col gap-1">
          <span className="text-[17px] font-extrabold">{s.serviceLabel}</span>
          <span className="text-sm text-muted-foreground">
            {[
              s.variantLabel ? `Formule ${s.variantLabel}` : null,
              s.durationValue !== null
                ? `${s.durationValue} ${units[s.durationUnit ?? ""] ?? s.durationUnit ?? ""}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        {s.components.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {s.components.map((item, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>{item.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  × {item.quantity}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-baseline justify-between gap-3 border-t border-border-subtle pt-3">
          <span className="text-sm text-muted-foreground">Montant</span>
          <span className="text-[26px] font-extrabold tracking-tight tabular-nums">
            {moneyFcfa(s.amountXaf)}
          </span>
        </div>
        <span className="text-[13px] text-muted-foreground">
          Émis le {dateFr(s.issuedAt)} · valable jusqu'au{" "}
          {dateTimeFr(s.validUntil)} (heure de Libreville)
        </span>
      </PublicCard>

      <details className="rounded-[18px] border border-border bg-card p-4">
        <summary className="cursor-pointer text-[15px] font-bold">
          Conditions commerciales
        </summary>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
          {s.terms}
        </p>
      </details>

      <Button
        variant="link"
        className="self-start"
        disabled={busy}
        onClick={() => void pdf()}
      >
        <Download aria-hidden="true" />
        Télécharger le devis (PDF)
      </Button>

      {outcome ? (
        <p className="text-sm text-muted-foreground">
          Ta réponse est enregistrée pour cette version. Ton coach assurera la
          suite.
        </p>
      ) : null}
      {error && !decision ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <PublicNote>
        Consulter ou télécharger le devis n'enregistre aucune réponse. Lien
        personnel et temporaire : ne le partage pas.
      </PublicNote>

      <Dialog
        open={Boolean(decision)}
        onOpenChange={(open) => {
          if (!open && !busy) setDecision(null);
        }}
      >
        {decision ? (
          <DialogContent
            title={askTitles[decision]}
            description={`Ta réponse sera définitive pour la version ${s.versionNumber} du devis ${s.quoteNumber}.`}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              (opener.current?.isConnected
                ? opener.current
                : heading.current
              )?.focus();
            }}
          >
            <p className="text-sm">
              Vérifie le montant de {moneyFcfa(s.amountXaf)}, la validité et les
              conditions avant de confirmer.
            </p>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => setDecision(null)}
              >
                Retour
              </Button>
              <Button
                disabled={busy}
                variant={
                  decision === "declined" ? "destructive-solid" : "default"
                }
                onClick={() => void respond()}
              >
                {busy ? "Enregistrement…" : confirmLabels[decision]}
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </PublicShell>
  );
}
