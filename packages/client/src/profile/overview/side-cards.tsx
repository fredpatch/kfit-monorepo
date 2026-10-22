import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Minus } from "lucide-react";
import type { SubscriptionDetail } from "@kfit/shared";
import { followUpsApi, followUpErrorMessage } from "../../follow-ups/api/follow-ups-api.js";
import { activityTypes, cadenceSources } from "../../follow-ups/components/follow-up-labels.js";
import { onboardingApi, onboardingErrorMessage } from "../../onboarding/api/onboarding-api.js";
import { appointmentsApi, appointmentErrorMessage } from "../../appointments/api/appointments-api.js";
import { Button } from "../../components/ui/button.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { cn } from "../../lib/utils.js";
import { appointmentStatus, describeStatus, overdueLabel, subscriptionStatus } from "../../lib/status-map.js";
import { dateFr, dateTimeFr, relativeDaysFr, shortDateFr, timeFr } from "../../lib/format.js";

type OpenTab = (tab: "rendez-vous" | "suivis" | "preparation") => void;

function SideCard({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3.5 rounded-xl border border-border bg-card p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Loading() {
  return <p role="status" className="text-[13px] text-muted-foreground">Chargement…</p>;
}
function Failure({ message }: { message: string }) {
  return <p role="alert" className="text-[13px] text-danger">{message}</p>;
}


/** Follow-up cadence (board 03, right column). Data: GET /admin/subscriptions/:id/follow-ups. */
export function CadenceCard({ subscriptionId, openTab }: { subscriptionId: string; openTab: OpenTab }) {
  const query = useQuery({ queryKey: ["follow-ups", subscriptionId], queryFn: () => followUpsApi.list(subscriptionId), refetchInterval: 30_000 });
  const goToFollowUps = <Button variant="ghost" size="sm" onClick={() => openTab("suivis")}>Ouvrir</Button>;
  if (query.isPending) return <SideCard title="Cadence de suivi"><Loading /></SideCard>;
  if (query.isError) return <SideCard title="Cadence de suivi"><Failure message={followUpErrorMessage(query.error)} /></SideCard>;
  const { cadence } = query.data.detail;

  if (!cadence.cadenceEligible || cadence.monitoringDisabled || cadence.effectiveCadenceDays === null) {
    return (
      <SideCard title="Cadence de suivi" action={goToFollowUps}>
        <p className="text-[13px] text-muted-foreground">
          {cadence.clockFrozen ? "Cadence suspendue pendant la pause." : cadence.effectiveCadenceDays === null ? "Aucune cadence configurée pour cette offre." : "Le suivi démarre à l'activation de l'abonnement."}
        </p>
      </SideCard>
    );
  }

  const overdue = cadence.cadenceState === "overdue";
  const tone = overdue ? "bg-danger-soft text-danger" : cadence.cadenceState === "due" ? "bg-warning-soft text-warning" : "bg-success-soft text-success";
  return (
    <SideCard title="Cadence de suivi" action={goToFollowUps}>
      <div className={cn("flex items-center gap-3.5 rounded-lg p-3.5", tone)}>
        <span className="flex size-[52px] shrink-0 flex-col items-center justify-center rounded-full bg-card">
          {overdue ? (
            <>
              <span className="text-lg font-extrabold leading-none">{cadence.overdueByDays ?? 0} j</span>
              <span className="text-[10px] font-bold">retard</span>
            </>
          ) : cadence.cadenceState === "due" ? (
            <AlertTriangle className="size-5" aria-hidden="true" />
          ) : (
            <Check className="size-5" aria-hidden="true" />
          )}
        </span>
        <div className="flex flex-col gap-0.5 text-[13px]">
          <strong>{overdue ? overdueLabel(cadence.overdueByDays) : cadence.cadenceState === "due" ? "Suivi à faire" : "À jour"}</strong>
          <span>Prochain suivi : {dateFr(cadence.nextFollowUpDueAt)}</span>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-[13px]">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Cadence</dt>
          <dd className="font-semibold">
            Tous les {cadence.effectiveCadenceDays} jours
            <span className="block text-xs font-normal text-muted-foreground">{cadenceSources[cadence.cadenceSource]}</span>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Dernière activité</dt>
          <dd className="font-semibold">
            {relativeDaysFr(cadence.latestMeaningfulActivityAt)}
            {cadence.latestActivityType ? <span className="block text-xs font-normal text-muted-foreground">{activityTypes[cadence.latestActivityType]}</span> : null}
          </dd>
        </div>
      </dl>
      <Button onClick={() => openTab("suivis")}>Enregistrer un suivi</Button>
    </SideCard>
  );
}

/** Preparation checklist summary. Data: GET /admin/subscriptions/:id/onboarding. */
export function PreparationCard({ subscriptionId, openTab }: { subscriptionId: string; openTab: OpenTab }) {
  const query = useQuery({ queryKey: ["onboarding", subscriptionId], queryFn: () => onboardingApi.get(subscriptionId), refetchInterval: 30_000 });
  const open = <Button variant="ghost" size="sm" onClick={() => openTab("preparation")}>Ouvrir</Button>;
  if (query.isPending) return <SideCard title="Préparation"><Loading /></SideCard>;
  if (query.isError) return <SideCard title="Préparation"><Failure message={onboardingErrorMessage(query.error)} /></SideCard>;
  const { onboarding } = query.data;
  if (!onboarding.initialized) {
    return (
      <SideCard title="Préparation" action={open}>
        <p className="text-[13px] text-muted-foreground">La checklist n'a pas encore été préparée.</p>
      </SideCard>
    );
  }
  const resolved = onboarding.items.filter((i) => i.status === "completed" || i.status === "waived").length;
  const total = onboarding.items.length;
  const blocked = onboarding.onboardingState === "blocked" && onboarding.subscription.status === "onboarding";
  return (
    <SideCard
      title="Préparation"
      action={
        <span className="flex items-center gap-2">
          <StatusPill size="sm" status={{ label: `${resolved} / ${total}${resolved === total ? " · validée" : ""}`, tone: resolved === total ? "success" : blocked ? "warning" : "info" }} />
          {open}
        </span>
      }
    >
      <ul className="flex flex-col gap-2.5">
        {onboarding.items.map((item) => {
          const done = item.status === "completed";
          const waived = item.status === "waived";
          return (
            <li key={item.id} className="flex items-center gap-2.5 text-[13px]">
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full", done ? "bg-primary text-white" : waived ? "bg-muted text-neutral" : "border-2 border-input")}>
                {done ? <Check className="size-3" strokeWidth={3.5} aria-hidden="true" /> : waived ? <Minus className="size-3" aria-hidden="true" /> : null}
              </span>
              <span className={cn("flex-1 font-semibold", !done && !waived && item.isBlocking ? "text-foreground" : "")}>{item.label}</span>
              <span className="text-xs text-muted-foreground">{done ? shortDateFr(item.completedAt) : waived ? "Dispensé" : item.isBlocking ? "Bloquant" : "À faire"}</span>
            </li>
          );
        })}
      </ul>
    </SideCard>
  );
}

/** Next appointments + pending reschedule request. Data: GET /admin/subscriptions/:id/appointments. */
export function UpcomingAppointmentsCard({ subscriptionId, openTab }: { subscriptionId: string; openTab: OpenTab }) {
  const query = useQuery({ queryKey: ["appointments", subscriptionId], queryFn: () => appointmentsApi.list(subscriptionId) });
  const all = <Button variant="ghost" size="sm" onClick={() => openTab("rendez-vous")}>Tout voir{query.data ? ` (${query.data.appointments.length})` : ""}</Button>;
  if (query.isPending) return <SideCard title="Rendez-vous"><Loading /></SideCard>;
  if (query.isError) return <SideCard title="Rendez-vous"><Failure message={appointmentErrorMessage(query.error)} /></SideCard>;
  const now = Date.now();
  const upcoming = query.data.appointments
    .filter((a) => ["scheduled", "confirmed", "reschedule_requested"].includes(a.status) && new Date(a.scheduledEnd).getTime() >= now)
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  const rescheduleAsked = query.data.appointments.find((a) => a.status === "reschedule_requested" || a.customerResponseStatus === "reschedule_requested");

  return (
    <SideCard title="Rendez-vous" action={all}>
      {rescheduleAsked ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-warning-soft p-3.5">
          <AlertTriangle className="size-[18px] shrink-0 text-warning" aria-hidden="true" />
          <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5 text-[13px]">
            <strong className="text-warning">Report demandé pour le {dateTimeFr(rescheduleAsked.scheduledStart)}</strong>
            {rescheduleAsked.rescheduleNote ? <span className="text-[#78350f]">« {rescheduleAsked.rescheduleNote} »</span> : null}
          </div>
          <Button size="sm" className="bg-warning hover:bg-warning/90" onClick={() => openTab("rendez-vous")}>
            Proposer un créneau
          </Button>
        </div>
      ) : null}
      {upcoming.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Aucun rendez-vous à venir.</p>
      ) : (
        <ul className="flex flex-col">
          {upcoming.slice(0, 3).map((a) => {
            const start = new Date(a.scheduledStart);
            return (
              <li key={a.id} className="flex items-center gap-3.5 border-b border-border-subtle py-3 last:border-0">
                <span className="flex size-[52px] shrink-0 flex-col items-center justify-center rounded-lg border border-border-subtle bg-[#f7f8f5]">
                  <span className="text-[11px] font-bold uppercase text-muted-foreground">{start.toLocaleDateString("fr-FR", { month: "short" })}</span>
                  <span className="text-lg font-extrabold leading-none">{start.getDate()}</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-bold">
                    {timeFr(a.scheduledStart)} · {a.component?.labelSnapshot ?? a.serviceName}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{a.locationOrChannel ?? "Lieu ou canal non défini"}</span>
                </span>
                <StatusPill size="sm" status={describeStatus(appointmentStatus, a.status)} />
              </li>
            );
          })}
        </ul>
      )}
    </SideCard>
  );
}

/** Recent lifecycle decisions (read-only). Data: subscription history. */
export function HistoryCard({ view }: { view: SubscriptionDetail }) {
  const entries = [...view.history].sort((a, b) => b.changedAt.localeCompare(a.changedAt)).slice(0, 5);
  return (
    <SideCard title="Décisions récentes">
      {entries.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Aucune décision enregistrée.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((h) => (
            <li key={h.id} className="flex gap-2.5 text-[13px]">
              <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
              <span className="flex flex-col gap-0.5">
                <span>
                  {h.fromStatus ? `${describeStatus(subscriptionStatus, h.fromStatus).label} → ` : "Création → "}
                  <strong>{describeStatus(subscriptionStatus, h.toStatus).label}</strong>
                </span>
                <span className="text-xs text-muted-foreground">
                  {dateTimeFr(h.changedAt)}
                  {h.reason ? ` · ${h.reason}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {view.renewedFromSubscriptionId || view.renewalChild ? (
        <p className="border-t border-border-subtle pt-3 text-xs text-muted-foreground">
          {view.renewalChild ? `Renouvelé par ${view.renewalChild.reference}.` : "Cet abonnement renouvelle un abonnement précédent."}
        </p>
      ) : null}
    </SideCard>
  );
}
