import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { financePaymentMethods, type FinanceResponse, type FinancePaymentMethod, type FinancePlanStatus, type FinanceInstallmentStatus, type FinancialStatus } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, NativeSelect } from "../../components/ui/input.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { dateTimeFr, fromLocalInput, moneyXaf, toLocalInput } from "../../lib/format.js";
import { financeApi, financeErrorMessage } from "../api/finance-api.js";

const methods: Record<FinancePaymentMethod, string> = { cash: "Espèces", bank_transfer: "Virement bancaire", mobile_money: "Mobile Money" };
const planStatuses: Record<FinancePlanStatus, string> = { draft: "Brouillon", active: "Actif", superseded: "Remplacé", settled: "Soldé", cancelled: "Annulé" };
const installmentStatuses: Record<FinanceInstallmentStatus, string> = { upcoming: "À venir", due: "À échéance", partially_paid: "Partiellement payée", paid: "Payée", overdue: "En retard" };
const settlement: Record<FinancialStatus, string> = { unpaid: "Non payé", partially_paid: "Partiellement payé", paid: "Payé" };
type Mode = { kind: "create" } | { kind: "revise"; id: string } | { kind: "record"; max: number } | { kind: "correct"; id: string; max: number }
  | { kind: "activate"; id: string } | { kind: "cancel"; id: string };
const titles: Record<Mode["kind"], string> = { create: "Créer l’échéancier", revise: "Réviser l’échéancier", record: "Enregistrer un paiement", correct: "Corriger un paiement", activate: "Activer l’échéancier", cancel: "Annuler l’échéancier" };
type Row = { key: string; amount: string; due: string };
const blankRow = (): Row => ({ key: crypto.randomUUID(), amount: "", due: "" });
export function AdminFinancePanel({ subscriptionId }: { subscriptionId: string }) {
  const client = useQueryClient(), queryKey = ["finance", subscriptionId] as const;
  const query = useQuery({ queryKey, queryFn: () => financeApi.get(subscriptionId), refetchInterval: 30000 });
  const [mode, setMode] = useState<Mode | null>(null), [rows, setRows] = useState<Row[]>([]), [amount, setAmount] = useState(""), [occurred, setOccurred] = useState("");
  const [method, setMethod] = useState<FinancePaymentMethod>("cash"), [reference, setReference] = useState(""), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), inFlight = useRef(false);
  const intent = useRef<{ fingerprint: string; key: string } | null>(null), opener = useRef<HTMLButtonElement | null>(null), refreshButton = useRef<HTMLButtonElement>(null);
  function open(next: Mode, button: HTMLButtonElement) {
    opener.current = button; setMode(next); setRows(query.data?.finance.remainingXaf === 0 ? [] : [blankRow()]); setAmount(""); setOccurred(toLocalInput(new Date())); setMethod("cash"); setReference(""); setError(null); intent.current = null;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!mode || inFlight.current) return;
    let operation: () => Promise<FinanceResponse>;
    if (mode.kind === "create" || mode.kind === "revise") {
      const installments = rows.map(row => ({ amountXaf: Number(row.amount), dueDate: fromLocalInput(row.due) }));
      if (installments.some(item => !item.dueDate || !Number.isSafeInteger(item.amountXaf) || item.amountXaf <= 0)) { setError("Renseigne chaque montant entier positif et chaque date d’échéance."); return; }
      const input = { installments: installments.map(item => ({ amountXaf: item.amountXaf, dueDate: item.dueDate! })) };
      operation = mode.kind === "create" ? () => financeApi.create(subscriptionId, input) : () => financeApi.revise(mode.id, input);
    } else if (mode.kind === "record" || mode.kind === "correct") {
      const amountXaf = Number(amount), occurredAt = fromLocalInput(occurred);
      if (!occurredAt || !Number.isSafeInteger(amountXaf) || amountXaf <= 0) { setError("Renseigne un montant entier positif et une date valide."); return; }
      const fingerprint = JSON.stringify({ subscriptionId, mode, amountXaf, occurredAt, method, reference });
      if (!intent.current || intent.current.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() };
      const input = { amountXaf, occurredAt, idempotencyKey: intent.current.key };
      operation = mode.kind === "record" ? () => financeApi.record(subscriptionId, { ...input, paymentMethod: method, externalReference: reference.trim() || null }) : () => financeApi.correct(mode.id, input);
    } else operation = mode.kind === "activate" ? () => financeApi.activate(mode.id) : () => financeApi.cancel(mode.id);
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const result = await operation(); client.setQueryData(queryKey, result); intent.current = null; setMode(null);
      setNotice(result.replayed ? "Opération déjà enregistrée. L’historique a été actualisé." : "Opération financière enregistrée.");
    } catch (failure) { setError(financeErrorMessage(failure)); await query.refetch(); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (query.isPending) return <p role="status" className="text-sm text-muted-foreground">Chargement de la finance…</p>;
  if (query.isError || !query.data) return <EmptyState title="Finance indisponible" description={financeErrorMessage(query.error)} action={<Button variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button>} />;
  const view = query.data.finance, active = view.activePaymentPlan;
  const table = (plan: typeof view.plans[number]) => <div className="overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label="Échéances de paiement"><table className="w-full min-w-[580px] text-left text-sm"><caption className="sr-only">Échéances de cet échéancier</caption><thead className="bg-muted"><tr>{["Échéance", "Montant", "Payé", "Reste à payer", "État"].map(label => <th scope="col" key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{plan.installments.map(item => <tr key={item.id} className="border-t border-border-subtle"><th scope="row" className="px-4 py-3 font-medium">{dateTimeFr(item.dueDate)}<span className="block text-xs text-muted-foreground">Échéance {item.sequenceNumber}</span></th><td className="px-4 py-3 tabular-nums">{moneyXaf(item.amountXaf)}</td><td className="px-4 py-3 tabular-nums">{moneyXaf(item.paidXaf)}</td><td className="px-4 py-3 tabular-nums">{moneyXaf(item.remainingXaf)}</td><td className="px-4 py-3">{installmentStatuses[item.effectiveStatus]}</td></tr>)}</tbody></table></div>;
  return <section aria-label="Finance de l’abonnement" className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-extrabold">Finance</h2><p className="text-sm text-muted-foreground">Les décisions financières ne modifient pas le statut de l’abonnement.</p></div><Button ref={refreshButton} variant="secondary" disabled={busy || query.isFetching} onClick={() => void query.refetch()}>Actualiser la finance</Button></div>
    <div className="grid gap-3 sm:grid-cols-3">{[["Montant convenu", view.agreedAmountXaf], ["Payé", view.confirmedPaidXaf], ["Reste à payer", view.remainingXaf]].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-extrabold tabular-nums">{moneyXaf(Number(value))}</p></div>)}</div>
    <p className="text-sm"><strong>Statut financier : {settlement[view.financialStatus]}</strong>{view.hasOverdueInstallment ? " · Échéance en retard" : ""}</p>
    {view.scheduleRequiresRevision && <p className="rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm">Le reste à payer nécessite un échéancier à créer ou à réviser. Aucun nouveau paiement ne peut être enregistré tant que l’échéancier actif ne couvre pas ce montant. Les montants sans échéance ne sont pas automatiquement considérés en retard.</p>}
    {notice && <p role="status" className="rounded-lg bg-success-soft p-3 text-sm">{notice}</p>}
    <div className="flex flex-wrap gap-2">{view.canCreatePlan && <Button disabled={busy} onClick={event => open({ kind: "create" }, event.currentTarget)}>Créer l’échéancier</Button>}<Button disabled={busy || !view.canRecordPayment} onClick={event => open({ kind: "record", max: view.remainingXaf }, event.currentTarget)}>Enregistrer un paiement</Button></div>
    <section className="space-y-3"><h3 className="font-bold">Échéancier actif</h3>{active ? <><p className="text-sm">Montant de cet échéancier : {moneyXaf(active.totalExpectedXaf)}</p>{table(active)}<div className="flex flex-wrap gap-2">{active.availableCommands.includes("revise") && <Button variant="secondary" disabled={busy} onClick={event => open({ kind: "revise", id: active.id }, event.currentTarget)}>Réviser l’échéancier</Button>}{active.availableCommands.includes("cancel") && <Button variant="destructive" disabled={busy} onClick={event => open({ kind: "cancel", id: active.id }, event.currentTarget)}>Annuler l’échéancier</Button>}</div></> : <p className="text-sm text-muted-foreground">Aucun échéancier actif.</p>}</section>
    {view.plans.filter(plan => plan.id !== active?.id).map(plan => <details key={plan.id} className="rounded-xl border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">Échéancier {planStatuses[plan.status]} · {moneyXaf(plan.totalExpectedXaf)} · {dateTimeFr(plan.createdAt)}</summary><div className="mt-4 space-y-3">{plan.revisedFromPlanId && <p className="text-xs text-muted-foreground">Cet échéancier conserve le lien avec sa version précédente.</p>}{table(plan)}<div className="flex flex-wrap gap-2">{plan.availableCommands.includes("activate") && <Button disabled={busy} onClick={event => open({ kind: "activate", id: plan.id }, event.currentTarget)}>Activer l’échéancier</Button>}{plan.availableCommands.includes("cancel") && <Button variant="destructive" disabled={busy} onClick={event => open({ kind: "cancel", id: plan.id }, event.currentTarget)}>Annuler l’échéancier</Button>}</div></div></details>)}
    <section className="space-y-3"><h3 className="font-bold">Historique des paiements</h3>{view.paymentHistory.length === 0 ? <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p> : <ol className="space-y-3">{view.paymentHistory.map(payment => <li key={payment.id} className="rounded-xl border border-border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{payment.eventType === "payment_received" ? "Paiement confirmé" : "Correction de paiement"} · {moneyXaf(payment.amountXaf)}</p><p className="text-sm text-muted-foreground">{dateTimeFr(payment.occurredAt)} · {methods[payment.paymentMethod]}</p></div>{payment.correctableXaf > 0 && <Button variant="secondary" size="sm" disabled={busy} onClick={event => open({ kind: "correct", id: payment.id, max: payment.correctableXaf }, event.currentTarget)}>Corriger un paiement</Button>}</div>
      <p className="mt-2 text-xs text-muted-foreground">Confirmation : {dateTimeFr(payment.confirmedAt)}</p>{payment.externalReference && <p className="mt-2 break-all text-sm">Référence externe : {payment.externalReference}</p>}{payment.correctionOfEventId && <p className="mt-2 break-all text-xs text-muted-foreground">Correction du paiement {payment.correctionOfEventId}. Le paiement initial reste conservé.</p>}
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Répartition enregistrée</summary><ul className="mt-2 space-y-1">{payment.allocations.map(allocation => <li key={allocation.id} className="break-all">{moneyXaf(allocation.amountXaf)} · échéance {view.plans.flatMap(plan => plan.installments).find(item => item.id === allocation.installmentId)?.sequenceNumber ?? "historique"}{allocation.paymentPlanId !== active?.id ? " · échéancier historique" : ""}</li>)}</ul></details>
    </li>)}</ol>}</section>
    <Dialog open={Boolean(mode)} onOpenChange={open => { if (!open && !busy) setMode(null); }}>
      {mode && <DialogContent title={titles[mode.kind]} description="Montants en XAF entiers. Les opérations sont contrôlées et confirmées par le serveur." className="max-h-[90dvh] max-w-xl overflow-y-auto" onCloseAutoFocus={event => { event.preventDefault(); (opener.current?.isConnected ? opener.current : refreshButton.current)?.focus(); }}>
        <form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
          {(mode.kind === "create" || mode.kind === "revise") && <><p className="text-sm">Reste à planifier : <strong>{moneyXaf(view.remainingXaf)}</strong>. Saisis chaque montant et chaque date en heure de Libreville.</p>{mode.kind === "revise" && <p className="text-sm">La révision remplace l’échéancier actif. Les paiements et échéances historiques restent conservés.</p>}
            {rows.map((row, index) => <div key={row.key} className="space-y-2 rounded-lg border border-border p-3"><p className="text-sm font-bold">Échéance {index + 1}</p><label className="block text-sm">Montant (XAF)<Input required type="number" min="1" max="2147483647" step="1" value={row.amount} onChange={event => setRows(items => items.map(item => item.key === row.key ? { ...item, amount: event.target.value } : item))} /></label><label className="block text-sm">Date et heure à Libreville<Input required type="datetime-local" value={row.due} onChange={event => setRows(items => items.map(item => item.key === row.key ? { ...item, due: event.target.value } : item))} /></label><Button type="button" variant="ghost" size="sm" onClick={() => setRows(items => items.filter(item => item.key !== row.key))}>Retirer l’échéance {index + 1}</Button></div>)}<Button type="button" variant="secondary" disabled={rows.length >= 200} onClick={() => setRows(items => [...items, blankRow()])}>Ajouter une échéance</Button>
          </>}
          {(mode.kind === "record" || mode.kind === "correct") && <><label className="block text-sm">Montant (XAF)<Input type="number" required min="1" max={mode.max} step="1" value={amount} onChange={event => setAmount(event.target.value)} /></label><label className="block text-sm">Date et heure de l’opération à Libreville<Input type="datetime-local" required value={occurred} onChange={event => setOccurred(event.target.value)} /></label>
            {mode.kind === "record" ? <><label className="block text-sm">Moyen de paiement<NativeSelect value={method} onChange={event => { const selected = financePaymentMethods.find(method => method === event.target.value); if (selected) setMethod(selected); }}>{financePaymentMethods.map(method => <option value={method} key={method}>{methods[method]}</option>)}</NativeSelect></label><label className="block text-sm">Référence externe (facultative)<Input value={reference} maxLength={200} onChange={event => setReference(event.target.value)} /></label><p className="text-sm text-muted-foreground">Le paiement sera confirmé immédiatement et réparti sur les échéances par ordre d’exigibilité.</p></>
              : <p className="rounded-lg bg-warning-soft p-3 text-sm">Tu confirmes une correction comptable de ce paiement, jusqu’à {moneyXaf(mode.max)}. Une écriture compensatoire sera ajoutée ; l’original ne sera pas modifié. Ce n’est pas un remboursement au client. Un nouvel échéancier pourra être nécessaire.</p>}
          </>}
          {mode.kind === "activate" && <p className="text-sm">Confirmer cet échéancier comme actif ? Le serveur vérifiera son total et l’absence d’autre échéancier actif.</p>}
          {mode.kind === "cancel" && <p className="text-sm">Confirmer l’annulation de cet échéancier ? La dette et les paiements restent conservés. L’abonnement ne change pas de statut.</p>}
          {error && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setMode(null)}>Retour</Button><Button type="submit" variant={mode.kind === "correct" || mode.kind === "cancel" ? "destructive-solid" : "default"}>{busy ? "Enregistrement…" : "Confirmer"}</Button></div>
        </fieldset></form>
      </DialogContent>}
    </Dialog>
  </section>;
}
