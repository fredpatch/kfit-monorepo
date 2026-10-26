import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { confirmationMatches, unarchiveReasonLabels, unarchiveReasons, type PrivacyMenu, type PrivacyMenuAction, type PrivacySubjectType, type UnarchiveReason } from "@kfit/shared";
import { authApiClient } from "../../auth/api/auth-api.js";
import { authFailureOf, authMessages, commonAuthMessage, sensitiveOtpRequestMessage } from "../../auth/api/auth-errors.js";
import { OtpCodeInput } from "../../auth/components/OtpCodeInput.js";
import { Button } from "../../components/ui/button.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
import { DropdownMenuItem, DropdownMenuSeparator } from "../../components/ui/dropdown-menu.js";
import { Field } from "../../components/ui/field.js";
import { Input } from "../../components/ui/input.js";
import { Tooltip } from "../../components/ui/tooltip.js";
import { cn } from "../../lib/utils.js";
import { focusReturnTarget } from "../../lib/focus.js";
import { privacyApi } from "../api/privacy-api.js";
import { usePrivacyRefresh } from "../api/privacy-queries.js";
import { holdActiveMessage, privacyErrorCode, privacyErrorMessage } from "../lib/privacy-error-messages.js";

type MenuLabel = { label: string; destructive: boolean };
/** S7.3b-2 D3 (customer) and D8 (prospect) wording; holds are customer-only. */
const menuLabels: Record<PrivacySubjectType, Partial<Record<PrivacyMenuAction, MenuLabel>>> = {
  customer: {
    archive: { label: "Archiver le client", destructive: false },
    unarchive: { label: "Désarchiver…", destructive: false },
    add_hold: { label: "Ajouter un blocage de conservation", destructive: false },
    anonymize: { label: "Anonymiser…", destructive: true },
  },
  prospect: {
    archive: { label: "Archiver le prospect", destructive: true },
    unarchive: { label: "Désarchiver le prospect…", destructive: false },
    anonymize: { label: "Anonymiser le prospect…", destructive: true },
  },
};
/** S7.3b-2 D3: why « Archiver le client » is disabled. */
const ARCHIVE_DISABLED_HINT = "Tous les abonnements doivent être terminés ou annulés.";

/** Privacy entries of a « ⋯ » menu, one separator between groups (and before the first when `separatorBefore`). */
export function PrivacyMenuItems({ menu, subjectType, onSelect, separatorBefore = false }: { menu: PrivacyMenu; subjectType: PrivacySubjectType; onSelect: (action: PrivacyMenuAction) => void; separatorBefore?: boolean }) {
  return menu.map((group, index) => (
    <Fragment key={index}>
      {index > 0 || separatorBefore ? <DropdownMenuSeparator /> : null}
      {group.map(({ action, enabled }) => {
        const entry = menuLabels[subjectType][action];
        if (!entry) return null;
        if (!enabled && action === "archive") {
          return (
            <Tooltip key={action} content={ARCHIVE_DISABLED_HINT} side="left">
              <span>
                <DropdownMenuItem disabled destructive={entry.destructive}>
                  {entry.label}
                  <span className="sr-only"> : {ARCHIVE_DISABLED_HINT}</span>
                </DropdownMenuItem>
              </span>
            </Tooltip>
          );
        }
        return <DropdownMenuItem key={action} disabled={!enabled} destructive={entry.destructive} onSelect={() => onSelect(action)}>{entry.label}</DropdownMenuItem>;
      })}
    </Fragment>
  ));
}

/**
 * Dialog opened from a « ⋯ » menu or a banner button. Focus returns to the opener, or to the « ⋯ » trigger when the
 * opener is gone after the change (banner removed by unarchive, hold row removed by release).
 */
export function usePrivacyDialog<T>() {
  const [dialog, setDialog] = useState<T | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  return {
    dialog,
    trigger,
    open: (next: T) => { opener.current = focusReturnTarget(); setDialog(next); },
    close: () => setDialog(null),
    restoreFocus: (event: Event) => {
      event.preventDefault();
      (opener.current?.isConnected ? opener.current : trigger.current)?.focus();
    },
  };
}

type SubjectProps = { subjectType: PrivacySubjectType; subjectId: string; name: string; onClose: () => void; restoreFocus: (event: Event) => void };
const subjectNoun = (subjectType: PrivacySubjectType) => (subjectType === "customer" ? "client" : "prospect");
const ErrorBox = ({ message }: { message: string | null }) => (message ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{message}</p> : null);

/** S7.3b-2 D3 (customer) / D8 (prospect). */
export function ArchiveDialog({ subjectType, subjectId, name, onClose, restoreFocus }: SubjectProps) {
  const refresh = usePrivacyRefresh();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  async function archive() {
    setBusy(true); setError(null);
    try {
      await privacyApi.archive(subjectType, subjectId);
      await refresh();
      toast.success(subjectType === "customer" ? "Client archivé." : "Prospect archivé.");
      onClose();
    } catch (failure) {
      setError(privacyErrorMessage(failure, subjectType));
      await refresh();
    } finally { setBusy(false); }
  }
  const effect = subjectType === "customer"
    ? "La fiche passe en lecture seule et les liens publics envoyés au client sont désactivés. Tu pourras la désarchiver."
    : "Ses demandes passent en lecture seule et les liens publics envoyés au prospect sont désactivés. Tu pourras le désarchiver.";
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent title={`Archiver ${name} ?`} description={effect} onCloseAutoFocus={restoreFocus}
        footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Annuler</Button><Button disabled={busy} onClick={() => void archive()}>{busy ? "Archivage…" : "Archiver"}</Button></>}>
        <ErrorBox message={error} />
      </DialogContent>
    </Dialog>
  );
}

/** S7.3b-2 D4: a reason is required, none is preselected; revoked links stay revoked (ARCH-01 D6). */
export function UnarchiveDialog({ subjectType, subjectId, name, onClose, restoreFocus }: SubjectProps) {
  const refresh = usePrivacyRefresh();
  const [reason, setReason] = useState<UnarchiveReason | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  async function unarchive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason) return;
    setBusy(true); setError(null);
    try {
      await privacyApi.unarchive(subjectType, subjectId, reason);
      await refresh();
      toast.success(subjectType === "customer" ? "Client désarchivé." : "Prospect désarchivé.");
      onClose();
    } catch (failure) {
      setError(privacyErrorMessage(failure, subjectType));
      await refresh();
    } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent title={`Désarchiver ${name}`} onCloseAutoFocus={restoreFocus}
        footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Annuler</Button><Button type="submit" form="unarchive-form" disabled={busy || !reason}>{busy ? "Désarchivage…" : "Désarchiver"}</Button></>}>
        <form id="unarchive-form" noValidate onSubmit={(e) => void unarchive(e)} className="flex flex-col gap-4">
          <fieldset disabled={busy} className="flex flex-col gap-2">
            <legend className="pb-2 text-[13px] font-semibold">Motif</legend>
            {unarchiveReasons.map((r) => (
              <label key={r} className={cn("flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border px-3 text-sm font-semibold focus-within:ring-2 focus-within:ring-ring", reason === r ? "border-primary bg-brand-50" : "border-input bg-card hover:bg-muted")}>
                <input type="radio" name="unarchive-reason" required value={r} checked={reason === r} onChange={() => setReason(r)} className="size-4 accent-primary" />
                {unarchiveReasonLabels[r]}
              </label>
            ))}
          </fieldset>
          <p className="rounded-lg bg-muted p-3 text-[13px] text-muted-foreground">Les liens publics désactivés ne sont pas rétablis.</p>
          <ErrorBox message={error} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

type AnonymizeStep = { kind: "name" } | { kind: "otp"; sent: boolean };

/**
 * S7.3b-2 D5. Follows the server order: fresh code (403) → name (400) → hold (409). The typed name lives only in this
 * component's state: never stored, never logged, gone when the dialog closes.
 */
export function AnonymizeDialog({ subjectType, subjectId, name, activeHolds, onClose, restoreFocus }: SubjectProps & { activeHolds: number }) {
  const refresh = usePrivacyRefresh();
  const [step, setStep] = useState<AnonymizeStep>({ kind: "name" });
  const [typed, setTyped] = useState(""), [code, setCode] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [nameError, setNameError] = useState<string | null>(null);
  const [holdRefused, setHoldRefused] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const held = activeHolds > 0 || holdRefused;
  const matches = confirmationMatches(typed, name);
  const noun = subjectNoun(subjectType);

  useEffect(() => { if (step.kind === "name" && nameError) nameInput.current?.focus(); }, [step.kind, nameError]);

  async function anonymize() {
    setBusy(true); setError(null); setNameError(null);
    try {
      await privacyApi.anonymize(subjectType, subjectId, typed);
      await refresh();
      toast.success(subjectType === "customer" ? "Client anonymisé." : "Prospect anonymisé.");
      onClose();
      return;
    } catch (failure) {
      const failureCode = privacyErrorCode(failure);
      if (failureCode === "AUTH_FRESH_OTP_REQUIRED") { setBusy(false); await send(); return; }
      if (failureCode === "PRIVACY_CONFIRMATION_MISMATCH") { setStep({ kind: "name" }); setNameError(privacyErrorMessage(failure, subjectType)); }
      else if (failureCode === "PRIVACY_RETENTION_HOLD_ACTIVE") { setStep({ kind: "name" }); setHoldRefused(true); await refresh(); }
      else { setError(privacyErrorMessage(failure, subjectType)); await refresh(); }
    }
    setBusy(false);
  }
  async function send() {
    setBusy(true); setError(null); setStep({ kind: "otp", sent: false });
    try { await authApiClient.requestSensitiveActionOtp(); setStep({ kind: "otp", sent: true }); }
    catch (failure) { setError(sensitiveOtpRequestMessage(authFailureOf(failure))); }
    finally { setBusy(false); }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6) return setError("Saisis les 6 chiffres du code.");
    setBusy(true); setError(null);
    try {
      await authApiClient.verifySensitiveActionOtp(code);
      setCode("");
    } catch (failure) {
      const f = authFailureOf(failure);
      setError(f.code === "AUTH_OTP_REJECTED" || f.code === "AUTH_OTP_CODE_INVALID_FORMAT" || f.status === 400 || f.status === 410 ? authMessages.codeInvalid : commonAuthMessage(f));
      setCode(""); setBusy(false);
      return;
    }
    await anonymize();
  }
  function submitName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!held && matches) void anonymize();
  }

  const warning = subjectType === "customer"
    ? "Cette action est irréversible. L'identité et les données de santé de ce client seront effacées ; les paiements, devis et reçus sont conservés."
    : "Cette action est irréversible. L'identité de ce prospect sera effacée.";
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent title={`Anonymiser ${name}`} className="max-h-[90dvh] max-w-lg overflow-y-auto" onCloseAutoFocus={restoreFocus}>
        <div className="flex flex-col gap-4">
          <p className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{warning}</p>
          {held ? <p role="alert" className="rounded-lg bg-warning-soft p-3 text-sm">{holdActiveMessage(subjectType)}</p> : null}
          {step.kind === "name" ? (
            <form id="anonymize-form" noValidate onSubmit={submitName}>
              <Field label={<>Saisis le nom <strong>{name}</strong> pour confirmer</>} error={nameError ?? undefined}>
                {(control) => (
                  <Input {...control} ref={nameInput} autoFocus autoComplete="off" spellCheck={false} data-1p-ignore data-lpignore="true" disabled={busy || held} value={typed} onChange={(e) => { setTyped(e.target.value); setNameError(null); }} />
                )}
              </Field>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3 rounded-xl bg-muted p-4">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm">{step.sent ? "Code envoyé à ton adresse e-mail. " : ""}L'anonymisation demande de confirmer ton identité avec le code à 6 chiffres reçu par e-mail.</p>
              </div>
              {step.sent ? (
                <form noValidate onSubmit={(e) => void verify(e)} className="flex flex-col gap-3">
                  <Field label="Code de vérification" hint="Le code expire dans quelques minutes.">
                    {(control) => <OtpCodeInput {...control} autoFocus value={code} onValueChange={setCode} />}
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="destructive-solid" disabled={busy}>{busy ? "Vérification…" : "Anonymiser définitivement"}</Button>
                    <Button type="button" variant="ghost" disabled={busy} onClick={() => void send()}>Renvoyer le code</Button>
                  </div>
                </form>
              ) : (
                <Button className="self-start" disabled={busy} onClick={() => void send()}>{busy ? "Envoi…" : "Recevoir le code par e-mail"}</Button>
              )}
            </div>
          )}
          <ErrorBox message={error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={onClose}>Annuler</Button>
            {step.kind === "name" ? (
              <Button type="submit" form="anonymize-form" variant="destructive-solid" disabled={busy || held || !matches}>
                {busy ? "Anonymisation…" : "Anonymiser définitivement"}
              </Button>
            ) : null}
          </div>
          <p className="sr-only" aria-live="polite">{step.kind === "name" && !held && matches ? `Le nom du ${noun} est confirmé.` : ""}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
