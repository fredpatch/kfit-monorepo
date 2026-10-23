import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileCheck2, MoreHorizontal, Plus } from "lucide-react";
import type { FinanceDetail, FinancePaymentEvent, FinancePlan, Receipt } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Card, CardHeader, CardTitle } from "../../components/ui/card.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { Pill, StatusPill } from "../../components/ui/status-pill.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/ui/dropdown-menu.js";
import { cn } from "../../lib/utils.js";
import { focusReturnTarget } from "../../lib/focus.js";
import { dateTimeFr, moneyXaf, shortDateFr } from "../../lib/format.js";
import { financeApi, financeErrorMessage } from "../../finance/api/finance-api.js";
import { FinanceOperationDialog, type FinanceMode } from "./FinanceOperationDialog.js";
import { ProofsCard, useProofActions, usePaymentProofs } from "./proof-actions.js";
import { IssueReceiptButton, useReceiptActions, useReceipts } from "./receipt-actions.js";
import { QuotesCard } from "./QuotesCard.js";
import { installmentStatus, installmentsLabel, paymentMethods, planStatus, settlementLabel } from "./payments-meta.js";

/**
 * « Paiements » tab (board 15a, UX-15a): former Finance + Devis tabs, receipts and payment proofs in one place.
 * Rules unchanged: the server owns every amount, allocation and state; the financial status never changes the subscription status.
 */
export function PaymentsTab({ subscriptionId }: { subscriptionId: string }) {
  const query = useQuery({ queryKey: ["finance", subscriptionId], queryFn: () => financeApi.get(subscriptionId), refetchInterval: 30000 });
  const proofs = usePaymentProofs(subscriptionId);
  const receipts = useReceipts(subscriptionId);
  const [mode, setMode] = useState<FinanceMode | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const finance = query.data?.finance;
  const active = finance?.activePaymentPlan ?? null;
  const nextOpen = active?.installments.filter((i) => i.remainingXaf > 0).sort((a, b) => a.sequenceNumber - b.sequenceNumber)[0] ?? null;
  const proofActions = useProofActions(subscriptionId, nextOpen ? `échéance ${nextOpen.sequenceNumber}` : null);
  const receiptActions = useReceiptActions(subscriptionId);

  function openFinance(next: FinanceMode) {
    opener.current = focusReturnTarget();
    setMode(next);
  }
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
  };

  if (query.isPending) return <p role="status" className="text-sm text-muted-foreground">Chargement des paiements…</p>;
  if (query.isError || !finance) {
    return <EmptyState title="Paiements indisponibles" description={financeErrorMessage(query.error)} action={<Button variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button>} />;
  }

  const pending = (proofs.data?.proofs ?? []).filter((p) => p.status === "pending_review");
  const firstPending = [...pending].sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt))[0];
  const received = finance.paymentHistory.filter((p) => p.eventType === "payment_received").length;
  const planVersion = (plan: FinancePlan) => [...finance.plans].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).findIndex((p) => p.id === plan.id) + 1;
  const sequenceOf = (installmentId: string) => finance.plans.flatMap((p) => p.installments).find((i) => i.id === installmentId)?.sequenceNumber;
  const previousPlans = finance.plans.filter((p) => p.id !== active?.id);

  const tiles = [
    { label: "Montant convenu", value: moneyXaf(finance.agreedAmountXaf), note: "Montant de l'abonnement", tone: "" },
    { label: "Encaissé", value: moneyXaf(finance.confirmedPaidXaf), note: `${received} paiement${received > 1 ? "s" : ""} confirmé${received > 1 ? "s" : ""}`, tone: "text-success" },
    { label: "Reste à payer", value: moneyXaf(finance.remainingXaf), note: `${settlementLabel[finance.financialStatus]}${finance.hasOverdueInstallment ? " · échéance en retard" : ""}`, tone: finance.remainingXaf > 0 ? (finance.hasOverdueInstallment ? "text-danger" : "text-warning") : "text-success" },
    { label: "Prochaine échéance", value: nextOpen ? shortDateFr(nextOpen.dueDate) : "—", note: nextOpen ? `${moneyXaf(nextOpen.remainingXaf)} à régler` : "Aucune échéance ouverte", tone: nextOpen?.effectiveStatus === "overdue" ? "text-danger" : "" },
  ];

  return (
    <section aria-labelledby="payments-title" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 basis-full flex-col gap-0.5 sm:basis-auto">
          <h2 id="payments-title" className="text-xl font-extrabold tracking-tight">Paiements</h2>
          <p className="text-[13px] text-muted-foreground">Montants en XAF. Le statut financier ne change jamais le statut de l'abonnement.</p>
        </div>
        <Button variant="secondary" onClick={() => proofActions.openLink()}>Lien de dépôt de justificatif</Button>
        <Button disabled={!finance.canRecordPayment} onClick={() => openFinance({ kind: "record", max: finance.remainingXaf })}>Enregistrer un paiement</Button>
      </div>

      {firstPending ? (
        <section role="status" className="flex flex-wrap items-center gap-3.5 rounded-xl border border-waitlist/30 bg-waitlist-soft p-4">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-lg bg-card text-waitlist">
            <FileCheck2 className="size-[18px]" />
          </span>
          <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
            <p className="text-sm font-extrabold">{pending.length} justificatif{pending.length > 1 ? "s" : ""} à vérifier</p>
            <p className="text-[13px]">
              Déclaré : {moneyXaf(firstPending.claimedAmountXaf)} · {paymentMethods[firstPending.claimedPaymentMethod]} · {dateTimeFr(firstPending.claimedOccurredAt)}. Aucun paiement n'est créé avant ta vérification.
            </p>
          </div>
          <Button onClick={() => proofActions.openReview(firstPending)}>Vérifier le justificatif</Button>
        </section>
      ) : null}

      {finance.scheduleRequiresRevision ? (
        <p role="note" className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-[13px]">
          Le reste à payer n'est pas couvert par l'échéancier actif : crée ou révise l'échéancier avant d'enregistrer un nouveau paiement. Les montants sans échéance ne sont pas considérés en retard.
        </p>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.label} className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
            <span className="text-[13px] text-muted-foreground">{t.label}</span>
            <span className={cn("text-xl font-extrabold tabular-nums tracking-tight sm:text-2xl", t.tone)}>{t.value}</span>
            <span className="text-xs text-muted-foreground">{t.note}</span>
          </li>
        ))}
      </ul>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PlanCard finance={finance} plan={active} version={active ? planVersion(active) : 0} onAction={openFinance} />
          {previousPlans.length > 0 ? (
            <details className="rounded-xl border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold">Échéanciers précédents ({previousPlans.length})</summary>
              <div className="mt-4 flex flex-col gap-4">
                {previousPlans.map((plan) => (
                  <div key={plan.id} className="flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold">Version {planVersion(plan)}</span>
                      <StatusPill size="sm" status={planStatus[plan.status]} />
                      <span className="text-muted-foreground">{moneyXaf(plan.totalExpectedXaf)} · créé le {shortDateFr(plan.createdAt)}</span>
                      <span className="flex-1" />
                      {plan.availableCommands.includes("activate") ? <Button size="sm" onClick={() => openFinance({ kind: "activate", id: plan.id })}>Activer</Button> : null}
                      {plan.availableCommands.includes("cancel") ? <Button size="sm" variant="destructive" onClick={() => openFinance({ kind: "cancel", id: plan.id })}>Annuler</Button> : null}
                    </div>
                    <InstallmentTable plan={plan} />
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          <Card className="gap-3 p-5">
            <CardHeader>
              <CardTitle className="text-[15px]">Paiements reçus</CardTitle>
            </CardHeader>
            {finance.paymentHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border-subtle">
                {[...finance.paymentHistory].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).map((payment) => (
                  <PaymentRow
                    key={payment.id}
                    subscriptionId={subscriptionId}
                    payment={payment}
                    receipt={receipts.data?.receipts.find((r) => r.paymentEventId === payment.id) ?? null}
                    receiptsReady={Boolean(receipts.data)}
                    installments={installmentsLabel(payment.allocations.map((a) => sequenceOf(a.installmentId)).filter((n): n is number => n !== undefined))}
                    historical={payment.allocations.some((a) => a.paymentPlanId !== active?.id)}
                    onCorrect={() => openFinance({ kind: "correct", id: payment.id, max: payment.correctableXaf })}
                    receiptActions={receiptActions}
                  />
                ))}
              </ul>
            )}
            {receipts.isError ? <p role="alert" className="text-xs text-danger">Les reçus n'ont pas pu être chargés. Actualise la page.</p> : null}
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <QuotesCard subscriptionId={subscriptionId} agreedAmountXaf={finance.agreedAmountXaf} />
          <ProofsCard subscriptionId={subscriptionId} actions={proofActions} />
        </div>
      </div>

      {mode ? <FinanceOperationDialog subscriptionId={subscriptionId} finance={finance} mode={mode} onClose={() => setMode(null)} onCloseAutoFocus={restoreFocus} /> : null}
      {proofActions.element}
      {receiptActions.element}
    </section>
  );
}

function PlanCard({ finance, plan, version, onAction }: { finance: FinanceDetail; plan: FinancePlan | null; version: number; onAction: (mode: FinanceMode) => void }) {
  if (!plan) {
    return (
      <Card className="items-start gap-3 p-5">
        <CardTitle className="text-[15px]">Échéancier</CardTitle>
        <p className="text-sm text-muted-foreground">Aucun échéancier actif. Découpe le reste à payer ({moneyXaf(finance.remainingXaf)}) en échéances datées.</p>
        {finance.canCreatePlan ? (
          <Button onClick={() => onAction({ kind: "create" })}>
            <Plus aria-hidden="true" />
            Créer l'échéancier
          </Button>
        ) : null}
      </Card>
    );
  }
  const canRevise = plan.availableCommands.includes("revise"), canCancel = plan.availableCommands.includes("cancel");
  return (
    <Card className="gap-3 p-5">
      <CardHeader className="items-center">
        <CardTitle className="text-[15px]">
          Échéancier <span className="font-medium text-muted-foreground">· version {version} · {planStatus[plan.status].label.toLowerCase()} · {moneyXaf(plan.totalExpectedXaf)}</span>
        </CardTitle>
        {canRevise || canCancel || finance.canCreatePlan ? (
          <div className="flex items-center gap-1">
            {canRevise ? <Button size="sm" variant="secondary" onClick={() => onAction({ kind: "revise", id: plan.id })}>Réviser</Button> : null}
            {canCancel || finance.canCreatePlan ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label="Autres actions de l'échéancier"><MoreHorizontal aria-hidden="true" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {finance.canCreatePlan ? <DropdownMenuItem onSelect={() => onAction({ kind: "create" })}>Créer un nouvel échéancier</DropdownMenuItem> : null}
                  {finance.canCreatePlan && canCancel ? <DropdownMenuSeparator /> : null}
                  {canCancel ? <DropdownMenuItem destructive onSelect={() => onAction({ kind: "cancel", id: plan.id })}>Annuler l'échéancier</DropdownMenuItem> : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <InstallmentTable plan={plan} />
    </Card>
  );
}

function InstallmentTable({ plan }: { plan: FinancePlan }) {
  const total = plan.installments.length;
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Échéances">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-xs text-muted-foreground">
            {["Échéance", "Date", "Montant", "Payé", "Statut"].map((label) => <th key={label} scope="col" className="py-2 pr-3 font-semibold">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {plan.installments.map((i) => (
            <tr key={i.id} className="border-b border-border-subtle last:border-0">
              <th scope="row" className="py-2.5 pr-3 font-semibold">{i.sequenceNumber} sur {total}</th>
              <td className="py-2.5 pr-3" title={dateTimeFr(i.dueDate)}>{shortDateFr(i.dueDate)}</td>
              <td className="py-2.5 pr-3 tabular-nums">{moneyXaf(i.amountXaf)}</td>
              <td className="py-2.5 pr-3 tabular-nums">{moneyXaf(i.paidXaf)}</td>
              <td className="py-2.5"><StatusPill size="sm" status={installmentStatus[i.effectiveStatus]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type RowProps = {
  subscriptionId: string;
  payment: FinancePaymentEvent;
  receipt: Receipt | null;
  receiptsReady: boolean;
  installments: string;
  historical: boolean;
  onCorrect: () => void;
  receiptActions: ReturnType<typeof useReceiptActions>;
};

function PaymentRow({ subscriptionId, payment, receipt, receiptsReady, installments, historical, onCorrect, receiptActions }: RowProps) {
  const isCorrection = payment.eventType !== "payment_received";
  const meta = [dateTimeFr(payment.occurredAt), paymentMethods[payment.paymentMethod], installments + (historical && installments ? " (échéancier précédent)" : "")].filter(Boolean).join(" · ");
  const canVoid = receipt?.state === "issued" && receipt.correctionState === "fully_corrected";
  const hasMenu = payment.correctableXaf > 0 || Boolean(receipt);
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
        <p className="text-sm font-bold tabular-nums">{isCorrection ? `Correction · −${moneyXaf(payment.amountXaf)}` : moneyXaf(payment.amountXaf)}</p>
        <p className="text-[13px] text-muted-foreground">{meta}</p>
        {payment.externalReference ? <p className="break-all text-xs text-muted-foreground">Réf. {payment.externalReference}</p> : null}
        {isCorrection ? <p className="text-xs text-muted-foreground">Écriture compensatoire ; le paiement initial reste conservé.</p> : null}
        {receipt && receipt.correctionState !== "none" ? <p className="text-xs text-warning">Paiement corrigé · montant effectif {moneyXaf(receipt.effectiveAmountXaf)}</p> : null}
      </div>
      {!isCorrection ? (
        receipt ? (
          <div className="flex items-center gap-2">
            <Pill tone={receipt.state === "voided" ? "danger" : "success"} size="sm">Reçu {receipt.receiptNumber}{receipt.state === "voided" ? " · annulé" : ""}</Pill>
            <Button size="sm" variant="ghost" onClick={() => receiptActions.open("share", receipt)}>Partager</Button>
          </div>
        ) : (
          <IssueReceiptButton subscriptionId={subscriptionId} payment={payment} ready={receiptsReady} />
        )
      ) : null}
      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`Plus d'actions sur le paiement du ${dateTimeFr(payment.occurredAt)}`}><MoreHorizontal aria-hidden="true" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {payment.correctableXaf > 0 ? <DropdownMenuItem onSelect={onCorrect}>Corriger le paiement</DropdownMenuItem> : null}
            {receipt ? (
              <>
                {payment.correctableXaf > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem onSelect={() => void receiptActions.download(receipt)}>Télécharger le reçu</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => receiptActions.open("links", receipt)}>Liens partagés ({receipt.links.length})</DropdownMenuItem>
                {canVoid ? <DropdownMenuItem destructive onSelect={() => receiptActions.open("void", receipt)}>Annuler le reçu</DropdownMenuItem> : null}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : <span className="size-8" aria-hidden="true" />}
    </li>
  );
}
