import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Minus, MoreHorizontal, TriangleAlert } from "lucide-react";
import type {
  OnboardingItem,
  OnboardingOwner,
  OnboardingResponse,
} from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, Textarea } from "../../components/ui/input.js";
import { Field } from "../../components/ui/field.js";
import { Card, CardTitle } from "../../components/ui/card.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.js";
import type { StatusDescriptor } from "../../lib/status-map.js";
import { cn } from "../../lib/utils.js";
import {
  dateFr,
  dateTimeFr,
  fromLocalInput,
  toLocalInput,
} from "../../lib/format.js";
import { focusReturnTarget } from "../../lib/focus.js";
import {
  onboardingApi,
  onboardingErrorMessage,
} from "../../onboarding/api/onboarding-api.js";
import { isOnboardingEditable } from "./editable.js";

/**
 * « Préparation » tab (board 14c, UX-14b). Rules unchanged from S4.2: blocking items and the capacity
 * reservation gate « Prêt à démarrer »; a waiver needs a reason; consents and questionnaire are done in Santé.
 */

const owners: Record<OnboardingOwner, string> = {
  system: "Automatique",
  coach: "Coach",
  consent: "Conditions",
  questionnaire: "Questionnaire",
  medical: "Validation médicale",
  external: "Parcours dédié",
};
const itemStatus: Record<string, StatusDescriptor> = {
  pending: { label: "À compléter", tone: "warning" },
  blocked: { label: "Bloquant", tone: "danger" },
  completed: { label: "Complété", tone: "success" },
  waived: { label: "Dispensé", tone: "neutral" },
  not_applicable: { label: "Non applicable", tone: "neutral" },
};
const done = (i: OnboardingItem) =>
  i.status === "completed" ||
  i.status === "waived" ||
  i.status === "not_applicable";

type Dialogs =
  | { kind: "waive"; item: OnboardingItem }
  | { kind: "reserve" }
  | { kind: "ready" };

export function PreparationTab({
  subscriptionId,
  openHealth,
}: {
  subscriptionId: string;
  openHealth: () => void;
}) {
  const client = useQueryClient(),
    key = ["onboarding", subscriptionId] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => onboardingApi.get(subscriptionId),
    refetchInterval: 30_000,
  });
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const apply = async (r: OnboardingResponse) => {
    client.setQueryData(key, r);
    await Promise.allSettled([
      client.invalidateQueries({ queryKey: ["customers", "detail"] }),
      client.invalidateQueries({
        queryKey: ["subscription-lifecycle", subscriptionId],
      }),
    ]);
  };
  async function quick(
    id: string,
    operation: () => Promise<OnboardingResponse>,
    success: string,
  ) {
    setBusyItem(id);
    try {
      await apply(await operation());
      toast.success(success);
    } catch (failure) {
      toast.error(onboardingErrorMessage(failure));
      await query.refetch();
    } finally {
      setBusyItem(null);
    }
  }
  function open(next: Dialogs) {
    opener.current = focusReturnTarget();
    setDialog(next);
  }
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
  };

  if (query.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Chargement de la préparation…
      </p>
    );
  if (query.isError)
    return (
      <EmptyState
        title="Préparation indisponible"
        description={onboardingErrorMessage(query.error)}
        action={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Réessayer
          </Button>
        }
      />
    );

  const view = query.data.onboarding,
    editable = isOnboardingEditable(view.subscription.status);
  const items = view.items,
    completed = items.filter(done).length;
  const blocking = items.filter((i) => i.isBlocking && !done(i));
  const reservable = ["onboarding", "ready_to_start"].includes(
    view.subscription.status,
  );

  return (
    <section
      aria-labelledby="preparation-title"
      className="flex flex-col gap-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 basis-full flex-col gap-0.5 sm:basis-auto">
          <h2
            id="preparation-title"
            className="text-xl font-extrabold tracking-tight"
          >
            Préparation
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Toutes les exigences bloquantes et la place réservée doivent être
            validées avant le démarrage.
          </p>
        </div>
        {editable || view.subscription.status === "ready_to_start" ? (
          <Button
            disabled={
              !view.canReady || view.subscription.status === "ready_to_start"
            }
            onClick={() => open({ kind: "ready" })}
          >
            {view.subscription.status === "ready_to_start"
              ? "Prête à démarrer"
              : "Confirmer « Prêt à démarrer »"}
          </Button>
        ) : null}
      </div>

      {view.initialized && items.length > 0 ? (
        view.onboardingState === "stalled" ? (
          <Banner
            tone="danger"
            title="Réservation expirée - préparation arrêtée"
            text="L'abonnement garde son état. Prolonge ou reconfirme la réservation pour reprendre."
          />
        ) : blocking.length > 0 ? (
          <Banner
            tone="warning"
            title={`${blocking.length} exigence${blocking.length > 1 ? "s" : ""} bloquante${blocking.length > 1 ? "s" : ""} restante${blocking.length > 1 ? "s" : ""}`}
            text={blocking.map((i) => i.label).join(" · ")}
            progress={{ done: completed, total: items.length }}
          />
        ) : (
          <Banner
            tone="success"
            title="Exigences satisfaites"
            text={
              view.capacity.mode === "limited" && !view.capacity.valid
                ? "Il reste à réserver ou prolonger la place."
                : "Tu peux confirmer « Prêt à démarrer »."
            }
            progress={{ done: completed, total: items.length }}
          />
        )
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="gap-1 p-5">
          <CardTitle className="pb-1 text-[15px]">Checklist</CardTitle>
          {!view.initialized ? (
            <div className="flex flex-col items-start gap-3 py-3">
              <p className="text-sm text-muted-foreground">
                Prépare la checklist pour afficher les exigences de cet
                abonnement (service, option, questionnaire).
              </p>
              {editable ? (
                <Button
                  onClick={() =>
                    void quick(
                      "init",
                      () => onboardingApi.initialize(subscriptionId),
                      "Checklist préparée.",
                    )
                  }
                  disabled={busyItem === "init"}
                >
                  Préparer la checklist
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {items.map((i) => {
                const status = itemStatus[i.status] ?? {
                  label: "À vérifier",
                  tone: "neutral" as const,
                };
                const inHealth =
                  i.owner === "consent" || i.owner === "questionnaire";
                return (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-center gap-3 py-3"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full",
                        done(i)
                          ? i.status === "completed"
                            ? "bg-success-soft text-success"
                            : "bg-neutral-soft text-neutral"
                          : i.isBlocking
                            ? "bg-danger-soft text-danger"
                            : "bg-warning-soft text-warning",
                      )}
                    >
                      {i.status === "completed" ? (
                        <Check className="size-4" />
                      ) : done(i) ? (
                        <Minus className="size-4" />
                      ) : (
                        <TriangleAlert className="size-3.5" />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-1 basis-52 flex-col gap-0.5">
                      <p className="text-sm font-bold">{i.label}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {[
                          owners[i.owner],
                          i.isBlocking ? "bloquant" : "facultatif",
                          i.completedAt
                            ? `complété le ${dateFr(i.completedAt)}`
                            : null,
                          i.waivedAt
                            ? `dispensé le ${dateFr(i.waivedAt)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {i.waiverReason ? (
                        <p className="whitespace-pre-wrap break-words text-[13px]">
                          Motif : {i.waiverReason}
                        </p>
                      ) : null}
                    </div>
                    <StatusPill size="sm" status={status} />
                    {i.canComplete ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyItem === i.id}
                        onClick={() =>
                          void quick(
                            i.id,
                            () => onboardingApi.complete(subscriptionId, i.id),
                            "Exigence complétée.",
                          )
                        }
                      >
                        Confirmer
                      </Button>
                    ) : inHealth && !done(i) ? (
                      <Button size="sm" variant="ghost" onClick={openHealth}>
                        Ouvrir Santé et consentements
                      </Button>
                    ) : null}
                    {i.canWaive ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Plus d'actions sur « ${i.label} »`}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onSelect={() => open({ kind: "waive", item: i })}
                          >
                            Accorder une dispense
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="size-8" aria-hidden="true" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="gap-3 p-5">
          <CardTitle className="text-[15px]">Place réservée</CardTitle>
          {view.capacity.mode === "unlimited" ? (
            <p className="text-sm text-muted-foreground">
              Service sans limite de places : aucune réservation nécessaire.
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Jusqu'au</dt>
                <dd
                  className={cn(
                    "font-semibold",
                    view.capacity.expired && "text-danger",
                  )}
                >
                  {view.subscription.capacityReservedUntil
                    ? dateTimeFr(view.subscription.capacityReservedUntil)
                    : "Pas encore réservée"}
                  {view.capacity.expired ? " · expirée" : ""}
                </dd>
                <dt className="text-muted-foreground">Occupation</dt>
                <dd className="font-semibold">
                  {view.capacity.occupied} sur {view.capacity.limit} places
                  <span className="block text-xs font-normal text-muted-foreground">
                    {view.capacity.scope === "variant"
                      ? "pour cette option"
                      : "pour ce service"}
                    , hors cet abonnement
                  </span>
                </dd>
              </dl>
              {reservable ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="self-start"
                  onClick={() => open({ kind: "reserve" })}
                >
                  {view.subscription.capacityReservedUntil
                    ? "Prolonger la réservation"
                    : "Réserver la place"}
                </Button>
              ) : null}
            </>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 border-t border-border-subtle pt-3 text-sm">
            <dt className="text-muted-foreground">Début prévu</dt>
            <dd className="font-semibold">
              {view.subscription.plannedStartDate
                ? dateFr(view.subscription.plannedStartDate)
                : "Non défini"}
            </dd>
          </dl>
          <p className="text-xs text-muted-foreground">
            Échéance dépassée : la préparation s'arrête et l'abonnement garde
            son état ; prolonger ou reconfirmer pour reprendre.
          </p>
        </Card>
      </div>

      {dialog ? (
        <PreparationDialog
          key={dialog.kind}
          dialog={dialog}
          subscriptionId={subscriptionId}
          reservedUntil={view.subscription.capacityReservedUntil}
          onClose={() => setDialog(null)}
          onSaved={apply}
          restoreFocus={restoreFocus}
        />
      ) : null}
    </section>
  );
}

function Banner({
  tone,
  title,
  text,
  progress,
}: {
  tone: "warning" | "danger" | "success";
  title: string;
  text: string;
  progress?: { done: number; total: number };
}) {
  const styles = {
    warning: "border-warning/40 bg-warning-soft text-warning",
    danger: "border-danger/30 bg-danger-soft text-danger",
    success: "border-success/30 bg-success-soft text-success",
  }[tone];
  const bar = {
    warning: "bg-warning",
    danger: "bg-danger",
    success: "bg-success",
  }[tone];
  return (
    <section
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-xl border p-4",
        styles,
      )}
    >
      <div className="flex min-w-0 flex-1 basis-72 flex-col gap-0.5">
        <p className="text-[15px] font-extrabold">{title}</p>
        <p className="text-[13px] text-foreground">{text}</p>
      </div>
      {progress ? (
        <div className="flex w-56 max-w-full flex-col gap-1.5">
          <span className="text-xs font-bold">
            {progress.done} sur {progress.total} complétées
          </span>
          <span
            className="block h-2 overflow-hidden rounded-full bg-card"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-label="Avancement de la checklist"
          >
            <span
              className={cn("block h-2 rounded-full", bar)}
              style={{
                width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`,
              }}
            />
          </span>
        </div>
      ) : null}
    </section>
  );
}

type DialogProps = {
  dialog: Dialogs;
  subscriptionId: string;
  reservedUntil: string | null;
  onClose: () => void;
  onSaved: (r: OnboardingResponse) => Promise<void>;
  restoreFocus: (e: Event) => void;
};

function PreparationDialog({
  dialog,
  subscriptionId,
  reservedUntil,
  onClose,
  onSaved,
  restoreFocus,
}: DialogProps) {
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState(() =>
    toLocalInput(
      new Date(
        Math.max(Date.parse(reservedUntil ?? "") || 0, Date.now()) +
          7 * 86_400_000,
      ),
    ),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    let run: () => Promise<OnboardingResponse>, success: string;
    if (dialog.kind === "waive") {
      if (!reason.trim()) return setError("Le motif est obligatoire.");
      run = () =>
        onboardingApi.waive(subscriptionId, dialog.item.id, reason.trim());
      success = "Dispense enregistrée.";
    } else if (dialog.kind === "reserve") {
      const iso = fromLocalInput(until);
      if (!iso || Date.parse(iso) <= Date.now())
        return setError("Choisis une échéance future.");
      run = () => onboardingApi.reserve(subscriptionId, iso);
      success = "Réservation enregistrée.";
    } else {
      run = () => onboardingApi.ready(subscriptionId);
      success = "Abonnement prêt à démarrer.";
    }
    setBusy(true);
    setError(null);
    try {
      await onSaved(await run());
      toast.success(success);
      onClose();
    } catch (failure) {
      setError(onboardingErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const title =
    dialog.kind === "waive"
      ? "Accorder une dispense"
      : dialog.kind === "reserve"
        ? reservedUntil
          ? "Prolonger la réservation"
          : "Réserver la place"
        : "Confirmer « Prêt à démarrer »";
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent
        title={title}
        description={dialog.kind === "waive" ? dialog.item.label : undefined}
        onCloseAutoFocus={restoreFocus}
      >
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="flex flex-col gap-4">
            {dialog.kind === "waive" ? (
              <>
                <p className="text-sm">
                  L'exigence est considérée comme levée. Le motif reste dans
                  l'historique de la préparation.
                </p>
                <Field label="Motif">
                  {(p) => (
                    <Textarea
                      {...p}
                      required
                      rows={3}
                      maxLength={2000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  )}
                </Field>
              </>
            ) : null}
            {dialog.kind === "reserve" ? (
              <Field
                label="Nouvelle échéance (Libreville)"
                hint="Le serveur vérifie qu'une place est disponible."
              >
                {(p) => (
                  <Input
                    {...p}
                    required
                    type="datetime-local"
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                )}
              </Field>
            ) : null}
            {dialog.kind === "ready" ? (
              <p className="text-sm">
                Toutes les exigences bloquantes et la place sont validées.
                L'abonnement passe à « Prêt à démarrer » ; le démarrage réel
                reste une décision séparée.
              </p>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
              >
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Retour
              </Button>
              <Button type="submit">
                {busy ? "Enregistrement…" : "Confirmer"}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
