import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink } from "react-router";
import { toast } from "sonner";
import { MessageSquarePlus, MoreHorizontal } from "lucide-react";
import { followUpTypes, type FollowUp, type FollowUpDetail, type FollowUpResponse, type FollowUpType } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, Textarea } from "../../components/ui/input.js";
import { Field } from "../../components/ui/field.js";
import { Card, CardHeader, CardTitle } from "../../components/ui/card.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { Pill, StatusPill } from "../../components/ui/status-pill.js";
import { Dialog, DialogContent, Sheet, SheetContent } from "../../components/ui/dialog.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu.js";
import { cn } from "../../lib/utils.js";
import { cadenceState, followUpStatus, overdueLabel } from "../../lib/status-map.js";
import { dateTimeFr, fromLocalInput, shortDateFr, toLocalInput } from "../../lib/format.js";
import { focusReturnTarget } from "../../lib/focus.js";
import { followUpsApi, followUpErrorMessage } from "../../follow-ups/api/follow-ups-api.js";
import { activityTypes, followUpTypeLabels } from "../../follow-ups/components/follow-up-labels.js";

/**
 * « Suivis » tab (board 14b, UX-14a). Rules unchanged from S4.4: cadence counts active time only,
 * a follow-up resets it, an open next action keeps its own due date. Wording « rythme » (Fred 2026-10-23).
 */
const rhythmSource: Record<string, string> = { override: "propre à cet abonnement", variant: "règle de l'option", service: "règle du service", none: "aucun rythme configuré" };

export function FollowUpsTab({ subscriptionId, openRecord = false, onRecordOpened }: { subscriptionId: string; openRecord?: boolean; onRecordOpened?: () => void }) {
  const client = useQueryClient(), key = ["follow-ups", subscriptionId] as const;
  const query = useQuery({ queryKey: key, queryFn: () => followUpsApi.list(subscriptionId), refetchInterval: 30000 });
  const [recording, setRecording] = useState(false);
  const [dialog, setDialog] = useState<{ kind: "rhythm" } | { kind: "cancel"; row: FollowUp } | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  // « Enregistrer le suivi » from the Suivis page or Aujourd'hui opens the form directly (Fred 2026-10-23).
  const canRecord = query.data?.detail.subscriptionStatus === "active";
  useEffect(() => {
    if (openRecord && canRecord) { setRecording(true); onRecordOpened?.(); }
  }, [openRecord, canRecord, onRecordOpened]);

  const apply = async (result: FollowUpResponse) => {
    client.setQueryData(key, result);
    await client.invalidateQueries({ queryKey: ["follow-up-queue"] });
  };
  function remember() { opener.current = focusReturnTarget(); }
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
  };

  async function complete(row: FollowUp) {
    setCompleting(row.id);
    try {
      await apply(await followUpsApi.complete(row.id));
      toast.success("Action terminée.");
    } catch (failure) {
      toast.error(followUpErrorMessage(failure));
      await query.refetch();
    } finally {
      setCompleting(null);
    }
  }

  if (query.isPending) return <p role="status" className="text-sm text-muted-foreground">Chargement des suivis…</p>;
  if (query.isError) return <EmptyState title="Suivis indisponibles" description={followUpErrorMessage(query.error)} action={<Button variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button>} />;

  const view = query.data.detail, cadence = view.cadence;
  const editableRhythm = view.subscriptionStatus === "active" || view.subscriptionStatus === "paused";
  const open = view.followUps.filter((f) => f.status === "open").sort((a, b) => Date.parse(a.nextActionAt ?? a.occurredAt) - Date.parse(b.nextActionAt ?? b.occurredAt));
  const history = [...view.followUps].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const state = cadence.monitoringDisabled ? { label: "Suivi désactivé", tone: "neutral" as const }
    : cadence.clockFrozen ? { label: "En pause", tone: "neutral" as const }
    : cadence.cadenceState === "overdue" ? { label: overdueLabel(cadence.overdueByDays), tone: "danger" as const }
    : cadence.cadenceState ? cadenceState[cadence.cadenceState] : { label: "Non applicable", tone: "neutral" as const };

  return (
    <section aria-labelledby="follow-ups-title" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 basis-full flex-col gap-0.5 sm:basis-auto">
          <h2 id="follow-ups-title" className="text-xl font-extrabold tracking-tight">Suivis</h2>
          <p className="text-[13px] text-muted-foreground">Le rythme compte en temps actif : une pause ne le consomme pas.</p>
        </div>
        <Button asChild variant="ghost"><NavLink to="/admin/suivis">File des suivis</NavLink></Button>
        <Button disabled={!canRecord} onClick={() => { remember(); setRecording(true); }}>
          <MessageSquarePlus aria-hidden="true" />
          Enregistrer un suivi
        </Button>
      </div>
      {!canRecord ? <p role="note" className="rounded-xl border border-border bg-muted p-4 text-[13px]">Un suivi s'enregistre seulement sur un abonnement actif. L'historique reste consultable.</p> : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="gap-1 p-5">
            <CardHeader className="items-center">
              <CardTitle className="text-[15px]">Actions à faire</CardTitle>
              <span className="text-[13px] text-muted-foreground">{open.length} ouverte{open.length > 1 ? "s" : ""}</span>
            </CardHeader>
            {open.length === 0 ? <p className="py-3 text-sm text-muted-foreground">Aucune action ouverte.</p> : (
              <ul className="flex flex-col divide-y divide-border-subtle">
                {open.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
                      <p className="whitespace-pre-wrap break-words text-sm font-bold">{row.nextAction}</p>
                      <p className="text-[13px] text-muted-foreground">Prévu le {dateTimeFr(row.nextActionAt)} · {followUpTypeLabels[row.followUpType].toLowerCase()} du {shortDateFr(row.occurredAt)}</p>
                    </div>
                    <StatusPill size="sm" status={followUpStatus[row.effectiveStatus]} />
                    <Button size="sm" variant="secondary" disabled={completing === row.id} onClick={() => void complete(row)}>Terminer</Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost" aria-label={`Plus d'actions sur « ${row.nextAction ?? ""} »`}><MoreHorizontal aria-hidden="true" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem destructive onSelect={() => { remember(); setDialog({ kind: "cancel", row }); }}>Annuler l'action</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="gap-3 p-5">
            <CardTitle className="text-[15px]">Historique</CardTitle>
            {history.length === 0 ? <p className="text-sm text-muted-foreground">Aucun suivi enregistré.</p> : (
              <ol className="flex flex-col">
                {history.map((row, index) => (
                  <li key={row.id} className="flex gap-3">
                    <span aria-hidden="true" className="flex flex-col items-center">
                      <span className={cn("mt-1.5 size-2.5 rounded-full", row.status === "cancelled" ? "bg-border" : "bg-primary")} />
                      {index < history.length - 1 ? <span className="w-0.5 flex-1 bg-border" /> : null}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1 pb-4">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                        {followUpTypeLabels[row.followUpType]}
                        {row.status !== "open" ? <StatusPill size="sm" status={followUpStatus[row.effectiveStatus]} /> : null}
                      </p>
                      <p className="text-[13px] text-muted-foreground">{dateTimeFr(row.occurredAt)}</p>
                      {row.note ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{row.note}</p> : null}
                      {row.nextAction ? <p className="whitespace-pre-wrap break-words text-[13px]"><span className="font-semibold">Prochaine action :</span> {row.nextAction} · {dateTimeFr(row.nextActionAt)}</p> : null}
                      {row.events.some((e) => e.reason) ? <p className="text-[13px] text-muted-foreground">Motif d'annulation : {row.events.find((e) => e.reason)?.reason}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <Card className="gap-3 p-5">
          <CardHeader className="items-center">
            <CardTitle className="text-[15px]">Rythme de suivi</CardTitle>
            <StatusPill status={state} />
          </CardHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Rythme</dt>
            <dd className="font-semibold">{cadence.effectiveCadenceDays === null ? "Non configuré" : `Tous les ${cadence.effectiveCadenceDays} jours`}<span className="block text-xs font-normal text-muted-foreground">{rhythmSource[cadence.cadenceSource]}</span></dd>
            <dt className="text-muted-foreground">Dernier contact</dt>
            <dd className="font-semibold">{shortDateFr(cadence.latestMeaningfulActivityAt)}{cadence.latestActivityType ? <span className="block text-xs font-normal text-muted-foreground">{activityTypes[cadence.latestActivityType]}</span> : null}</dd>
            <dt className="text-muted-foreground">Suivi attendu</dt>
            <dd className="font-semibold">{shortDateFr(cadence.nextFollowUpDueAt)}</dd>
          </dl>
          {cadence.clockFrozen ? <p className="text-xs text-muted-foreground">Pendant la pause, le délai ne s'écoule pas. Les prochaines actions gardent leur propre date.</p> : null}
          {editableRhythm ? <Button size="sm" variant="secondary" className="self-start" onClick={() => { remember(); setDialog({ kind: "rhythm" }); }}>Modifier le rythme</Button> : null}
          <p className="text-xs text-muted-foreground">Les rendez-vous terminés et les suivis enregistrés comptent comme contact. Calcul au {dateTimeFr(view.asOf)}.</p>
        </Card>
      </div>

      {recording ? <RecordSheet subscriptionId={subscriptionId} onClose={() => setRecording(false)} onSaved={apply} restoreFocus={restoreFocus} /> : null}
      {dialog ? <FollowUpDialog dialog={dialog} view={view} subscriptionId={subscriptionId} onClose={() => setDialog(null)} onSaved={apply} restoreFocus={restoreFocus} /> : null}
    </section>
  );
}

type RecordProps = { subscriptionId: string; onClose: () => void; onSaved: (r: FollowUpResponse) => Promise<void>; restoreFocus: (e: Event) => void };

function RecordSheet({ subscriptionId, onClose, onSaved, restoreFocus }: RecordProps) {
  const [type, setType] = useState<FollowUpType>("check_in");
  const [occurred, setOccurred] = useState(() => toLocalInput(new Date()));
  const [note, setNote] = useState(""), [hasAction, setHasAction] = useState(false), [action, setAction] = useState(""), [actionAt, setActionAt] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const occurredAt = fromLocalInput(occurred), nextActionAt = hasAction ? fromLocalInput(actionAt) : null;
    if (!occurredAt || (hasAction && (!nextActionAt || !action.trim()))) return setError("Renseigne la date de l'échange et, si besoin, la prochaine action et sa date.");
    setBusy(true);
    setError(null);
    try {
      await onSaved(await followUpsApi.create(subscriptionId, { followUpType: type, occurredAt, ...(note.trim() ? { note: note.trim() } : {}), ...(hasAction && nextActionAt ? { nextAction: action.trim(), nextActionAt } : {}) }));
      toast.success("Suivi enregistré.");
      onClose();
    } catch (failure) {
      setError(followUpErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <SheetContent
        title="Enregistrer un suivi"
        description="Heure de Libreville. Le suivi remet le rythme à zéro."
        onCloseAutoFocus={restoreFocus}
        footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Annuler</Button><Button type="submit" form="follow-up-form" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</Button></>}
      >
        <form id="follow-up-form" onSubmit={submit}>
          <fieldset disabled={busy} className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="pb-2 text-[13px] font-semibold">Type de suivi</legend>
              <div className="flex flex-wrap gap-1.5">
                {followUpTypes.map((t) => (
                  <label key={t} className={cn("relative inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-[13px] font-bold focus-within:ring-2 focus-within:ring-ring", type === t ? "border-[1.5px] border-primary bg-brand-50 text-primary" : "border-input bg-card hover:bg-muted")}>
                    <input type="radio" name="follow-up-type" className="sr-only" checked={type === t} onChange={() => setType(t)} />
                    {followUpTypeLabels[t]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Date et heure de l'échange">{(p) => <Input {...p} required type="datetime-local" value={occurred} onChange={(e) => setOccurred(e.target.value)} />}</Field>
            <Field label="Note" optionalHint="(facultatif)">{(p) => <Textarea {...p} rows={4} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
            <label className="flex items-center gap-2.5 text-sm font-semibold">
              <input type="checkbox" className="size-4" checked={hasAction} onChange={(e) => setHasAction(e.target.checked)} />
              Prévoir une prochaine action
            </label>
            {hasAction ? (
              <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
                <Field label="Prochaine action">{(p) => <Input {...p} required maxLength={2000} value={action} onChange={(e) => setAction(e.target.value)} />}</Field>
                <Field label="Pour le">{(p) => <Input {...p} required type="datetime-local" value={actionAt} onChange={(e) => setActionAt(e.target.value)} />}</Field>
              </div>
            ) : null}
            <p className="text-[13px] text-muted-foreground">Sans prochaine action, le suivi est terminé à la date de l'échange.</p>
            {error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
          </fieldset>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type DialogProps = {
  dialog: { kind: "rhythm" } | { kind: "cancel"; row: FollowUp };
  view: FollowUpDetail;
  subscriptionId: string;
  onClose: () => void;
  onSaved: (r: FollowUpResponse) => Promise<void>;
  restoreFocus: (e: Event) => void;
};

function FollowUpDialog({ dialog, view, subscriptionId, onClose, onSaved, restoreFocus }: DialogProps) {
  const [days, setDays] = useState(String(view.frequencyDaysOverride ?? view.cadence.effectiveCadenceDays ?? ""));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);

  async function run(operation: () => Promise<FollowUpResponse>, success: string) {
    setBusy(true);
    setError(null);
    try {
      await onSaved(await operation());
      toast.success(success);
      onClose();
    } catch (failure) {
      setError(followUpErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (dialog.kind === "rhythm") {
      const n = Number(days);
      if (!Number.isInteger(n) || n <= 0) return setError("Saisis un nombre entier de jours, au moins 1.");
      void run(() => followUpsApi.cadence(subscriptionId, n), "Rythme enregistré pour cet abonnement.");
    } else {
      if (!reason.trim()) return setError("Le motif est obligatoire.");
      void run(() => followUpsApi.cancel(dialog.row.id, reason.trim()), "Action annulée.");
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent
        title={dialog.kind === "rhythm" ? "Modifier le rythme" : "Annuler l'action"}
        description={dialog.kind === "rhythm" ? "Un rythme propre à cet abonnement remplace la règle du service. L'échéance est recalculée depuis le dernier contact." : dialog.row.nextAction ?? undefined}
        onCloseAutoFocus={restoreFocus}
      >
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="flex flex-col gap-4">
            {dialog.kind === "rhythm" ? (
              <>
                <Field label="Un suivi tous les… (jours)">{(p) => <Input {...p} required type="number" min={1} step={1} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />}</Field>
                {view.frequencyDaysOverride !== null ? (
                  <Button type="button" variant="ghost" className="self-start" onClick={() => void run(() => followUpsApi.cadence(subscriptionId, null), "Retour au rythme du service.")}>Revenir au rythme du service</Button>
                ) : <Pill size="sm" tone="neutral" className="self-start">Actuellement : {rhythmSource[view.cadence.cadenceSource]}</Pill>}
              </>
            ) : (
              <Field label="Motif">{(p) => <Textarea {...p} required rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
            )}
            {error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>Retour</Button>
              <Button type="submit" variant={dialog.kind === "cancel" ? "destructive-solid" : "default"}>{busy ? "Enregistrement…" : dialog.kind === "rhythm" ? "Enregistrer" : "Annuler l'action"}</Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
