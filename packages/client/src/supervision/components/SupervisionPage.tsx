import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  DatabaseBackup,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  blockSeverity,
  EMPTY_VALUE,
  formatAge,
  formatBytes,
  formatDuration,
  formatRate,
  hoursSince,
  jobRows,
  jobStateDisplay,
  manualRunText,
  onTimeCount,
  purgeSimulationText,
  securityColumns,
  securityTotal,
  type SupervisionAlertSeverity,
  type SupervisionJobRow,
  type SupervisionOverviewResponse,
  type SupervisionPurgeSimulationResponse,
  type SupervisionSecurityPeriod,
} from "@kfit/shared";
import { AdminNotFound } from "../../app/layout/AdminNotFound.js";
import { AdminPage } from "../../app/layout/AdminPage.js";
import {
  StackedColumnChart,
  type ColumnSeries,
} from "../../components/charts/stacked-column-chart.js";
import { chartColors } from "../../components/charts/chart-colors.js";
import { Button } from "../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
} from "../../components/ui/dialog.js";
import { SegmentedControl } from "../../components/ui/segmented-control.js";
import { Pill } from "../../components/ui/status-pill.js";
import { dateTimeFr, timeFr } from "../../lib/format.js";
import { cn } from "../../lib/utils.js";
import {
  isSupervisionForbidden,
  supervisionApi,
  supervisionErrorMessage,
  supervisionKeys,
} from "../api/supervision-api.js";

/** S1: refreshed every minute while the tab is visible (react-query pauses intervals in a hidden tab). */
const REFRESH_MS = 60_000;
const CHART_HEIGHT = 180;
const LOAD_FAILED = "Impossible de charger la supervision. Réessaie.";

/** Two colour families (board 01b): refusals in green shades, abuse signals in grey shades. */
const securitySeries: ColumnSeries[] = [
  {
    key: "loginRejected",
    label: "Connexions refusées",
    color: chartColors.primary,
  },
  { key: "otpFailed", label: "Codes faux", color: chartColors.primaryMuted },
  {
    key: "otpLocked",
    label: "Comptes bloqués",
    color: "rgb(46 106 46 / 0.30)",
  },
  { key: "rateLimited", label: "429", color: chartColors.reference },
  { key: "encodingRejected", label: "415", color: "rgb(123 135 122 / 0.60)" },
  {
    key: "publicLinkInvalid",
    label: "Liens invalides",
    color: "rgb(123 135 122 / 0.30)",
  },
];
const families = [
  {
    label: "Connexions refusées · codes faux · comptes bloqués",
    color: chartColors.primary,
  },
  { label: "429 · 415 · liens invalides", color: chartColors.reference },
];

const toneBorder = (severity: SupervisionAlertSeverity | null) =>
  severity === "critical"
    ? "border-danger/60 bg-danger-soft/40"
    : severity === "warning"
      ? "border-warning/60 bg-warning-soft/40"
      : "border-border";

function Tile({
  label,
  value,
  note,
  icon: Icon,
  severity,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  severity: SupervisionAlertSeverity | null;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-4",
        toneBorder(severity),
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-muted-foreground">
          {label}
        </span>
        <Icon
          className={cn(
            "size-4 shrink-0",
            severity === "critical"
              ? "text-danger"
              : severity === "warning"
                ? "text-warning"
                : "text-muted-foreground",
          )}
          aria-hidden="true"
        />
      </div>
      <span className="text-lg font-extrabold leading-tight tracking-tight">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </div>
  );
}

function AlertsBanner({ overview }: { overview: SupervisionOverviewResponse }) {
  if (!overview.alerts.length) return null;
  return (
    <div role="status" className="flex flex-col gap-1.5">
      {overview.alerts.map((alert) => (
        <p
          key={`${alert.code}:${alert.jobKey ?? ""}`}
          className={cn(
            "rounded-md border px-3 py-2 text-[13px] font-medium",
            alert.severity === "critical"
              ? "border-danger/30 bg-danger-soft text-danger"
              : "border-warning/30 bg-warning-soft text-warning",
          )}
        >
          {alert.message}
        </p>
      ))}
    </div>
  );
}

function SummaryTiles({
  overview,
  rows,
}: {
  overview: SupervisionOverviewResponse;
  rows: SupervisionJobRow[];
}) {
  const now = new Date(overview.generatedAt);
  const { backup, restoreCheck, runtime, alerts } = overview;
  const restoreLabel = restoreCheck
    ? restoreCheck.status === "succeeded"
      ? "Réussi"
      : restoreCheck.status === "failed"
        ? "En échec"
        : "En cours"
    : "Jamais exécuté";
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="Jobs"
        value={`${onTimeCount(rows)} / ${rows.length}`}
        note="à l'heure"
        icon={Activity}
        severity={blockSeverity(alerts, "jobs")}
      />
      <Tile
        label="Dernière sauvegarde"
        value={formatAge(backup.ageHours)}
        note={
          backup.lastSucceededAt
            ? `${formatBytes(backup.bytes)} · ${backup.secondaryVerified ? "copie vérifiée" : "copie non vérifiée"}`
            : EMPTY_VALUE
        }
        icon={DatabaseBackup}
        severity={blockSeverity(alerts, "backup")}
      />
      <Tile
        label="Contrôle de restauration"
        value={restoreLabel}
        note={
          restoreCheck
            ? `${formatAge(hoursSince(restoreCheck.at, now))} · ${restoreCheck.tablesMatched ?? EMPTY_VALUE} tables`
            : EMPTY_VALUE
        }
        icon={History}
        severity={blockSeverity(alerts, "restore")}
      />
      <Tile
        label="Plancher de sécurité"
        value={runtime.floor.ok ? "OK" : "Non respecté"}
        note={`Node ${runtime.nodeVersion} · ${runtime.mode === "production" ? "production" : "développement"}`}
        icon={ShieldCheck}
        severity={blockSeverity(alerts, "floor")}
      />
    </div>
  );
}

function JobAction({
  row,
  running,
  onRun,
  onSimulate,
}: {
  row: SupervisionJobRow;
  running: boolean;
  onRun: (jobKey: string) => void;
  onSimulate: () => void;
}) {
  if (row.action === "run")
    return (
      <Button
        size="sm"
        variant="secondary"
        disabled={running}
        onClick={() => onRun(row.key)}
      >
        {running ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : null}
        Lancer maintenant
      </Button>
    );
  if (row.action === "simulate")
    return (
      <Button
        size="sm"
        variant="secondary"
        disabled={running}
        onClick={onSimulate}
      >
        {running ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : null}
        Simuler
      </Button>
    );
  return <span className="text-sm text-muted-foreground">{EMPTY_VALUE}</span>;
}

function JobsCard({ rows }: { rows: SupervisionJobRow[] }) {
  const queryClient = useQueryClient();
  const [simulation, setSimulation] =
    useState<SupervisionPurgeSimulationResponse | null>(null);
  const run = useMutation({
    mutationFn: (jobKey: string) => supervisionApi.runJob(jobKey),
    onSuccess: (result) => {
      toast.success(manualRunText(result));
      void queryClient.invalidateQueries({
        queryKey: supervisionKeys.overview,
      });
      void queryClient.invalidateQueries({ queryKey: supervisionKeys.status });
    },
    onError: (error) => toast.error(supervisionErrorMessage(error)),
  });
  const simulate = useMutation({
    mutationFn: () => supervisionApi.simulatePurge(),
    onSuccess: setSimulation,
    onError: (error) => toast.error(supervisionErrorMessage(error)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Jobs planifiés</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rows.map((row) => {
          const state = jobStateDisplay[row.state];
          return (
            <div
              key={row.key}
              className="flex flex-col gap-2 rounded-lg border border-border p-3 md:grid md:grid-cols-[minmax(0,2fr)_auto_minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center md:gap-4"
            >
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold">{row.label}</span>
                <span className="text-xs text-muted-foreground">
                  {row.interval} · échecs 30 j :{" "}
                  {formatRate(row.failureRate30d)}
                </span>
              </div>
              <Pill tone={state.tone} className="w-fit">
                {state.label}
              </Pill>
              <span className="text-xs text-muted-foreground">
                Dernière exécution : {dateTimeFr(row.lastRunAt)}
                {row.durationMs !== null
                  ? ` · ${formatDuration(row.durationMs)}`
                  : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                Prochaine : {dateTimeFr(row.nextRunAt)}
              </span>
              <JobAction
                row={row}
                running={
                  (run.isPending && run.variables === row.key) ||
                  (row.action === "simulate" && simulate.isPending)
                }
                onRun={(jobKey) => run.mutate(jobKey)}
                onSimulate={() => simulate.mutate()}
              />
            </div>
          );
        })}
      </CardContent>
      <Dialog
        open={simulation !== null}
        onOpenChange={(open) => (open ? undefined : setSimulation(null))}
      >
        <DialogContent
          title="Simulation de la suppression des fichiers"
          footer={
            <DialogClose asChild>
              <Button variant="secondary">Fermer</Button>
            </DialogClose>
          }
        >
          {simulation ? (
            <div className="flex flex-col gap-2 text-sm">
              <p>{purgeSimulationText(simulation)}</p>
              <p className="font-semibold">Rien n'a été supprimé.</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PrivacyCard({ overview }: { overview: SupervisionOverviewResponse }) {
  const { privacy } = overview;
  const severity = blockSeverity(overview.alerts, "privacy");
  const journal = !privacy.journal.configured
    ? "Non configuré"
    : privacy.journal.writable
      ? "OK"
      : "Indisponible";
  const rows: Array<[string, string]> = [
    ["Journal", journal],
    ["Blocages actifs", String(privacy.activeHolds)],
    ["Purges dans 7 j", String(privacy.purgesDue7d)],
    ["Personnes anonymisées", String(privacy.anonymizedTotal)],
    ["Dernier rejeu", dateTimeFr(privacy.lastReplay?.at)],
  ];
  return (
    <Card className={cn(severity ? toneBorder(severity) : undefined)}>
      <CardHeader>
        <CardTitle>Confidentialité</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 border-t border-border-subtle py-2 text-sm first:border-t-0"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function SecurityCard() {
  const [days, setDays] = useState<SupervisionSecurityPeriod>(7);
  const security = useQuery({
    queryKey: supervisionKeys.security(days),
    queryFn: () => supervisionApi.security(days),
    refetchInterval: REFRESH_MS,
  });
  const columns = security.data ? securityColumns(security.data) : [];
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>Sécurité</CardTitle>
          <CardDescription>
            Refus par jour (heure de Libreville)
          </CardDescription>
        </div>
        <SegmentedControl
          size="sm"
          aria-label="Période"
          value={days === 30 ? "30" : "7"}
          onValueChange={(value) => setDays(value === "30" ? 30 : 7)}
          options={[
            { value: "7", label: "7 j" },
            { value: "30", label: "30 j" },
          ]}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold">
          {families.map((family) => (
            <li key={family.label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-[3px]"
                style={{ background: family.color }}
              />
              {family.label}
            </li>
          ))}
        </ul>
        {security.isError ? (
          <p className="text-sm text-danger">
            {supervisionErrorMessage(security.error)}
          </p>
        ) : !security.data ? (
          <p
            role="status"
            className="text-sm text-muted-foreground"
            style={{ minHeight: CHART_HEIGHT }}
          >
            Chargement…
          </p>
        ) : securityTotal(columns) === 0 ? (
          <p
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ minHeight: CHART_HEIGHT }}
          >
            Aucun événement sur la période.
          </p>
        ) : (
          <StackedColumnChart
            data={columns}
            xKey="date"
            series={securitySeries}
            label={`Refus de sécurité sur ${days} jours`}
            height={CHART_HEIGHT}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** OPS-01b « Supervision » (superadmin only, S1-S8). The API returns counts, dates and codes only. */
export function SupervisionPage() {
  const queryClient = useQueryClient();
  const overview = useQuery({
    queryKey: supervisionKeys.overview,
    queryFn: () => supervisionApi.overview(),
    refetchInterval: REFRESH_MS,
    retry: (failures, error) => !isSupervisionForbidden(error) && failures < 2,
  });
  if (overview.isError && isSupervisionForbidden(overview.error))
    return <AdminNotFound />;
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["supervision"] });

  return (
    <AdminPage
      title="Supervision"
      {...(overview.dataUpdatedAt
        ? {
            description: `Mis à jour à ${timeFr(new Date(overview.dataUpdatedAt).toISOString())}`,
          }
        : {})}
      actions={
        <Button
          variant="secondary"
          onClick={refresh}
          disabled={overview.isFetching}
        >
          <RefreshCw
            className={cn("size-4", overview.isFetching && "animate-spin")}
            aria-hidden="true"
          />
          Actualiser
        </Button>
      }
    >
      {overview.isError && !overview.data ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
          <p className="text-sm font-medium text-danger">{LOAD_FAILED}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void overview.refetch()}
          >
            Réessayer
          </Button>
        </div>
      ) : !overview.data ? (
        <p role="status" className="text-sm text-muted-foreground">
          Chargement…
        </p>
      ) : (
        <SupervisionContent overview={overview.data} />
      )}
    </AdminPage>
  );
}

function SupervisionContent({
  overview,
}: {
  overview: SupervisionOverviewResponse;
}) {
  const rows = jobRows(overview);
  return (
    <div className="flex flex-col gap-5">
      <AlertsBanner overview={overview} />
      <SummaryTiles overview={overview} rows={rows} />
      <JobsCard rows={rows} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <PrivacyCard overview={overview} />
        <SecurityCard />
      </div>
    </div>
  );
}
