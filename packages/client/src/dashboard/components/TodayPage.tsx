import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router";
import { AlertTriangle, CalendarCheck, Inbox, Users } from "lucide-react";
import type { DashboardPeriod, TodayTask, TodayTaskKind } from "@kfit/shared";
import { DashboardAlerts, DashboardFinance, DashboardRequests, dashboardTrendProps, useDashboardAnalytics } from "./DashboardAnalytics.js";
import { dashboardApi, dashboardErrorMessage } from "../api/dashboard-api.js";
import { AdminPage } from "../../app/layout/AdminPage.js";
import { KpiTile } from "../../components/charts/kpi-tile.js";
import { StackedBar } from "../../components/charts/stacked-bar.js";
import { Avatar } from "../../components/ui/avatar.js";
import { Button } from "../../components/ui/button.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { cn } from "../../lib/utils.js";
import { appointmentStatus, describeStatus, type StatusDescriptor } from "../../lib/status-map.js";
import { familyMeta, familyOfSlug } from "../../lib/families.js";
import { dateFr, dateTimeFr, longDayFr, relativeDaysFr, timeFr } from "../../lib/format.js";

type Filter = "all" | "follow" | "requests" | "subscriptions";
const filterOf: Record<TodayTaskKind, Filter> = {
  follow_up_overdue: "follow", follow_up_due: "follow",
  request_new: "requests", request_follow_up: "requests",
  preparation_expired: "subscriptions", preparation_ready: "subscriptions", preparation_waiting: "subscriptions", completion_due: "subscriptions",
};
const filterLabels: Record<Filter, string> = { all: "Tout", follow: "Suivis", requests: "Demandes", subscriptions: "Abonnements" };

/** Wording, status tone, detail line and the single action of each « À traiter » line (board 02). */
function describe(t: TodayTask): { status: StatusDescriptor; meta: string; action: string; to: string } {
  const profile = (onglet: string) => `/admin/clients/${t.customerId}?abonnement=${t.subscriptionId}&onglet=${onglet}`;
  switch (t.kind) {
    case "follow_up_overdue":
      return { status: { label: `En retard · ${t.days ?? 0} j`, tone: "danger" }, meta: `${t.offer} · dernier contact ${dateFr(t.at)}`, action: "Enregistrer le suivi", to: `${profile("suivis")}&nouveau=suivi` };
    case "follow_up_due":
      return { status: { label: "Suivi à faire", tone: "warning" }, meta: `${t.offer} · prévu ${dateTimeFr(t.at)}`, action: "Enregistrer le suivi", to: `${profile("suivis")}&nouveau=suivi` };
    case "request_new":
      return { status: { label: "Nouvelle demande", tone: "info" }, meta: `${t.offer} · reçue ${relativeDaysFr(t.at)} (${dateTimeFr(t.at)})`, action: "Contacter", to: `/admin/demandes?vue=nouvelles&demande=${t.requestId}` };
    case "request_follow_up":
      return { status: { label: "Relance prévue", tone: "warning" }, meta: `${t.offer} · relance du ${dateTimeFr(t.at)}`, action: "Relancer", to: `/admin/demandes?demande=${t.requestId}` };
    case "preparation_expired":
      return { status: { label: "Réservation expirée", tone: "danger" }, meta: `${t.offer} · place réservée jusqu'au ${dateFr(t.at)}`, action: "Ouvrir la préparation", to: profile("preparation") };
    case "preparation_ready":
      return { status: { label: "Prête à valider", tone: "success" }, meta: `${t.offer}${t.at ? ` · début prévu le ${dateFr(t.at)}` : ""}`, action: "Valider la préparation", to: profile("preparation") };
    case "preparation_waiting":
      return { status: { label: "Préparation en attente", tone: "waitlist" }, meta: `${t.offer}${t.item ? ` · manque : ${t.item}` : ""}`, action: "Relancer", to: profile("preparation") };
    case "completion_due":
      return { status: { label: "Revue de fin", tone: "warning" }, meta: `${t.offer}${t.at ? ` · fin prévue le ${dateFr(t.at)}` : ""}`, action: "Ouvrir la revue", to: profile("apercu") };
  }
}

/** Board 02 shows a short list; longer queues expand on demand. */
const TASKS_PREVIEW = 8;

/** « Vendredi 23 octobre » from the server business date (Africa/Libreville), not the device clock. */
function businessDayLabel(businessDate: string | undefined): string {
  const label = longDayFr(businessDate ? new Date(`${businessDate}T12:00:00Z`) : new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function duration(start: string, end: string) {
  const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ""}` : `${minutes} min`;
}

/** Aujourd'hui (board 02). Data: GET /admin/today (rules validated 2026-10-22, business time Africa/Libreville). */
export function TodayPage() {
  const query = useQuery({ queryKey: ["dashboard", "today"], queryFn: () => dashboardApi.today(), refetchInterval: 60_000 });
  const [filter, setFilter] = useState<Filter>("all");
  // 8 weeks by default, like board 02 and the KPI sparklines.
  const [periode, setPeriode] = useState<DashboardPeriod>("8w");
  const [showAllTasks, setShowAllTasks] = useState(false);
  const analytics = useDashboardAnalytics(periode);
  const data = query.data;
  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: 0, follow: 0, requests: 0, subscriptions: 0 };
    for (const t of data?.tasks ?? []) { result.all += 1; result[filterOf[t.kind]] += 1; }
    return result;
  }, [data]);
  const tasks = (data?.tasks ?? []).filter((t) => filter === "all" || filterOf[t.kind] === filter);
  const visibleTasks = showAllTasks ? tasks : tasks.slice(0, TASKS_PREVIEW);
  const day = businessDayLabel(data?.businessDate);
  const overdue = data?.kpis.followUpsOverdue ?? 0;

  return (
    <AdminPage
      title="Bonjour"
      breadcrumb={<span className="text-[13px] font-semibold text-muted-foreground">{day}</span>}
      description={data ? (counts.all ? `${counts.all} action(s) à traiter aujourd'hui${overdue ? `, dont ${overdue} suivi(s) en retard` : ""}.` : "Rien d'urgent à traiter aujourd'hui.") : "Ta journée en un coup d'œil."}
    >
      {query.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">Chargement de la journée…</p>
      ) : query.isError || !data ? (
        <EmptyState title="Impossible de charger la journée" description={query.error ? dashboardErrorMessage(query.error) : "Réessaie dans un instant."} action={<Button variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button>} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiTile label="Clientes actives" value={String(data.kpis.activeClients)} icon={Users} tone="success" note="Au moins un abonnement actif" {...dashboardTrendProps(analytics.data?.trends.activeClients, "Clientes actives")} />
            <KpiTile label="Suivis en retard" value={String(data.kpis.followUpsOverdue)} icon={AlertTriangle} tone={data.kpis.followUpsOverdue ? "danger" : "success"} note={data.kpis.oldestOverdueDays !== null ? `Le plus ancien : ${data.kpis.oldestOverdueDays} jour(s)` : "Aucun retard"} noteTone={data.kpis.followUpsOverdue ? "danger" : "neutral"} {...dashboardTrendProps(analytics.data?.trends.followUpsOverdue, "Suivis en retard")} />
            <KpiTile label="Nouvelles demandes" value={String(data.kpis.newRequestsThisWeek)} icon={Inbox} tone="info" note={`Cette semaine · ${data.kpis.requestsToContact} à contacter`} {...dashboardTrendProps(analytics.data?.trends.newRequests, "Nouvelles demandes")} />
            <KpiTile label="Séances réalisées" value={String(data.kpis.sessionsCompletedThisWeek)} icon={CalendarCheck} tone="warning" note={`Cette semaine · ${data.kpis.sessionsCompletedToday} aujourd'hui`} {...dashboardTrendProps(analytics.data?.trends.sessionsCompleted, "Séances réalisées")} />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <DashboardRequests query={analytics} periode={periode} onPeriodChange={setPeriode} />

            <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-5">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-base font-bold">Clientes actives par offre</h2>
                <p className="text-[13px] text-muted-foreground">{data.kpis.activeClients} cliente(s) · répartition actuelle</p>
              </div>
              {data.clientsByOffer.length ? (
                <StackedBar
                  layout="list"
                  label={`Clientes actives par offre : ${data.clientsByOffer.map((o) => `${o.serviceName} ${o.count}`).join(", ")}`}
                  segments={data.clientsByOffer.map((o) => ({ key: o.serviceSlug, label: o.serviceName, value: o.count, color: familyMeta[familyOfSlug(o.serviceSlug)].colorVar }))}
                />
              ) : (
                <p className="text-[13px] text-muted-foreground">Aucune cliente active pour le moment.</p>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold">À traiter</h2>
                <div role="group" aria-label="Filtrer" className="flex flex-wrap gap-1.5">
                  {(Object.keys(filterLabels) as Filter[]).map((f) => (
                    <button key={f} type="button" aria-pressed={filter === f} onClick={() => { setFilter(f); setShowAllTasks(false); }}
                      className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", filter === f ? "border-primary bg-primary text-white" : "border-border text-muted-foreground hover:text-foreground")}>
                      {filterLabels[f]} · {counts[f]}
                    </button>
                  ))}
                </div>
              </div>
              {tasks.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-muted-foreground">Rien à traiter ici.</p>
              ) : (
                <>
                <ul className="flex flex-col">
                  {visibleTasks.map((t) => {
                    const d = describe(t);
                    return (
                      <li key={`${t.kind}:${t.subscriptionId ?? t.requestId}`} className="flex flex-wrap items-center gap-3 border-b border-border-subtle py-3 last:border-0">
                        <Avatar name={t.name} size="sm" />
                        <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold">{t.name}</span>
                            <StatusPill size="sm" status={d.status} />
                          </span>
                          <span className="truncate text-xs text-muted-foreground">{d.meta}</span>
                        </span>
                        <Button asChild size="sm" variant={t.kind === "follow_up_overdue" || t.kind === "request_new" ? "default" : "secondary"}>
                          <NavLink to={d.to}>{d.action}</NavLink>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                {tasks.length > TASKS_PREVIEW ? (
                  <Button type="button" variant="ghost" size="sm" className="self-center" aria-expanded={showAllTasks} onClick={() => setShowAllTasks((v) => !v)}>
                    {showAllTasks ? "Réduire la liste" : `Afficher les ${tasks.length - TASKS_PREVIEW} autres`}
                  </Button>
                ) : null}
                </>
              )}
            </section>

            <div className="flex min-w-0 flex-col gap-5">
              <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
                <h2 className="text-base font-bold">Rendez-vous du jour</h2>
                {data.appointments.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">Aucun rendez-vous aujourd'hui.</p>
                ) : (
                  <ul className="flex flex-col">
                    {data.appointments.map((a) => (
                      <li key={a.id}>
                        <NavLink to={`/admin/clients/${a.customer.id}?abonnement=${a.subscriptionId}&onglet=rendez-vous`} className="flex items-center gap-3 rounded-lg px-1 py-2.5 hover:bg-muted">
                          <span className="flex w-14 shrink-0 flex-col">
                            <span className="text-sm font-extrabold tabular-nums">{timeFr(a.scheduledStart)}</span>
                            <span className="text-[11px] text-muted-foreground">{duration(a.scheduledStart, a.scheduledEnd)}</span>
                          </span>
                          <span aria-hidden="true" className={cn("h-9 w-1 shrink-0 rounded-full", familyMeta[familyOfSlug(a.serviceSlug)].dotClass)} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-bold">{a.customer.fullName}</span>
                            <span className="truncate text-xs text-muted-foreground">{a.componentLabel ?? a.serviceName}{a.locationOrChannel ? ` · ${a.locationOrChannel}` : ""}</span>
                          </span>
                          <StatusPill size="sm" status={describeStatus(appointmentStatus, a.status)} />
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold">Capacité des offres</h2>
                  <Button asChild variant="ghost" size="sm"><NavLink to="/admin/offres">Catalogue</NavLink></Button>
                </div>
                <ul className="flex flex-col gap-3">
                  {data.capacity.map((c) => {
                    const full = c.limit !== null && c.occupied >= c.limit;
                    return (
                      <li key={c.serviceId} className="flex flex-col gap-1.5">
                        <span className="flex items-center justify-between gap-2 text-[13px]">
                          <span className="truncate font-semibold">{c.name}</span>
                          <span className={cn("shrink-0 tabular-nums", full ? "font-bold text-danger" : "text-muted-foreground")}>
                            {c.limit === null ? `${c.occupied} · illimitée` : full ? `Complète · ${c.occupied} / ${c.limit}` : `${c.occupied} / ${c.limit}`}
                            {c.waitlist ? ` · ${c.waitlist} en attente` : ""}
                          </span>
                        </span>
                        {c.limit !== null ? (
                          <span className="h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
                            <span className={cn("block h-1.5 rounded-full", full ? "bg-danger" : "bg-primary")} style={{ width: `${Math.min(100, Math.round((c.occupied / c.limit) * 100))}%` }} />
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          </div>

          {/* Not on board 02: S7.1 additions, kept below the daily work. */}
          <DashboardFinance query={analytics} />
          <DashboardAlerts />
        </div>
      )}
    </AdminPage>
  );
}
