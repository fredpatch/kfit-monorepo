import { useState, type FormEvent } from "react";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { RETENTION_HOLD_REASON_MAX, RETENTION_HOLD_REASON_MIN, retentionHoldTypeLabels, retentionHoldTypes, type RetentionHoldItem, type RetentionHoldType } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
import { Field } from "../../components/ui/field.js";
import { NativeSelect, Textarea } from "../../components/ui/input.js";
import { dateFr } from "../../lib/format.js";
import { privacyApi } from "../api/privacy-api.js";
import { useCustomerHolds, usePrivacyRefresh } from "../api/privacy-queries.js";
import { privacyErrorMessage } from "../lib/privacy-error-messages.js";

/**
 * « Blocages de conservation » (S7.3b-2 D7): active customer-scope holds, shown under the fiche header and outside the
 * read-only boundary, so a hold can be released on an archived or anonymized customer.
 */
export function CustomerHoldsCard({ customerId, onRelease }: { customerId: string; onRelease: (hold: RetentionHoldItem) => void }) {
  const holds = useCustomerHolds(customerId);
  if (!holds.data?.length) return null;
  return (
    <section aria-labelledby="holds-title" className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-soft/40 p-4 sm:p-5">
      <h2 id="holds-title" className="flex items-center gap-2 text-sm font-bold">
        <ShieldAlert className="size-4 text-warning" aria-hidden="true" /> Blocages de conservation
      </h2>
      <ul className="flex flex-col divide-y divide-border-subtle">
        {holds.data.map((hold) => (
          <li key={hold.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
            <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5 text-[13px]">
              <strong>{retentionHoldTypeLabels[hold.holdType]}</strong>
              <span className="wrap-break-word">{hold.reason}</span>
              <span className="text-xs text-muted-foreground">Posé le {dateFr(hold.startedAt)}</span>
            </span>
            <Button variant="secondary" size="sm" onClick={() => onRelease(hold)}>Lever le blocage</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

type DialogProps = { onClose: () => void; restoreFocus: (event: Event) => void };

export function ReleaseHoldDialog({ hold, onClose, restoreFocus }: DialogProps & { hold: RetentionHoldItem }) {
  const refresh = usePrivacyRefresh();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  async function release() {
    setBusy(true); setError(null);
    try {
      await privacyApi.releaseHold(hold.id);
      await refresh();
      toast.success("Blocage levé.");
      onClose();
    } catch (failure) {
      setError(privacyErrorMessage(failure));
      await refresh();
    } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent title="Lever ce blocage ?" description="L'anonymisation et la suppression des fichiers redeviennent possibles." onCloseAutoFocus={restoreFocus}
        footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Annuler</Button><Button disabled={busy} onClick={() => void release()}>{busy ? "Levée…" : "Lever le blocage"}</Button></>}>
        <p className="text-[13px]"><strong>{retentionHoldTypeLabels[hold.holdType]}</strong> · posé le {dateFr(hold.startedAt)}</p>
        {error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}

export function AddHoldDialog({ customerId, onClose, restoreFocus }: DialogProps & { customerId: string }) {
  const refresh = usePrivacyRefresh();
  const [holdType, setHoldType] = useState<RetentionHoldType>("legal"), [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [reasonError, setReasonError] = useState<string | undefined>(undefined);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < RETENTION_HOLD_REASON_MIN) return setReasonError(`Le motif doit faire au moins ${RETENTION_HOLD_REASON_MIN} caractères.`);
    setBusy(true); setError(null);
    try {
      await privacyApi.createHold({ scopeType: "customer", scopeId: customerId, holdType, reason: reason.trim() });
      await refresh();
      toast.success("Blocage ajouté.");
      onClose();
    } catch (failure) {
      setError(privacyErrorMessage(failure));
    } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent title="Ajouter un blocage de conservation" description="Tant qu'il est actif, le client ne peut pas être anonymisé et ses fichiers ne sont pas supprimés." onCloseAutoFocus={restoreFocus}
        footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Annuler</Button><Button type="submit" form="add-hold-form" disabled={busy}>{busy ? "Ajout…" : "Ajouter"}</Button></>}>
        <form id="add-hold-form" noValidate onSubmit={(e) => void add(e)}>
          <fieldset disabled={busy} className="flex flex-col gap-4">
            <Field label="Type">
              {(p) => (
                <NativeSelect {...p} value={holdType} onChange={(e) => setHoldType(e.target.value as RetentionHoldType)}>
                  {retentionHoldTypes.map((t) => <option key={t} value={t}>{retentionHoldTypeLabels[t]}</option>)}
                </NativeSelect>
              )}
            </Field>
            <Field label="Motif" hint={`${reason.length} / ${RETENTION_HOLD_REASON_MAX} caractères`} error={reasonError}>
              {(p) => <Textarea {...p} required rows={3} maxLength={RETENTION_HOLD_REASON_MAX} value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(undefined); }} />}
            </Field>
            {error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
