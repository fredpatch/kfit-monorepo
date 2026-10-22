import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus, Target } from "lucide-react";
import { progressMetrics, type CoachingGoal, type GoalAction, type ProgressMeasurement, type ProgressMetric } from "@kfit/shared";
import { progressApi, progressErrorMessage } from "../../progress/api/progress-api.js";
import { Button } from "../../components/ui/button.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/ui/dropdown-menu.js";
import { Sparkline } from "../../components/charts/sparkline.js";
import { TrendLineChart, type ReferenceMark } from "../../components/charts/line-chart.js";
import { ReadOnlyTable } from "../../components/data-table/data-table.js";
import { cn } from "../../lib/utils.js";
import { goalStatus } from "../../lib/status-map.js";
import { dateFr, numberFr, shortDateFr } from "../../lib/format.js";
import { goalActionLabels, goalEventLabels, goalMetricToProgress, goalProgress, metricMeta } from "./progress-meta.js";
import { MeasurementSheet } from "./MeasurementSheet.js";
import { GoalSheet } from "./GoalSheet.js";
import { GoalDecisionDialog } from "./GoalDecisionDialog.js";

/* ---------------- metric tiles ---------------- */

function MetricTile({ metric, active, values, latest, delta, onSelect }: { metric: ProgressMetric; active: boolean; values: number[]; latest: number | null; delta: number | null; onSelect: () => void }) {
  const meta = metricMeta[metric];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-4 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary ring-1 ring-primary" : "border-border hover:border-input",
      )}
    >
      <span className="text-xs font-semibold text-muted-foreground">{meta.short}</span>
      <span className="flex items-baseline gap-1">
        <span className="text-2xl font-extrabold tabular-nums">{numberFr(latest, 1)}</span>
        {latest !== null ? <span className="text-xs font-semibold text-muted-foreground">{meta.unit}</span> : null}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {delta === null ? "Pas de mesure précédente" : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${numberFr(Math.abs(delta), 2)} ${meta.unit} vs précédente`}
      </span>
      <Sparkline values={values} label={`${meta.label} : ${values.length} mesures`} width={140} height={30} className="mt-1 w-full" />
    </button>
  );
}

/* ---------------- goals ---------------- */

function GoalCard({ goal, onAction }: { goal: CoachingGoal; onAction: (action: GoalAction) => void }) {
  const ratio = goalProgress(goal);
  /* Banner only when the system has a suggestion; otherwise confirming stays available in « ⋯ ». */
  const canConfirm = goal.availableCommands.includes("confirm-outcome") && goal.suggestedStatus !== null;
  const secondary = goal.availableCommands.filter((a) => !(a === "confirm-outcome" && canConfirm));
  const lastEvent = [...goal.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-semibold text-muted-foreground">{goal.category}</span>
          <span className="text-sm font-bold leading-snug">{goal.label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusPill size="sm" status={goalStatus[goal.status]} />
          {secondary.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Décisions pour l'objectif ${goal.label}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {secondary.filter((a) => a !== "cancel").map((a) => (
                  <DropdownMenuItem key={a} onSelect={() => onAction(a)}>{goalActionLabels[a]}</DropdownMenuItem>
                ))}
                {secondary.includes("cancel") ? (
                  <>
                    {secondary.length > 1 ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem destructive onSelect={() => onAction("cancel")}>{goalActionLabels.cancel}</DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {goal.baselineValue !== null && goal.targetValue !== null ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ratio === null ? undefined : Math.round(ratio * 100)} aria-label="Avancement vers la cible">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round((ratio ?? 0) * 100)}%` }} />
          </div>
          <div className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
            <span>Départ {numberFr(goal.baselineValue)} {goal.unit}</span>
            <span className="font-semibold text-foreground">
              {goal.latestMatchingMetric ? `Actuel ${numberFr(goal.latestMatchingMetric.value)} ${goal.unit}` : "Aucune mesure"}
            </span>
            <span>Cible {numberFr(goal.targetValue)} {goal.unit}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Objectif qualitatif — pas de suggestion automatique.</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{goal.targetDate ? `Échéance : ${dateFr(goal.targetDate)}` : "Sans échéance"}</span>
        {goal.coachConfirmedAt ? <span>Résultat confirmé le {dateFr(goal.coachConfirmedAt)}</span> : lastEvent ? <span>{goalEventLabels[lastEvent.eventType] ?? "Décision"} · {shortDateFr(lastEvent.createdAt)}</span> : null}
      </div>

      {canConfirm ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-info-soft p-3">
          <span className="flex-[1_1_180px] text-[13px] text-info">
            Suggestion système : <strong>{goal.suggestedStatus ? goalStatus[goal.suggestedStatus].label : ""}</strong> · à confirmer
          </span>
          <Button size="sm" onClick={() => onAction("confirm-outcome")}>Confirmer le résultat</Button>
        </div>
      ) : null}
    </li>
  );
}

/* ---------------- tab ---------------- */

const historyColumns: ColumnDef<ProgressMeasurement, unknown>[] = [
  { id: "measuredAt", header: "Date", accessorFn: (r) => r.measuredAt, cell: ({ row }) => <span className="whitespace-nowrap font-semibold">{dateFr(row.original.measuredAt)}</span> },
  ...progressMetrics.map(
    (key): ColumnDef<ProgressMeasurement, unknown> => ({
      id: key,
      header: `${metricMeta[key].short} (${metricMeta[key].unit})`,
      accessorFn: (r) => r[key],
      cell: ({ row }) => <span className="tabular-nums">{numberFr(row.original[key])}</span>,
    }),
  ),
  { id: "feelingNote", header: "Ressenti", accessorFn: (r) => r.feelingNote, cell: ({ row }) => <span className="line-clamp-2 max-w-[260px] text-muted-foreground">{row.original.feelingNote ?? "—"}</span> },
];

/** Client profile · Progression (board 03). Same endpoints and rules as the former panel. */
export function ProgressTab({ subscriptionId }: { subscriptionId: string }) {
  const progress = useQuery({ queryKey: ["progress", subscriptionId], queryFn: () => progressApi.progress(subscriptionId), refetchInterval: 30_000 });
  const goals = useQuery({ queryKey: ["goals", subscriptionId], queryFn: () => progressApi.goals(subscriptionId), refetchInterval: 30_000 });
  const [metric, setMetric] = useState<ProgressMetric>("weightKg");
  const [measuring, setMeasuring] = useState(false);
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [decision, setDecision] = useState<{ goalId: string; action: GoalAction } | null>(null);

  const chronological = useMemo(() => [...(progress.data?.progress.measurements ?? [])].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)), [progress.data]);

  if (progress.isPending || goals.isPending) return <p role="status" className="text-sm text-muted-foreground">Chargement de la progression…</p>;
  if (progress.isError || goals.isError) {
    return (
      <EmptyState
        title="Impossible de charger la progression"
        description={progressErrorMessage(progress.error ?? goals.error)}
        action={<Button variant="secondary" onClick={() => void Promise.all([progress.refetch(), goals.refetch()])}>Réessayer</Button>}
      />
    );
  }

  const view = progress.data.progress;
  const goalView = goals.data.goals;
  const meta = metricMeta[metric];
  const series = chronological.filter((m) => m[metric] !== null).map((m) => ({ date: shortDateFr(m.measuredAt), value: m[metric] as number, note: m.feelingNote ?? "" }));
  const references: ReferenceMark[] = goalView.goals
    .filter((g) => g.metricKey && goalMetricToProgress[g.metricKey] === metric && g.targetValue !== null && (g.status === "active" || g.status === "paused"))
    .map((g) => ({ y: g.targetValue as number, label: `Objectif ${numberFr(g.targetValue)} ${meta.unit}`, tone: "goal" }));
  const selectedGoal = goalView.goals.find((g) => g.id === decision?.goalId && g.availableCommands.includes(decision.action)) ?? null;
  const values = series.map((p) => p.value).concat(references.map((r) => r.y));
  const pad = values.length ? Math.max(1, (Math.max(...values) - Math.min(...values)) * 0.15) : 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {view.latestMeasurement ? `Dernière mesure le ${dateFr(view.latestMeasurement.measuredAt)} · ${view.measurements.length} au total` : "Aucune mesure enregistrée."}
        </p>
        <Button onClick={() => setMeasuring(true)} disabled={!view.canRecord}>
          <Plus /> Nouvelle mesure
        </Button>
      </div>
      {!view.canRecord ? (
        <p className="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          Ajout de mesures indisponible : l'abonnement doit être actif ou en pause, avec le consentement actuel aux données de santé accordé. L'historique reste consultable.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {progressMetrics.map((key) => (
          <MetricTile
            key={key}
            metric={key}
            active={key === metric}
            values={chronological.map((m) => m[key]).filter((v): v is number => v !== null)}
            latest={view.metrics[key].latest?.value ?? null}
            delta={view.metrics[key].delta}
            onSelect={() => setMetric(key)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-bold">{meta.label}</h2>
            <span className="text-xs text-muted-foreground">Évolution sur l'abonnement{references.length ? " · ligne pointillée = objectif" : ""}</span>
          </div>
          {series.length < 2 ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">Au moins deux mesures sont nécessaires pour afficher une évolution.</p>
          ) : (
            <TrendLineChart
              data={series}
              xKey="date"
              series={[{ key: "value", label: meta.label }]}
              references={references}
              noteKey="note"
              formatValue={(v) => `${numberFr(v)} ${meta.unit}`}
              label={`${meta.label} : de ${numberFr(series[0]?.value)} à ${numberFr(series[series.length - 1]?.value)} ${meta.unit}`}
              yDomain={[Math.floor(Math.min(...values) - pad), Math.ceil(Math.max(...values) + pad)]}
            />
          )}
        </section>

        <section className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Target className="size-4 text-primary" aria-hidden="true" /> Objectifs
            </h2>
            {goalView.canCreate ? (
              <Button variant="secondary" size="sm" onClick={() => setCreatingGoal(true)}>
                <Plus /> Objectif
              </Button>
            ) : null}
          </div>
          {goalView.goals.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-5 text-center text-[13px] text-muted-foreground">Aucun objectif enregistré.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {goalView.goals.map((g) => (
                <GoalCard key={g.id} goal={g} onAction={(action) => setDecision({ goalId: g.id, action })} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-base font-bold">Historique des mesures</h2>
        <ReadOnlyTable
          columns={historyColumns}
          data={[...chronological].reverse()}
          getRowId={(r) => r.id}
          pageSize={8}
          itemLabel="mesures"
          caption="Historique des mesures, de la plus récente à la plus ancienne"
          emptyTitle="Aucune mesure"
          emptyDescription="Les mesures enregistrées apparaîtront ici."
        />
      </section>

      <MeasurementSheet subscriptionId={subscriptionId} open={measuring} onOpenChange={setMeasuring} />
      <GoalSheet subscriptionId={subscriptionId} open={creatingGoal} onOpenChange={setCreatingGoal} />
      <GoalDecisionDialog goal={selectedGoal} action={selectedGoal ? (decision?.action ?? null) : null} onClose={() => setDecision(null)} />
    </div>
  );
}
