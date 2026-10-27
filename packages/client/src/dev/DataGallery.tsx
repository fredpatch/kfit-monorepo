import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  AlertTriangle,
  Calendar,
  Inbox,
  MoreHorizontal,
  Plus,
  Users,
} from "lucide-react";
import {
  DataTable,
  ReadOnlyTable,
  SortHeader,
} from "../components/data-table/data-table.js";
import { KpiTile } from "../components/charts/kpi-tile.js";
import { ChartCard } from "../components/charts/chart-card.js";
import { SimpleBarChart } from "../components/charts/bar-chart.js";
import { TrendLineChart } from "../components/charts/line-chart.js";
import { StackedBar } from "../components/charts/stacked-bar.js";
import { Avatar } from "../components/ui/avatar.js";
import { Button } from "../components/ui/button.js";
import { SegmentedControl } from "../components/ui/segmented-control.js";
import { StatusPill } from "../components/ui/status-pill.js";
import {
  cadenceState,
  describeStatus,
  subscriptionStatus,
} from "../lib/status-map.js";
import { familyMeta, type OfferFamily } from "../lib/families.js";

/* DEV-only sample data (board 01b). Names are fictitious. */
type SampleClient = {
  id: string;
  name: string;
  phone: string;
  offer: string;
  family: OfferFamily;
  status: string;
  cadence: "healthy" | "due" | "overdue";
  overdueDays: number;
  next: string;
  lastContactDays: number;
};

const clients: SampleClient[] = [
  [
    "Arnaud Mba",
    "+241 07 41 22 18",
    "Programme sportif 12 sem.",
    "transpitime",
    "active",
    "overdue",
    6,
    "Auj. 19:00",
    6,
  ],
  [
    "Grâce Moussavou",
    "+241 06 88 10 45",
    "Coaching nutrition · Premium",
    "nutrition",
    "active",
    "overdue",
    4,
    "Auj. 11:30",
    11,
  ],
  [
    "Kevin Nzé",
    "+241 07 20 93 61",
    "Transpitime · 3×/sem.",
    "transpitime",
    "active",
    "overdue",
    1,
    "Auj. 09:00",
    8,
  ],
  [
    "Mireille Ndong",
    "+241 06 15 77 02",
    "Coaching nutrition · Standard",
    "nutrition",
    "completion_due",
    "healthy",
    0,
    "-",
    2,
  ],
  [
    "Sandrine Obiang",
    "+241 07 63 40 19",
    "Pilates découverte",
    "pilates",
    "onboarding",
    "healthy",
    0,
    "29 oct. 17:00",
    1,
  ],
  [
    "Rodrigue Lekogo",
    "+241 06 02 58 74",
    "Pack premium · 3 mois",
    "pack",
    "paused",
    "healthy",
    0,
    "-",
    12,
  ],
  [
    "Brice Nguema",
    "+241 06 90 12 37",
    "Transpitime · 2×/sem.",
    "transpitime",
    "active",
    "healthy",
    0,
    "Ven. 07:00",
    1,
  ],
  [
    "Larissa Bivigou",
    "+241 06 33 71 04",
    "Pack premium · 3 mois",
    "pack",
    "active",
    "due",
    0,
    "Lun. 18:00",
    7,
  ],
  [
    "Nadia Obame",
    "+27 72 418 5530",
    "Pilates · 8 séances",
    "pilates",
    "active",
    "healthy",
    0,
    "Jeu. 17:30",
    3,
  ],
  [
    "Estelle Assoumou",
    "+241 07 11 52 80",
    "Coaching nutrition · Standard",
    "nutrition",
    "active",
    "healthy",
    0,
    "Mer. 08:30",
    2,
  ],
  [
    "Jordan Mintsa",
    "+241 06 47 03 99",
    "Programme sportif 12 sem.",
    "transpitime",
    "active",
    "due",
    0,
    "Sam. 10:00",
    6,
  ],
].map(
  (
    [
      name,
      phone,
      offer,
      family,
      status,
      cadence,
      overdueDays,
      next,
      lastContactDays,
    ],
    i,
  ) => ({
    id: String(i),
    name: name as string,
    phone: phone as string,
    offer: offer as string,
    family: family as OfferFamily,
    status: status as string,
    cadence: cadence as SampleClient["cadence"],
    overdueDays: overdueDays as number,
    next: next as string,
    lastContactDays: lastContactDays as number,
  }),
);

type HistoryRow = {
  id: string;
  date: string;
  subject: string;
  from: string;
  to: string;
  actor: string;
  reason: string;
};
const history: HistoryRow[] = [
  ["21/10/2026 14:35", "SUB-0012", "Prêt à démarrer", "Actif", "Coach", "-"],
  [
    "21/10/2026 14:35",
    "SUB-0012",
    "En préparation",
    "Prêt à démarrer",
    "Coach",
    "Checklist complète",
  ],
  [
    "20/10/2026 18:02",
    "RDV 20/10 18:00",
    "Planifié",
    "Report demandé",
    "Cliente",
    "Déplacement professionnel",
  ],
  [
    "19/10/2026 09:14",
    "SUB-0009",
    "Actif",
    "En pause",
    "Coach",
    "Blessure au genou",
  ],
  [
    "18/10/2026 21:40",
    "REQ-0031",
    "Contact en cours",
    "Abandonnée",
    "Coach",
    "Sans réponse après 3 relances",
  ],
  ["17/10/2026 16:22", "SUB-0011", "Création", "En préparation", "Coach", "-"],
  [
    "16/10/2026 10:05",
    "REQ-0030",
    "Nouvelle",
    "Contact en cours",
    "Coach",
    "-",
  ],
  [
    "15/10/2026 08:40",
    "SUB-0007",
    "Revue de fin",
    "Terminé",
    "Coach",
    "Objectifs atteints",
  ],
  [
    "14/10/2026 19:12",
    "RDV 14/10 19:00",
    "Planifié",
    "Confirmé",
    "Cliente",
    "-",
  ],
].map(([date, subject, from, to, actor, reason], i) => ({
  id: String(i),
  date: date!,
  subject: subject!,
  from: from!,
  to: to!,
  actor: actor!,
  reason: reason!,
}));

const weeks = [
  ["S36", 3],
  ["S37", 5],
  ["S38", 4],
  ["S39", 7],
  ["S40", 6],
  ["S41", 9],
  ["S42", 8],
  ["S43", 5],
].map(([label, value]) => ({ label: label as string, value: value as number }));
const daysSince = Array.from({ length: 30 }, (_, d) => {
  const contacts = [0, 2, 4, 7, 9, 11, 14, 16, 17, 18];
  const last = Math.max(...contacts.filter((c) => c <= d));
  const date = new Date(2026, 8, 22 + d);
  return {
    day: date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
    jours: d - last,
  };
});

export function DataGallery() {
  const [period, setPeriod] = useState<"4" | "8" | "12m">("8");

  const columns = useMemo<ColumnDef<SampleClient, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        meta: { label: "Client" },
        enableHiding: false,
        header: ({ column }) => <SortHeader column={column} title="Client" />,
        cell: ({ row }) => (
          <span className="flex items-center gap-2.5">
            <Avatar name={row.original.name} size="sm" />
            <span className="flex flex-col">
              <span className="font-bold">{row.original.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {row.original.phone}
              </span>
            </span>
          </span>
        ),
      },
      {
        accessorKey: "family",
        meta: { label: "Offre" },
        filterFn: "facet",
        header: "Offre",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`size-2 rounded-[2px] ${familyMeta[row.original.family].dotClass}`}
            />
            {row.original.offer}
          </span>
        ),
      },
      {
        accessorKey: "status",
        meta: { label: "Statut" },
        filterFn: "facet",
        header: "Statut",
        cell: ({ row }) => (
          <StatusPill
            status={describeStatus(subscriptionStatus, row.original.status)}
          />
        ),
      },
      {
        accessorKey: "next",
        meta: { label: "Prochain RDV" },
        header: "Prochain RDV",
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{String(getValue())}</span>
        ),
      },
      {
        accessorKey: "lastContactDays",
        meta: { label: "Dernier contact" },
        header: ({ column }) => (
          <SortHeader column={column} title="Dernier contact" />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            il y a {row.original.lastContactDays} j
          </span>
        ),
      },
      {
        accessorKey: "cadence",
        meta: { label: "Suivi" },
        filterFn: "facet",
        header: "Suivi",
        cell: ({ row }) => {
          const c = row.original;
          const s = cadenceState[c.cadence];
          return (
            <span
              className={`text-xs font-bold ${s.tone === "danger" ? "text-danger" : s.tone === "warning" ? "text-warning" : "text-success"}`}
            >
              {c.cadence === "overdue"
                ? `En retard · ${c.overdueDays} j`
                : s.label}
            </span>
          );
        },
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions pour ${row.original.name}`}
            className="text-muted-foreground"
          >
            <MoreHorizontal />
          </Button>
        ),
      },
    ],
    [],
  );

  const historyColumns = useMemo<ColumnDef<HistoryRow, unknown>[]>(
    () => [
      {
        accessorKey: "date",
        header: ({ column }) => <SortHeader column={column} title="Date" />,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-muted-foreground tabular-nums">
            {String(getValue())}
          </span>
        ),
      },
      {
        accessorKey: "subject",
        header: "Objet",
        cell: ({ getValue }) => (
          <span className="font-semibold">{String(getValue())}</span>
        ),
      },
      {
        id: "transition",
        header: "Transition",
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            <span className="text-muted-foreground">{row.original.from}</span> →{" "}
            <strong>{row.original.to}</strong>
          </span>
        ),
      },
      {
        accessorKey: "actor",
        header: "Acteur",
        filterFn: "facet",
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{String(getValue())}</span>
        ),
      },
      {
        accessorKey: "reason",
        header: "Motif",
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{String(getValue())}</span>
        ),
      },
    ],
    [],
  );

  const mix = (["transpitime", "nutrition", "pilates", "pack"] as const).map(
    (f, i) => ({
      key: f,
      label: familyMeta[f].label,
      value: [6, 7, 3, 2][i] ?? 0,
      color: familyMeta[f].colorVar,
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-extrabold tracking-tight">UX-3 · Données</h2>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <KpiTile
          label="Clients actifs"
          value="18"
          icon={Users}
          tone="success"
          note="+12 % vs période précédente"
          noteTone="success"
          trend={[12, 13, 13, 14, 15, 15, 17, 18]}
          trendLabel="Clients actifs sur 8 semaines : de 12 à 18"
        />
        <KpiTile
          label="Suivis en retard"
          value="3"
          icon={AlertTriangle}
          tone="danger"
          note="Le plus ancien : 6 jours"
          noteTone="danger"
          trend={[1, 0, 2, 1, 1, 3, 2, 3]}
        />
        <KpiTile
          label="Nouvelles demandes"
          value="5"
          icon={Inbox}
          tone="info"
          note="Cette semaine · 2 à contacter"
          trend={[3, 5, 4, 7, 6, 9, 8, 5]}
        />
        <KpiTile
          label="Séances réalisées"
          value="21"
          icon={Calendar}
          tone="warning"
          note="Cette semaine"
          trend={[14, 16, 15, 18, 17, 19, 20, 21]}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ChartCard
          title="Nouvelles demandes"
          description="47 sur 8 semaines"
          actions={
            <SegmentedControl
              size="sm"
              aria-label="Période"
              value={period}
              onValueChange={setPeriod}
              options={[
                { value: "4", label: "4 sem." },
                { value: "8", label: "8 sem." },
                { value: "12m", label: "12 mois" },
              ]}
            />
          }
          table={{
            columns: ["Semaine", "Demandes"],
            rows: weeks.map((w) => ({ label: w.label, values: [w.value] })),
          }}
        >
          <SimpleBarChart
            data={weeks}
            formatValue={(v) => `${v} demandes`}
            label="Nouvelles demandes par semaine, de 3 à 9"
          />
        </ChartCard>
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-bold">Clients actifs par offre</h2>
            <p className="text-[13px] text-muted-foreground">
              18 clients · répartition actuelle
            </p>
          </div>
          <StackedBar
            segments={mix}
            label="Clients actifs par offre : Transpitime 6, Nutrition 7, Pilates 3, Packs 2"
            layout="list"
          />
        </section>
      </div>

      <ChartCard
        title="Jours depuis le dernier contact"
        description="Seuil = cadence de l'offre (7 jours)"
        table={{
          columns: ["Jour", "Jours sans contact"],
          rows: daysSince.map((d) => ({ label: d.day, values: [d.jours] })),
        }}
      >
        <TrendLineChart
          data={daysSince}
          xKey="day"
          series={[{ key: "jours", label: "Jours sans contact" }]}
          references={[{ y: 7, label: "Cadence : 7 jours", tone: "threshold" }]}
          formatValue={(v) => `${v} jours`}
          label="Jours depuis le dernier contact, seuil de 7 jours dépassé depuis le 18 octobre"
        />
      </ChartCard>

      <DataTable
        columns={columns}
        data={clients}
        getRowId={(c) => c.id}
        searchPlaceholder="Nom ou numéro WhatsApp…"
        searchText={(c) => `${c.name} ${c.phone}`}
        facets={[
          {
            columnId: "status",
            title: "Statut",
            options: ["active", "onboarding", "paused", "completion_due"].map(
              (v) => ({
                value: v,
                label:
                  subscriptionStatus[v as keyof typeof subscriptionStatus]
                    .label,
              }),
            ),
          },
          {
            columnId: "family",
            title: "Offre",
            options: (
              ["transpitime", "nutrition", "pilates", "pack"] as const
            ).map((f) => ({ value: f, label: familyMeta[f].label })),
          },
          {
            columnId: "cadence",
            title: "Suivi",
            options: [
              { value: "overdue", label: "En retard" },
              { value: "due", label: "À faire" },
              { value: "healthy", label: "À jour" },
            ],
          },
        ]}
        selectable
        bulkActions={(rows, clear) => (
          <>
            <Button
              size="sm"
              onClick={() =>
                toast.success(`${rows.length} clients exportés (démo).`)
              }
            >
              Exporter CSV
            </Button>
            <Button
              size="sm"
              onClick={() => {
                toast.success("Suivi planifié (démo).");
                clear();
              }}
            >
              Planifier un suivi
            </Button>
          </>
        )}
        columnToggle
        toolbarActions={
          <Button size="sm" className="h-9">
            <Plus />
            Nouveau client
          </Button>
        }
        itemLabel="clients"
        caption="Clients"
        mobileCard={(c) => (
          <div className="flex flex-col gap-2.5 rounded-xl border border-border p-3.5">
            <div className="flex items-center gap-3">
              <Avatar name={c.name} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-bold">{c.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-[2px] ${familyMeta[c.family].dotClass}`}
                  />
                  {c.offer}
                </span>
              </div>
              <StatusPill
                size="sm"
                status={describeStatus(subscriptionStatus, c.status)}
              />
            </div>
            <div className="flex justify-between border-t border-border-subtle pt-2.5 text-xs">
              <span className="text-muted-foreground">
                RDV : <strong className="text-foreground">{c.next}</strong>
              </span>
              <span
                className={`font-bold ${c.cadence === "overdue" ? "text-danger" : "text-success"}`}
              >
                {c.cadence === "overdue"
                  ? `En retard · ${c.overdueDays} j`
                  : cadenceState[c.cadence].label}
              </span>
            </div>
          </div>
        )}
      />

      <ReadOnlyTable
        columns={historyColumns}
        data={history}
        getRowId={(h) => h.id}
        searchPlaceholder="Rechercher un motif…"
        searchText={(h) => `${h.subject} ${h.reason}`}
        facets={[
          {
            columnId: "actor",
            title: "Acteur",
            options: [
              { value: "Coach", label: "Coach" },
              { value: "Cliente", label: "Cliente" },
            ],
          },
        ]}
        caption="Historique des décisions"
        pageSize={6}
      />
    </div>
  );
}
