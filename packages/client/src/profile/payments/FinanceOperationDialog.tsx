import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { financePaymentMethods, type FinanceDetail, type FinancePaymentMethod, type FinanceResponse } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, NativeSelect } from "../../components/ui/input.js";
import { Field } from "../../components/ui/field.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
import { fromLocalInput, moneyXaf, toLocalInput } from "../../lib/format.js";
import { financeApi, financeErrorMessage } from "../../finance/api/finance-api.js";
import { paymentMethods } from "./payments-meta.js";

/** Every finance command keeps its former server contract (S5): integer XAF, Libreville time, idempotent payments. */
export type FinanceMode =
  | { kind: "create" }
  | { kind: "revise"; id: string }
  | { kind: "record"; max: number }
  | { kind: "correct"; id: string; max: number }
  | { kind: "activate"; id: string }
  | { kind: "cancel"; id: string };

const titles: Record<FinanceMode["kind"], string> = {
  create: "Créer l'échéancier",
  revise: "Réviser l'échéancier",
  record: "Enregistrer un paiement",
  correct: "Corriger un paiement",
  activate: "Activer l'échéancier",
  cancel: "Annuler l'échéancier",
};

type Row = { key: string; amount: string; due: string };
const blankRow = (): Row => ({ key: crypto.randomUUID(), amount: "", due: "" });

type Props = { subscriptionId: string; finance: FinanceDetail; mode: FinanceMode; onClose: () => void; onCloseAutoFocus: (event: Event) => void };

export function FinanceOperationDialog({ subscriptionId, finance, mode, onClose, onCloseAutoFocus }: Props) {
  const client = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() => (finance.remainingXaf === 0 ? [] : [blankRow()]));
  const [amount, setAmount] = useState(""), [occurred, setOccurred] = useState(() => toLocalInput(new Date()));
  const [method, setMethod] = useState<FinancePaymentMethod>("cash"), [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false), intent = useRef<{ fingerprint: string; key: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    let operation: () => Promise<FinanceResponse>;
    if (mode.kind === "create" || mode.kind === "revise") {
      const installments = rows.map((row) => ({ amountXaf: Number(row.amount), dueDate: fromLocalInput(row.due) }));
      if (installments.some((item) => !item.dueDate || !Number.isSafeInteger(item.amountXaf) || item.amountXaf <= 0)) {
        setError("Renseigne chaque montant entier positif et chaque date d'échéance.");
        return;
      }
      const input = { installments: installments.map((item) => ({ amountXaf: item.amountXaf, dueDate: item.dueDate! })) };
      operation = mode.kind === "create" ? () => financeApi.create(subscriptionId, input) : () => financeApi.revise(mode.id, input);
    } else if (mode.kind === "record" || mode.kind === "correct") {
      const amountXaf = Number(amount), occurredAt = fromLocalInput(occurred);
      if (!occurredAt || !Number.isSafeInteger(amountXaf) || amountXaf <= 0) {
        setError("Renseigne un montant entier positif et une date valide.");
        return;
      }
      // Same intent → same idempotency key, so a retried click never records the payment twice.
      const fingerprint = JSON.stringify({ subscriptionId, mode, amountXaf, occurredAt, method, reference });
      if (!intent.current || intent.current.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() };
      const input = { amountXaf, occurredAt, idempotencyKey: intent.current.key };
      operation = mode.kind === "record"
        ? () => financeApi.record(subscriptionId, { ...input, paymentMethod: method, externalReference: reference.trim() || null })
        : () => financeApi.correct(mode.id, input);
    } else operation = mode.kind === "activate" ? () => financeApi.activate(mode.id) : () => financeApi.cancel(mode.id);

    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      client.setQueryData(["finance", subscriptionId], result);
      intent.current = null;
      onClose();
      toast.success(result.replayed ? "Opération déjà enregistrée. L'historique a été actualisé." : "Opération financière enregistrée.");
    } catch (failure) {
      setError(financeErrorMessage(failure));
      await client.invalidateQueries({ queryKey: ["finance", subscriptionId] });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const planned = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const danger = mode.kind === "correct" || mode.kind === "cancel";

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent
        title={titles[mode.kind]}
        description="Montants en XAF entiers. Les opérations sont contrôlées et confirmées par le serveur."
        className="max-h-[90dvh] max-w-xl overflow-y-auto"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="flex flex-col gap-4">
            {mode.kind === "create" || mode.kind === "revise" ? (
              <>
                <p className="text-sm">
                  Reste à planifier : <strong className="tabular-nums">{moneyXaf(finance.remainingXaf)}</strong> · saisi : <span className="tabular-nums">{moneyXaf(planned)}</span>. Dates et heures à Libreville.
                </p>
                {mode.kind === "revise" ? <p className="text-sm text-muted-foreground">La révision remplace l'échéancier actif. Les paiements et échéances historiques restent conservés.</p> : null}
                <ol className="flex flex-col gap-3">
                  {rows.map((row, index) => (
                    <li key={row.key} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-lg border border-border p-3">
                      <Field label={`Échéance ${index + 1} sur ${rows.length} · montant (XAF)`}>
                        {(p) => <Input {...p} required type="number" min="1" max="2147483647" step="1" inputMode="numeric" value={row.amount} onChange={(e) => setRows((items) => items.map((item) => (item.key === row.key ? { ...item, amount: e.target.value } : item)))} />}
                      </Field>
                      <Field label="Date et heure">
                        {(p) => <Input {...p} required type="datetime-local" value={row.due} onChange={(e) => setRows((items) => items.map((item) => (item.key === row.key ? { ...item, due: e.target.value } : item)))} />}
                      </Field>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Retirer l'échéance ${index + 1}`} onClick={() => setRows((items) => items.filter((item) => item.key !== row.key))}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ol>
                <Button type="button" variant="secondary" className="self-start" disabled={rows.length >= 200} onClick={() => setRows((items) => [...items, blankRow()])}>
                  <Plus aria-hidden="true" />
                  Ajouter une échéance
                </Button>
              </>
            ) : null}

            {mode.kind === "record" || mode.kind === "correct" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Montant (XAF)" hint={`Maximum ${moneyXaf(mode.max)}`}>
                    {(p) => <Input {...p} type="number" required min="1" max={mode.max} step="1" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />}
                  </Field>
                  <Field label="Date et heure (Libreville)">
                    {(p) => <Input {...p} type="datetime-local" required value={occurred} onChange={(e) => setOccurred(e.target.value)} />}
                  </Field>
                  {mode.kind === "record" ? (
                    <>
                      <Field label="Moyen de paiement">
                        {(p) => (
                          <NativeSelect {...p} value={method} onChange={(e) => { const selected = financePaymentMethods.find((m) => m === e.target.value); if (selected) setMethod(selected); }}>
                            {financePaymentMethods.map((m) => <option value={m} key={m}>{paymentMethods[m]}</option>)}
                          </NativeSelect>
                        )}
                      </Field>
                      <Field label="Référence externe" optionalHint="(facultatif)">
                        {(p) => <Input {...p} value={reference} maxLength={200} onChange={(e) => setReference(e.target.value)} />}
                      </Field>
                    </>
                  ) : null}
                </div>
                {mode.kind === "record" ? (
                  <p className="rounded-lg bg-muted p-3 text-[13px]">Le paiement est confirmé immédiatement et réparti sur les échéances par ordre d'exigibilité.</p>
                ) : (
                  <p className="rounded-lg bg-warning-soft p-3 text-[13px]">
                    Tu confirmes une correction comptable de ce paiement, jusqu'à {moneyXaf(mode.max)}. Une écriture compensatoire est ajoutée ; l'original n'est pas modifié. Ce n'est pas un remboursement à la cliente. Un nouvel échéancier pourra être nécessaire.
                  </p>
                )}
              </>
            ) : null}

            {mode.kind === "activate" ? <p className="text-sm">Confirmer cet échéancier comme actif ? Le serveur vérifie son total et l'absence d'autre échéancier actif.</p> : null}
            {mode.kind === "cancel" ? <p className="text-sm">Confirmer l'annulation de cet échéancier ? La dette et les paiements restent conservés. L'abonnement ne change pas de statut.</p> : null}

            {error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>Retour</Button>
              <Button type="submit" variant={danger ? "destructive-solid" : "default"}>{busy ? "Enregistrement…" : "Confirmer"}</Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
