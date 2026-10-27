import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, MoreHorizontal } from "lucide-react";
import {
  isAppointmentToClose,
  type AppointmentAction,
  type AppointmentDetail,
  type AppointmentListResponse,
} from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, NativeSelect, Textarea } from "../../components/ui/input.js";
import { Field } from "../../components/ui/field.js";
import { Card, CardHeader, CardTitle } from "../../components/ui/card.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import {
  Dialog,
  DialogContent,
  Sheet,
  SheetContent,
} from "../../components/ui/dialog.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.js";
import {
  appointmentStatus,
  customerAppointmentResponse,
  describeStatus,
} from "../../lib/status-map.js";
import {
  dateTimeFr,
  fromLocalInput,
  timeFr,
  toLocalInput,
} from "../../lib/format.js";
import { focusReturnTarget } from "../../lib/focus.js";
import {
  appointmentsApi,
  appointmentErrorMessage,
} from "../../appointments/api/appointments-api.js";
import { OneTimeLink } from "../payments/OneTimeLink.js";
import { SlotFields, type Slot } from "./SlotFields.js";

/**
 * « Rendez-vous » tab (board 14a, UX-14a). Commands and server rules unchanged from S4;
 * times now read and typed in Libreville time (they used the device time zone).
 */
const upcomingStates = new Set([
  "scheduled",
  "confirmed",
  "reschedule_requested",
]);
const actionLabels: Record<AppointmentAction, string> = {
  confirm: "Confirmer le rendez-vous",
  cancel: "Annuler le rendez-vous",
  reschedule: "Reporter",
  complete: "Marquer terminé",
  missed: "Marquer absente",
  "restore-component": "Restaurer la séance",
  "response-link": "Envoyer le lien de réponse",
};
const day = (iso: string) => {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Libreville",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(iso));
  const get = (t: string) =>
    parts
      .find((p) => p.type === t)
      ?.value.replace(".", "")
      .toUpperCase() ?? "";
  return { dow: get("weekday"), day: get("day"), mon: get("month") };
};
const slotLabel = (a: AppointmentDetail) =>
  `${timeFr(a.scheduledStart)} – ${timeFr(a.scheduledEnd)}`;
const linkFor = (token: string) =>
  `${window.location.origin}/appointment#${token}`;

function primaryAction(a: AppointmentDetail): AppointmentAction | null {
  const has = (x: AppointmentAction) => a.availableActions.includes(x);
  if (a.status === "reschedule_requested" && has("reschedule"))
    return "reschedule";
  if (has("complete") && Date.parse(a.scheduledStart) <= Date.now())
    return "complete";
  if (has("confirm")) return "confirm";
  if (has("response-link") && a.customerResponseStatus === "pending")
    return "response-link";
  return null;
}

type Mode = {
  appointment: AppointmentDetail;
  action: AppointmentAction | "history";
};

export function AppointmentsTab({
  subscriptionId,
}: {
  subscriptionId: string;
}) {
  const client = useQueryClient(),
    key = ["appointments", subscriptionId] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => appointmentsApi.list(subscriptionId),
  });
  const [scheduling, setScheduling] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const refresh = () =>
    Promise.allSettled([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({
        queryKey: ["subscription-lifecycle", subscriptionId],
      }),
      client.invalidateQueries({ queryKey: ["follow-ups", subscriptionId] }),
      client.invalidateQueries({ queryKey: ["follow-up-queue"] }),
    ]);
  function open(next: Mode) {
    opener.current = focusReturnTarget();
    setMode(next);
  }
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
  };

  if (query.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Chargement des rendez-vous…
      </p>
    );
  if (query.isError)
    return (
      <EmptyState
        title="Rendez-vous indisponibles"
        description={appointmentErrorMessage(query.error)}
        action={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Réessayer
          </Button>
        }
      />
    );

  const data = query.data;
  const canSchedule = data.subscriptionStatus === "active";
  const upcoming = data.appointments
    .filter((a) => upcomingStates.has(a.status))
    .sort(
      (a, b) => Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart),
    );
  const past = data.appointments
    .filter((a) => !upcomingStates.has(a.status))
    .sort(
      (a, b) => Date.parse(b.scheduledStart) - Date.parse(a.scheduledStart),
    );
  // POL-01 D8: a scheduled or confirmed appointment that has ended waits to be closed; it no longer counts as « À venir ».
  const now = new Date();
  const toClose = upcoming.filter((a) => isAppointmentToClose(a, now));
  const comingUp = upcoming.filter((a) => !isAppointmentToClose(a, now));
  const next = upcoming.find((a) => Date.parse(a.scheduledEnd) > Date.now());
  const toAnswer = upcoming.filter(
    (a) => a.status === "reschedule_requested",
  ).length;

  const tiles = [
    ...data.components
      .slice(0, 2)
      .map((c) => ({
        label: c.labelSnapshot,
        value: `${c.quantityConsumed} sur ${c.quantityEntitled}`,
        note: `séances consommées · ${Math.max(0, c.quantityEntitled - c.quantityConsumed)} restante${c.quantityEntitled - c.quantityConsumed > 1 ? "s" : ""}`,
      })),
    {
      label: "Prochain rendez-vous",
      value: next
        ? day(next.scheduledStart).dow.toLowerCase() +
          " " +
          day(next.scheduledStart).day +
          " " +
          day(next.scheduledStart).mon.toLowerCase()
        : "-",
      note: next
        ? `${timeFr(next.scheduledStart)} · ${describeStatus(customerAppointmentResponse, next.customerResponseStatus).label.toLowerCase()}`
        : "Aucun rendez-vous à venir",
    },
    {
      label: "Reports à traiter",
      value: String(toAnswer),
      note: toAnswer
        ? "la cliente attend un nouveau créneau"
        : "aucune demande en attente",
    },
  ];

  const menu = (a: AppointmentDetail, primary: AppointmentAction | null) => {
    const others = a.availableActions.filter((x) => x !== primary);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Plus d'actions sur le rendez-vous du ${dateTimeFr(a.scheduledStart)}`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {others.map((x) => (
            <DropdownMenuItem
              key={x}
              destructive={x === "cancel" || x === "missed"}
              onSelect={() => open({ appointment: a, action: x })}
            >
              {actionLabels[x]}
            </DropdownMenuItem>
          ))}
          {others.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            onSelect={() => open({ appointment: a, action: "history" })}
          >
            Historique et liens
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const upcomingRow = (a: AppointmentDetail, closing: boolean) => {
    const d = day(a.scheduledStart),
      primary = primaryAction(a);
    return (
      <li
        key={a.id}
        id={`appointment-${a.id}`}
        className="flex flex-wrap items-center gap-3 py-3.5"
      >
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg bg-muted leading-tight"
        >
          <span className="text-[11px] font-bold text-muted-foreground">
            {d.dow}
          </span>
          <span className="text-lg font-extrabold">{d.day}</span>
          <span className="text-[11px] font-bold text-muted-foreground">
            {d.mon}
          </span>
        </span>
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
          <p className="text-[15px] font-extrabold tabular-nums">
            <span className="sr-only">{dateTimeFr(a.scheduledStart)} · </span>
            {slotLabel(a)}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {[
              a.locationOrChannel ?? "Lieu à préciser",
              a.component?.labelSnapshot ?? "Sans prestation liée",
            ].join(" · ")}
          </p>
          <span className="flex flex-wrap gap-1.5">
            <StatusPill
              size="sm"
              status={
                closing
                  ? { label: "À clôturer", tone: "warning" }
                  : describeStatus(appointmentStatus, a.status)
              }
            />
            {a.customerResponseStatus !== a.status ? (
              <StatusPill
                size="sm"
                status={describeStatus(
                  customerAppointmentResponse,
                  a.customerResponseStatus,
                )}
              />
            ) : null}
          </span>
          {a.rescheduleNote ? (
            <p className="rounded-md bg-warning-soft px-2.5 py-2 text-[13px]">
              Message de la cliente : {a.rescheduleNote}
            </p>
          ) : null}
        </div>
        {primary ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => open({ appointment: a, action: primary })}
          >
            {primary === "reschedule"
              ? "Proposer un nouveau créneau"
              : actionLabels[primary]}
          </Button>
        ) : null}
        {menu(a, primary)}
      </li>
    );
  };

  return (
    <section
      aria-labelledby="appointments-title"
      className="flex flex-col gap-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 basis-full flex-col gap-0.5 sm:basis-auto">
          <h2
            id="appointments-title"
            className="text-xl font-extrabold tracking-tight"
          >
            Rendez-vous
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Heures de Libreville. Une séance n'est consommée que selon les
            règles du service.
          </p>
        </div>
        <Button
          disabled={!canSchedule}
          onClick={() => {
            opener.current = focusReturnTarget();
            setScheduling(true);
          }}
        >
          <CalendarPlus aria-hidden="true" />
          Planifier un rendez-vous
        </Button>
      </div>
      {!canSchedule ? (
        <p
          role="note"
          className="rounded-xl border border-border bg-muted p-4 text-[13px]"
        >
          Planifier et reporter demandent un abonnement actif. Les rendez-vous
          existants restent consultables et peuvent être finalisés.
        </p>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        {tiles.map((t) => (
          <li
            key={t.label}
            className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4"
          >
            <span className="truncate text-[13px] text-muted-foreground">
              {t.label}
            </span>
            <span className="text-xl font-extrabold tabular-nums tracking-tight sm:text-2xl">
              {t.value}
            </span>
            <span className="text-xs text-muted-foreground">{t.note}</span>
          </li>
        ))}
      </ul>

      {toClose.length > 0 ? (
        <Card className="gap-1 p-5">
          <CardHeader>
            <CardTitle className="text-[15px]">
              À clôturer · {toClose.length}
            </CardTitle>
          </CardHeader>
          <ul className="flex flex-col divide-y divide-border-subtle">
            {toClose.map((a) => upcomingRow(a, true))}
          </ul>
        </Card>
      ) : null}
      <Card className="gap-1 p-5">
        <CardHeader>
          <CardTitle className="text-[15px]">À venir</CardTitle>
        </CardHeader>
        {comingUp.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            Aucun rendez-vous à venir.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {comingUp.map((a) => upcomingRow(a, false))}
          </ul>
        )}
      </Card>

      {past.length > 0 ? (
        <Card className="gap-1 p-5">
          <CardHeader>
            <CardTitle className="text-[15px]">Passés</CardTitle>
          </CardHeader>
          <ul className="flex flex-col divide-y divide-border-subtle">
            {past.map((a) => (
              <li
                key={a.id}
                id={`appointment-${a.id}`}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
                  <p className="text-sm font-bold">
                    {dateTimeFr(a.scheduledStart)} – {timeFr(a.scheduledEnd)}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {[
                      a.component?.labelSnapshot ?? "Sans prestation liée",
                      a.restored
                        ? "séance restaurée"
                        : a.consumed
                          ? "séance consommée"
                          : a.component
                            ? "aucune séance consommée"
                            : null,
                      a.replacementAppointmentId
                        ? "remplacé par un nouveau créneau"
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <StatusPill
                  size="sm"
                  status={describeStatus(appointmentStatus, a.status)}
                />
                {menu(a, null)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {scheduling ? (
        <ScheduleSheet
          subscriptionId={subscriptionId}
          data={data}
          onClose={() => setScheduling(false)}
          onDone={refresh}
          restoreFocus={restoreFocus}
        />
      ) : null}
      {mode ? (
        <ActionDialog
          key={`${mode.appointment.id}:${mode.action}`}
          mode={mode}
          onClose={() => setMode(null)}
          onDone={refresh}
          restoreFocus={restoreFocus}
        />
      ) : null}
    </section>
  );
}

type SheetProps = {
  subscriptionId: string;
  data: AppointmentListResponse;
  onClose: () => void;
  onDone: () => Promise<unknown>;
  restoreFocus: (e: Event) => void;
};

function ScheduleSheet({
  subscriptionId,
  data,
  onClose,
  onDone,
  restoreFocus,
}: SheetProps) {
  const [slot, setSlot] = useState<Slot>({ start: "", end: "", location: "" });
  const available = data.components.filter(
    (c) => c.quantityConsumed < c.quantityEntitled,
  );
  const [componentId, setComponentId] = useState(available[0]?.id ?? "");
  const [withLink, setWithLink] = useState(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const start = fromLocalInput(slot.start),
      end = fromLocalInput(slot.end);
    if (!start || !end || Date.parse(end) <= Date.parse(start))
      return setError(
        "Choisis un début et une fin valides, la fin après le début.",
      );
    setBusy(true);
    setError(null);
    try {
      const created = await appointmentsApi.schedule(subscriptionId, {
        scheduledStart: start,
        scheduledEnd: end,
        componentId: componentId || null,
        locationOrChannel: slot.location.trim() || null,
      });
      toast.success("Rendez-vous planifié.");
      if (
        withLink &&
        created.appointment.availableActions.includes("response-link")
      ) {
        try {
          // Fred 2026-10-23: the response link is created with the appointment and expires when it starts.
          const r = await appointmentsApi.link(created.appointment.id, start);
          setLink(linkFor(r.token));
        } catch (failure) {
          toast.error(
            `Rendez-vous planifié, mais le lien n'a pas pu être créé : ${appointmentErrorMessage(failure)}`,
          );
          onClose();
        }
      } else onClose();
      await onDone();
    } catch (failure) {
      setError(appointmentErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <SheetContent
        title="Planifier un rendez-vous"
        description="Heures de Libreville. La cliente peut confirmer, demander un report ou décliner depuis son lien."
        onCloseAutoFocus={restoreFocus}
        footer={
          link ? (
            <Button onClick={onClose}>Terminé</Button>
          ) : (
            <>
              <Button variant="secondary" disabled={busy} onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" form="schedule-form" disabled={busy}>
                {busy ? "Planification…" : "Planifier"}
              </Button>
            </>
          )
        }
      >
        {link ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg bg-success-soft p-3 text-sm">
              Rendez-vous planifié. Envoie ce lien à la cliente pour qu'elle
              réponde.
            </p>
            <OneTimeLink
              url={link}
              label="Lien de réponse au rendez-vous"
              meta="Expire au début du rendez-vous"
            />
          </div>
        ) : (
          <form id="schedule-form" onSubmit={submit}>
            <fieldset disabled={busy} className="flex flex-col gap-4">
              <SlotFields value={slot} onChange={setSlot} />
              <Field
                label="Prestation"
                hint="La séance est déduite à la fin du rendez-vous, ou selon la règle d'absence ou d'annulation tardive du service."
              >
                {(p) => (
                  <NativeSelect
                    {...p}
                    value={componentId}
                    onChange={(e) => setComponentId(e.target.value)}
                  >
                    {data.components.map((c) => (
                      <option
                        key={c.id}
                        value={c.id}
                        disabled={c.quantityConsumed >= c.quantityEntitled}
                      >
                        {c.labelSnapshot} -{" "}
                        {Math.max(0, c.quantityEntitled - c.quantityConsumed)}{" "}
                        restante(s) sur {c.quantityEntitled}
                      </option>
                    ))}
                    <option value="">Sans prestation liée</option>
                  </NativeSelect>
                )}
              </Field>
              <label className="flex items-center gap-2.5 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-primary)]"
                  checked={withLink}
                  onChange={(e) => setWithLink(e.target.checked)}
                />
                Créer le lien de réponse pour la cliente (expire au début du
                rendez-vous)
              </label>
              {error ? (
                <p
                  role="alert"
                  className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
                >
                  {error}
                </p>
              ) : null}
            </fieldset>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

type DialogProps = {
  mode: Mode;
  onClose: () => void;
  onDone: () => Promise<unknown>;
  restoreFocus: (e: Event) => void;
};

function ActionDialog({ mode, onClose, onDone, restoreFocus }: DialogProps) {
  const a = mode.appointment,
    action = mode.action;
  const [slot, setSlot] = useState<Slot>({
    start: "",
    end: "",
    location: a.locationOrChannel ?? "",
  });
  const [reason, setReason] = useState(""),
    [override, setOverride] = useState(false);
  const [expiry, setExpiry] = useState(() =>
    toLocalInput(
      new Date(Math.max(Date.parse(a.scheduledStart), Date.now() + 3_600_000)),
    ),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const needsReason =
    action === "cancel" ||
    action === "restore-component" ||
    (action === "complete" && override);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || action === "history") return;
    let run: () => Promise<unknown>;
    let success = "Décision enregistrée.";
    if (action === "reschedule") {
      const start = fromLocalInput(slot.start),
        end = fromLocalInput(slot.end);
      if (!start || !end || Date.parse(end) <= Date.parse(start))
        return setError(
          "Choisis un début et une fin valides, la fin après le début.",
        );
      run = async () => {
        const r = await appointmentsApi.command(a.id, "reschedule", {
          scheduledStart: start,
          scheduledEnd: end,
          locationOrChannel: slot.location.trim() || null,
        });
        const replacement = r.appointment.replacementAppointmentId;
        if (replacement) {
          try {
            setLink(
              linkFor((await appointmentsApi.link(replacement, start)).token),
            );
          } catch (failure) {
            toast.error(
              `Créneau reporté, mais le lien n'a pas pu être créé : ${appointmentErrorMessage(failure)}`,
            );
          }
        }
      };
      success =
        "Rendez-vous reporté. L'ancien créneau reste dans l'historique.";
    } else if (action === "response-link") {
      const expiresAt = fromLocalInput(expiry);
      if (!expiresAt) return setError("Choisis une expiration valide.");
      run = async () =>
        setLink(linkFor((await appointmentsApi.link(a.id, expiresAt)).token));
      success = "Lien créé. Le lien précédent est révoqué.";
    } else {
      if (needsReason && !reason.trim())
        return setError("Le motif est obligatoire.");
      const input =
        action === "cancel" || action === "restore-component"
          ? { reason: reason.trim() }
          : action === "complete"
            ? {
                earlyCompletionOverride: override,
                ...(override ? { overrideReason: reason.trim() } : {}),
              }
            : {};
      run = () => appointmentsApi.command(a.id, action, input);
    }
    setBusy(true);
    setError(null);
    try {
      await run();
      toast.success(success);
      await onDone();
      if (action !== "response-link" && action !== "reschedule") onClose();
    } catch (failure) {
      setError(appointmentErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const title =
    action === "history"
      ? "Historique et liens"
      : action === "reschedule"
        ? "Proposer un nouveau créneau"
        : actionLabels[action];
  const description = `${dateTimeFr(a.scheduledStart)} – ${timeFr(a.scheduledEnd)}${a.component ? ` · ${a.component.labelSnapshot}` : ""}`;
  const policy = a.policy;
  const destructive = action === "cancel" || action === "missed";

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent
        title={title}
        description={description}
        className="max-h-[90dvh] max-w-lg overflow-y-auto"
        onCloseAutoFocus={restoreFocus}
      >
        {action === "history" ? (
          <div className="flex flex-col gap-4 text-[13px]">
            <p className="rounded-lg bg-muted p-3">
              Règles : annulation par la cliente{" "}
              {policy.lateCancelNoticeHours === null
                ? "sans pénalité de délai"
                : `moins de ${policy.lateCancelNoticeHours} h avant → ${policy.lateCancelConsumesComponent ? "séance consommée" : "sans consommation"}`}{" "}
              · absence →{" "}
              {policy.missedConsumesComponent
                ? "séance consommée"
                : "sans consommation"}
              .
            </p>
            <ol className="flex flex-col gap-2">
              {a.events.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-0.5 border-l-2 border-border pl-3"
                >
                  <span className="font-semibold">
                    {describeStatus(appointmentStatus, e.toStatus ?? "").label}{" "}
                    · {e.actorType === "customer" ? "Cliente" : "Coach"}
                  </span>
                  <span className="text-muted-foreground">
                    {dateTimeFr(e.createdAt)}
                  </span>
                  {e.reason ? (
                    <span className="whitespace-pre-wrap break-words">
                      {e.reason}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-1">
              <p className="font-bold">Liens de réponse</p>
              {a.responseLinks.length === 0 ? (
                <p className="text-muted-foreground">Aucun lien envoyé.</p>
              ) : (
                a.responseLinks.map((l) => (
                  <p key={l.id}>
                    {
                      {
                        available: "Disponible",
                        consumed: "Utilisé",
                        expired: "Expiré",
                        revoked: "Révoqué",
                      }[l.state]
                    }{" "}
                    · expire le {dateTimeFr(l.expiresAt)}
                  </p>
                ))
              )}
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        ) : link ? (
          <div className="flex flex-col gap-3">
            <OneTimeLink
              url={link}
              label="Lien de réponse au rendez-vous"
              meta={
                action === "reschedule"
                  ? "Nouveau créneau · expire à son début"
                  : `Expire le ${dateTimeFr(fromLocalInput(expiry))}`
              }
            />
            <div className="flex justify-end">
              <Button onClick={onClose}>Terminé</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <fieldset disabled={busy} className="flex flex-col gap-4">
              {action === "reschedule" ? (
                <>
                  {a.rescheduleNote ? (
                    <p className="rounded-lg bg-warning-soft p-3 text-[13px]">
                      Message de la cliente : {a.rescheduleNote}
                    </p>
                  ) : null}
                  <SlotFields value={slot} onChange={setSlot} />
                  <p className="text-[13px] text-muted-foreground">
                    L'ancien créneau reste dans l'historique et son lien est
                    révoqué. Un nouveau lien de réponse est créé pour le nouveau
                    créneau.
                  </p>
                </>
              ) : null}
              {action === "response-link" ? (
                <Field
                  label="Expiration du lien (Libreville)"
                  hint="Par défaut : le début du rendez-vous. Le lien précédent est révoqué."
                >
                  {(p) => (
                    <Input
                      {...p}
                      required
                      type="datetime-local"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                    />
                  )}
                </Field>
              ) : null}
              {action === "confirm" ? (
                <p className="text-sm">
                  Confirmer ce rendez-vous pour la cliente ?
                </p>
              ) : null}
              {action === "missed" ? (
                <p className="text-sm">
                  Marquer la cliente absente ?{" "}
                  {policy.missedConsumesComponent && a.component
                    ? "Une séance est consommée selon les règles du service ; tu pourras la restaurer avec un motif."
                    : "Aucune séance n'est consommée."}
                </p>
              ) : null}
              {action === "complete" ? (
                <>
                  <p className="text-sm">
                    Marquer ce rendez-vous terminé ?
                    {a.component ? " Une séance est consommée." : ""} Il compte
                    comme contact pour la cadence de suivi.
                  </p>
                  <label className="flex items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4"
                      checked={override}
                      onChange={(e) => setOverride(e.target.checked)}
                    />
                    Terminer avant l'heure prévue (motif obligatoire)
                  </label>
                </>
              ) : null}
              {action === "cancel" ? (
                <p className="text-sm">
                  Annuler ce rendez-vous ? Son lien de réponse est révoqué.
                  Aucune séance n'est consommée pour une annulation par le
                  coach.
                </p>
              ) : null}
              {action === "restore-component" ? (
                <p className="text-sm">
                  Rendre la séance consommée par ce rendez-vous ? Le motif reste
                  dans l'historique.
                </p>
              ) : null}
              {needsReason ? (
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
                <Button
                  type="submit"
                  variant={destructive ? "destructive-solid" : "default"}
                >
                  {busy
                    ? "Enregistrement…"
                    : action === "reschedule"
                      ? "Reporter"
                      : action === "response-link"
                        ? "Créer le lien"
                        : "Confirmer"}
                </Button>
              </div>
            </fieldset>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
