import type { ComponentProps } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { NavLink } from "react-router";
import { businessTimeZone, dashboardPeriods, type DashboardAnalyticsResponse, type DashboardKpiTrend, type DashboardPeriod } from "@kfit/shared";
import { dashboardApi, dashboardErrorMessage } from "../api/dashboard-api.js";
import { SimpleBarChart } from "../../components/charts/bar-chart.js";
import { KpiTile } from "../../components/charts/kpi-tile.js";
import { Button } from "../../components/ui/button.js";
import { SegmentedControl } from "../../components/ui/segmented-control.js";
import { dateFr, moneyXaf, shortDateFr } from "../../lib/format.js";

const periodLabels: Record<DashboardPeriod, string> = { "4w": "4 sem.", "8w": "8 sem.", "12m": "12 mois" };
const periodPhrases: Record<DashboardPeriod, string> = { "4w": "4 semaines", "8w": "8 semaines", "12m": "12 mois" };
const periodOptions = dashboardPeriods.map((period) => ({ value: period, label: periodLabels[period] }));
const percentFr = (rate: number) => `${(rate * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
type AnalyticsQuery = UseQueryResult<DashboardAnalyticsResponse, Error>;
export function useDashboardAnalytics(periode: DashboardPeriod) {
  return useQuery({ queryKey: ["dashboard", "analytics", periode], queryFn: () => dashboardApi.analytics(periode), staleTime: 300_000, refetchInterval: 300_000 });
}
export function dashboardTrendProps(trend: DashboardKpiTrend | undefined, label: string): Pick<ComponentProps<typeof KpiTile>, "trend" | "trendLabel" | "delta"> {
  if (!trend) return {};
  const delta = trend.delta;
  return { trend: trend.points.map(point => point.value), trendLabel: `${label} sur huit semaines : ${trend.points.map(point => point.value === null ? "Historique indisponible" : point.value).join(", ")}`,
    ...(delta ? { delta: { text: delta.absoluteChange === 0 ? "Stable vs semaine précédente" : `${delta.absoluteChange > 0 ? "+" : ""}${delta.absoluteChange}${delta.percentageChange === null ? "" : ` (${delta.percentageChange > 0 ? "+" : ""}${delta.percentageChange.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %)`} vs semaine précédente`, direction: delta.direction, tone: delta.favourable === null || delta.absoluteChange === 0 ? "neutral" : delta.favourable ? "success" : "danger" } } : {}) };
}
function QueryState({ query }: { query: AnalyticsQuery }) {
  return query.isPending ? <p role="status" className="text-sm text-muted-foreground">Chargement des indicateurs…</p> : <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p>{dashboardErrorMessage(query.error)}</p><Button variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button></div>;
}
export function DashboardRequests({ query, periode, onPeriodChange }: { query: AnalyticsQuery; periode: DashboardPeriod; onPeriodChange: (period: DashboardPeriod) => void }) {
  const data = query.data;
  const chart = data?.requests.buckets.map(bucket => ({ label: periode === "12m" ? new Intl.DateTimeFormat("fr-FR", { timeZone: businessTimeZone, month: "short" }).format(new Date(bucket.start)) : shortDateFr(bucket.start), value: bucket.count, detail: `${dateFr(bucket.start)} – ${dateFr(new Date(new Date(bucket.end).getTime() - 1).toISOString())}${bucket.isCurrent ? " · en cours" : ""}` })) ?? [];
  return <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5" aria-labelledby="dashboard-requests-heading">
    {/* Board 02: title + "N sur période · taux de conversion" on the left, period switch on the right. */}
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id="dashboard-requests-heading" className="text-base font-bold">Nouvelles demandes</h2>
        <p className="text-[13px] text-muted-foreground">
          {data ? `${data.requests.totalRequests} sur ${periodPhrases[periode]} · taux de conversion ${data.requests.conversionRate === null ? "non disponible" : percentFr(data.requests.conversionRate)}` : `Sur ${periodPhrases[periode]}`}
        </p>
      </div>
      <SegmentedControl size="sm" aria-label="Période des indicateurs" value={periode} onValueChange={onPeriodChange} options={periodOptions} />
    </div>
    {query.isPending || query.isError || !data ? <QueryState query={query} /> : <>
      <SimpleBarChart data={chart} formatValue={value => `${value} demande(s)`} highlightIndex={data.requests.buckets.findIndex(bucket => bucket.isCurrent)} label={`Demandes reçues : ${chart.map(item => `${item.value} · ${item.detail}`).join(" ; ")}`} />
      {!data.requests.totalRequests ? <p className="text-sm text-muted-foreground">Aucune demande reçue sur cette période.</p> : null}
      {/* Cumulative funnel (S7.1, Fred): one compact strip so the card stays close to board 02's height. */}
      <dl className="grid grid-cols-4 gap-2 border-t border-border pt-3">
        {([["Reçues", data.requests.funnel.received], ["Contactées", data.requests.funnel.contacted], ["Qualifiées", data.requests.funnel.qualified], ["Converties", data.requests.funnel.converted]] as const).map(([label, value]) => <div key={label} className="flex min-w-0 flex-col"><dt className="truncate text-[11px] font-semibold text-muted-foreground">{label}</dt><dd className="text-sm font-bold tabular-nums">{value}</dd></div>)}
      </dl>
      <p className="text-[11px] text-muted-foreground">Étapes cumulatives, selon la situation actuelle des demandes de la période.</p>
    </>}
  </section>;
}
export function DashboardFinance({ query }: { query: AnalyticsQuery }) {
  const data = query.data;
  return <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5" aria-labelledby="dashboard-finance-heading">
    <div><h2 id="dashboard-finance-heading" className="text-base font-bold">Situation financière</h2><p className="text-[13px] text-muted-foreground">Encaissé sur la période sélectionnée · échéances actuelles</p></div>
    {query.isPending || query.isError || !data ? <QueryState query={query} /> : <dl className="grid grid-cols-2 gap-4 xl:grid-cols-5">
      {([["Encaissé", data.finance.collectedXaf], ["À échéance aujourd'hui", data.finance.dueXaf], ["En retard", data.finance.overdueXaf], ["À venir", data.finance.futureXaf], ["Reste dû", data.finance.outstandingXaf]] as const).map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-lg font-bold tabular-nums">{moneyXaf(value)}</dd></div>)}
    </dl>}
  </section>;
}
export function DashboardAlerts() {
  const query = useQuery({ queryKey: ["dashboard", "alerts"], queryFn: () => dashboardApi.alerts(), staleTime: 60_000, refetchInterval: 60_000 });
  return <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5" aria-labelledby="dashboard-alerts-heading">
    <h2 id="dashboard-alerts-heading" className="text-base font-bold">Alertes opérationnelles</h2>
    {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Chargement des alertes…</p> : query.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p>{dashboardErrorMessage(query.error)}</p><Button variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button></div> : query.data?.alerts.length ? <ul className="divide-y divide-border">
      {query.data.alerts.map(alert => <li key={`${alert.kind}-${alert.resourceId ?? alert.subscriptionId ?? alert.requestId}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><p className="break-words text-sm font-bold">{alert.title} · {alert.customerDisplayName}</p><p className="break-words text-[13px] text-muted-foreground">{alert.summary}{alert.referenceAt ? ` · ${dateFr(alert.referenceAt)}` : ""}</p></div>
        <Button asChild size="sm" variant="secondary"><NavLink to={alert.deepLink} aria-label={`Ouvrir : ${alert.title} · ${alert.customerDisplayName}`}>Ouvrir le dossier</NavLink></Button>
      </li>)}
    </ul> : <p className="text-sm text-muted-foreground">Aucune alerte opérationnelle pour le moment.</p>}
  </section>;
}
