import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight } from "lucide-react";
import {
  customerAnalyticsPeriods,
  type CustomerAnalytics,
  type CustomerAnalyticsJourneyLine,
  type CustomerAnalyticsPeriod,
} from "@kfit/shared";
import {
  customerErrorMessage,
  customersApi,
} from "../../customers/api/customers-api.js";
import { Button } from "../../components/ui/button.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { SegmentedControl } from "../../components/ui/segmented-control.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { ChartCard } from "../../components/charts/chart-card.js";
import { chartColors } from "../../components/charts/chart-colors.js";
import { TrendLineChart } from "../../components/charts/line-chart.js";
import { StackedColumnChart } from "../../components/charts/stacked-column-chart.js";
import { ReadOnlyTable } from "../../components/data-table/data-table.js";
import { cn } from "../../lib/utils.js";
import {
  describeStatus,
  subscriptionStatus,
  type StatusTone,
} from "../../lib/status-map.js";
import { familyMeta, familyOfSlug } from "../../lib/families.js";
import { dateFr, numberFr, shortDateFr } from "../../lib/format.js";
import { PaceChart } from "./PaceChart.js";

const periodLabels: Record<CustomerAnalyticsPeriod, string> = {
  "30j": "30 jours",
  abonnement: "Abonnement",
  tout: "Depuis le début",
};
const pct = (rate: number | null) =>
  rate === null ? "-" : `${Math.round(rate * 100)} %`;
function duration(hours: number | null): string {
  if (hours === null) return "-";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${numberFr(hours, hours < 10 ? 1 : 0)} h`;
  return `${numberFr(hours / 24, 0)} j`;
}

const barTone: Record<StatusTone, string> = {
  success: "bg-primary",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-neutral",
  waitlist: "bg-waitlist",
};
const noteTone: Record<StatusTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-muted-foreground",
  waitlist: "text-waitlist",
};

/** KPI with a progress bar (board 03b). The bar shows the ratio; colour follows the state, the note says why. */
function RatioKpi({
  label,
  value,
  unit,
  ratio,
  tone,
  note,
  noteToneOf = "neutral",
}: {
  label: string;
  value: string;
  unit: string;
  ratio: number | null;
  tone: StatusTone;
  note: string;
  noteToneOf?: StatusTone;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-card p-5">
      <span className="text-[13px] font-semibold text-muted-foreground">
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[28px] font-extrabold leading-none tracking-tight tabular-nums">
          {value}
        </span>
        <span className="text-[13px] text-muted-foreground">{unit}</span>
      </span>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-border"
        aria-hidden="true"
      >
        <div
          className={cn("h-1.5 rounded-full", barTone[tone])}
          style={{
            width: `${Math.round(Math.min(1, Math.max(0, ratio ?? 0)) * 100)}%`,
          }}
        />
      </div>
      <span className={cn("text-xs font-semibold", noteTone[noteToneOf])}>
        {note}
      </span>
    </div>
  );
}

function Kpis({ data }: { data: CustomerAnalytics }) {
  const { attendance, cadence, pace, links } = data;
  const rateTone = (rate: number | null): StatusTone =>
    rate === null
      ? "neutral"
      : rate >= 0.8
        ? "success"
        : rate >= 0.6
          ? "warning"
          : "danger";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <RatioKpi
        label="Assiduité"
        value={pct(attendance.rate)}
        unit={
          attendance.rate === null
            ? "aucune séance"
            : `${attendance.honored} honorée(s) / ${attendance.honored + attendance.missed}`
        }
        ratio={attendance.rate}
        tone={rateTone(attendance.rate)}
        note={`Reports exclus · ${attendance.missed} absence(s)${attendance.rescheduled ? ` · ${attendance.rescheduled} report(s)` : ""}`}
      />
      <RatioKpi
        label="Respect de la cadence"
        value={cadence ? pct(cadence.inCadenceRate) : "-"}
        unit={cadence ? "des jours suivis" : "non mesurée"}
        ratio={cadence?.inCadenceRate ?? null}
        tone={rateTone(cadence?.inCadenceRate ?? null)}
        note={
          !cadence
            ? "Pas de cadence, ou abonnement non démarré"
            : cadence.overdueByDays
              ? `En retard de ${cadence.overdueByDays} jour(s)`
              : cadence.overdueByDays === 0
                ? "À jour aujourd'hui"
                : "Non mesurée aujourd'hui"
        }
        noteToneOf={cadence?.overdueByDays ? "danger" : "neutral"}
      />
      <RatioKpi
        label="Prestations"
        value={pace ? `${pace.realized} / ${pace.entitled}` : "-"}
        unit={pace ? "réalisées" : "non mesuré"}
        ratio={pace ? pace.realized / pace.entitled : null}
        tone={pace?.behind ? "warning" : "success"}
        note={
          pace
            ? `Attendu au J${pace.elapsedDays} : ${numberFr(pace.expected, 1)}`
            : "Abonnement non démarré ou sans date de fin prévue"
        }
        noteToneOf={pace?.behind ? "warning" : "neutral"}
      />
      <RatioKpi
        label="Réactivité aux liens"
        value={duration(links.medianHoursToUse)}
        unit={
          links.medianHoursToUse === null ? "aucun lien utilisé" : "médiane"
        }
        ratio={links.sent ? links.used / links.sent : null}
        tone="success"
        note={`${links.used} / ${links.sent} lien(s) utilisé(s) · ${links.rescheduleRequests} report(s) demandé(s)`}
      />
    </div>
  );
}

const journeyColumns = (
  onSelect: (id: string) => void,
  selectedId: string,
): ColumnDef<CustomerAnalyticsJourneyLine, unknown>[] => [
  {
    id: "reference",
    header: "Référence",
    accessorFn: (r) => r.reference,
    cell: ({ row }) => (
      <button
        type="button"
        onClick={() => onSelect(row.original.subscriptionId)}
        className={cn(
          "flex items-center gap-2 whitespace-nowrap font-bold tabular-nums hover:underline",
          row.original.subscriptionId === selectedId ? "text-primary" : "",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-2 rounded-full",
            familyMeta[familyOfSlug(row.original.serviceSlug)].dotClass,
          )}
        />
        {row.original.reference}
      </button>
    ),
  },
  {
    id: "offer",
    header: "Offre",
    accessorFn: (r) => r.serviceName,
    cell: ({ row }) => (
      <span>
        {row.original.serviceName}
        {row.original.variantName ? ` · ${row.original.variantName}` : ""}
      </span>
    ),
  },
  {
    id: "period",
    header: "Période",
    accessorFn: (r) => r.startDate,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.startDate
          ? `${shortDateFr(row.original.startDate)} → ${row.original.endDate ? shortDateFr(row.original.endDate) : "…"}`
          : "Non démarré"}
      </span>
    ),
  },
  {
    id: "status",
    header: "Statut",
    accessorFn: (r) => r.status,
    cell: ({ row }) => (
      <StatusPill
        size="sm"
        status={describeStatus(subscriptionStatus, row.original.status)}
      />
    ),
  },
  {
    id: "usage",
    header: "Prestations",
    accessorFn: (r) => r.consumed,
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.consumed} / {row.original.entitled}
      </span>
    ),
  },
  {
    id: "attendance",
    header: "Assiduité",
    accessorFn: (r) => r.attendanceRate,
    cell: ({ row }) => (
      <span className="tabular-nums">{pct(row.original.attendanceRate)}</span>
    ),
  },
];

type AnalysisTabProps = {
  customerId: string;
  subscriptionId: string;
  period: CustomerAnalyticsPeriod;
  onPeriodChange: (period: CustomerAnalyticsPeriod) => void;
  onSelectSubscription: (id: string) => void;
  openProgress: () => void;
};

/** Client profile · Analyse (board 03b). Data: GET /admin/customers/:id/analytics (read-only, rules validated 2026-10-22). */
export function AnalysisTab({
  customerId,
  subscriptionId,
  period,
  onPeriodChange,
  onSelectSubscription,
  openProgress,
}: AnalysisTabProps) {
  const query = useQuery({
    queryKey: ["customers", "analytics", customerId, period, subscriptionId],
    queryFn: () => customersApi.analytics(customerId, period, subscriptionId),
    placeholderData: (previous) => previous,
  });

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SegmentedControl
        aria-label="Période analysée"
        size="sm"
        value={period}
        onValueChange={onPeriodChange}
        options={customerAnalyticsPeriods.map((value) => ({
          value,
          label: periodLabels[value],
        }))}
      />
      <span className="flex flex-wrap items-center gap-3">
        {query.data ? (
          <span className="text-xs text-muted-foreground">
            Du {dateFr(query.data.analytics.periodStart)} au{" "}
            {dateFr(query.data.analytics.periodEnd)}
          </span>
        ) : null}
        {/* The goal chart of board 03b lives in Progression (decision 2026-10-22: no duplicate chart). */}
        <Button variant="ghost" size="sm" onClick={openProgress}>
          Mesures et objectifs <ArrowRight />
        </Button>
      </span>
    </div>
  );

  if (query.isPending)
    return (
      <div className="flex flex-col gap-5">
        {toolbar}
        <p role="status" className="text-sm text-muted-foreground">
          Chargement de l'analyse…
        </p>
      </div>
    );
  if (query.isError) {
    return (
      <div className="flex flex-col gap-5">
        {toolbar}
        <EmptyState
          title="Impossible de charger l'analyse"
          description={customerErrorMessage(query.error)}
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Réessayer
            </Button>
          }
        />
      </div>
    );
  }

  const data = query.data.analytics;
  const reference =
    data.journey.find((j) => j.subscriptionId === data.focusSubscriptionId)
      ?.reference ?? "";
  const cadenceSeries =
    data.cadence?.series.map((p) => ({
      date: shortDateFr(`${p.date}T12:00:00Z`),
      value: p.daysSinceContact,
    })) ?? [];
  const cadenceMax = Math.max(
    data.cadence?.cadenceDays ?? 0,
    ...cadenceSeries.map((p) => p.value ?? 0),
  );
  const focus = data.journey.find(
    (j) => j.subscriptionId === data.focusSubscriptionId,
  );
  const notStarted =
    Boolean(focus) &&
    !data.cadence &&
    !data.pace &&
    [
      "onboarding",
      "awaiting_payment",
      "medical_clearance_required",
      "ready_to_start",
    ].includes(focus?.status ?? "");
  const weeks = data.weeklyAttendance.map((w) => ({
    ...w,
    label: shortDateFr(`${w.weekStart}T12:00:00Z`),
  }));

  return (
    <div
      className={cn(
        "flex flex-col gap-5 transition-opacity",
        query.isFetching ? "opacity-70" : "",
      )}
    >
      {toolbar}
      <Kpis data={data} />

      {notStarted ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-5 py-4 text-[13px] text-muted-foreground">
          {reference} n'a pas encore démarré : la cadence de suivi et le rythme
          des prestations s'afficheront à partir du démarrage.
        </p>
      ) : null}

      <div
        className={cn(
          "grid grid-cols-1 gap-5",
          notStarted ? "" : "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
        )}
      >
        {notStarted ? null : (
          <ChartCard
            title="Jours depuis le dernier contact"
            description={
              data.cadence
                ? `${reference} · activité : séance, suivi, démarrage · seuil = cadence de ${data.cadence.cadenceDays} jours`
                : "Activité significative : séance, suivi, démarrage."
            }
            table={{
              columns: ["Jour", "Jours depuis le contact"],
              rows: cadenceSeries.map((p) => ({
                label: p.date,
                values: [p.value ?? "Non suivi"],
              })),
            }}
          >
            {!data.cadence ? (
              <p className="py-10 text-center text-[13px] text-muted-foreground">
                Pas de cadence de suivi pour cet abonnement, ou abonnement non
                démarré.
              </p>
            ) : (
              <TrendLineChart
                data={cadenceSeries}
                xKey="date"
                series={[{ key: "value", label: "Jours depuis le contact" }]}
                references={[
                  {
                    y: data.cadence.cadenceDays,
                    label: `Cadence ${data.cadence.cadenceDays} j`,
                    tone: "threshold",
                  },
                ]}
                formatValue={(v) => `${v} jour(s)`}
                label={`Jours depuis le dernier contact, cadence ${data.cadence.cadenceDays} jours`}
                yDomain={[0, Math.ceil(cadenceMax + 2)]}
                connectNulls={false}
              />
            )}
          </ChartCard>
        )}

        <ChartCard
          title="Assiduité par semaine"
          description="Tous abonnements · 6 dernières semaines"
          table={{
            columns: ["Semaine du", "Honoré", "Reporté", "Absent"],
            rows: weeks.map((w) => ({
              label: w.label,
              values: [w.honored, w.rescheduled, w.missed],
            })),
          }}
        >
          <StackedColumnChart
            data={weeks}
            xKey="label"
            series={[
              { key: "honored", label: "Honoré", color: chartColors.success },
              {
                key: "rescheduled",
                label: "Reporté",
                color: chartColors.warning,
              },
              { key: "missed", label: "Absent", color: chartColors.dangerFill },
            ]}
            label="Rendez-vous par semaine : honorés, reportés, absences"
          />
        </ChartCard>
      </div>

      {notStarted ? null : (
        <ChartCard
          title={`Rythme des prestations${reference ? ` · ${reference}` : ""}`}
          description={
            data.pace
              ? `Réalisé vs rythme attendu sur ${data.pace.totalDays} jours actifs`
              : "Réalisé vs rythme attendu"
          }
          actions={
            data.pace ? (
              <StatusPill
                size="sm"
                status={
                  data.pace.behind
                    ? { label: "En retard sur le rythme", tone: "warning" }
                    : { label: "Dans le rythme", tone: "success" }
                }
              />
            ) : undefined
          }
          table={{
            columns: ["Date", "Réalisé"],
            rows: (data.pace?.series ?? []).map((p) => ({
              label: dateFr(p.date),
              values: [p.realized],
            })),
          }}
        >
          {data.pace ? (
            <>
              <PaceChart pace={data.pace} />
              <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="w-4 border-t-[3px] border-primary"
                  />
                  Réalisé : {data.pace.realized}
                </li>
                <li className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="w-4 border-t-2 border-dashed border-neutral"
                  />
                  Attendu aujourd'hui : {numberFr(data.pace.expected, 1)}
                </li>
              </ul>
            </>
          ) : (
            <p className="py-10 text-center text-[13px] text-muted-foreground">
              Le rythme se calcule une fois l'abonnement démarré, avec une date
              de fin prévue et des prestations.
            </p>
          )}
        </ChartCard>
      )}

      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-bold">Parcours des abonnements</h2>
          <p className="text-[13px] text-muted-foreground">
            Lecture seule · choisir une référence pour l'analyser.
          </p>
        </div>
        <ReadOnlyTable
          columns={journeyColumns(
            onSelectSubscription,
            data.focusSubscriptionId ?? "",
          )}
          data={data.journey}
          getRowId={(r) => r.subscriptionId}
          pageSize={6}
          itemLabel="abonnements"
          caption="Parcours des abonnements du client"
          emptyTitle="Aucun abonnement"
          emptyDescription="Le parcours apparaîtra après la première conversion."
        />
      </section>
    </div>
  );
}
