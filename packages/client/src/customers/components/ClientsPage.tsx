import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, useNavigate, useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { MessageCircle, MoreHorizontal, Plus, UserRound } from "lucide-react";
import { customerOverviewViews, type AdminCustomerOverviewRow, type CustomerOverviewView } from "@kfit/shared";
import { customerErrorMessage, customersApi } from "../api/customers-api.js";
import { AdminPage } from "../../app/layout/AdminPage.js";
import { DataTable, SortHeader } from "../../components/data-table/data-table.js";
import { Avatar } from "../../components/ui/avatar.js";
import { Button } from "../../components/ui/button.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { cn } from "../../lib/utils.js";
import { clientStatus } from "../../lib/client-status.js";
import { familyMeta, familyOfSlug, offerFamilies } from "../../lib/families.js";
import { dateTimeFr, relativeDaysFr } from "../../lib/format.js";
import { NewCustomerSheet } from "./NewCustomerSheet.js";

const viewLabels: Record<CustomerOverviewView, string> = {
  all: "Tous",
  active: "Actifs",
  overdue: "Suivi en retard",
  preparation: "En préparation",
  paused: "En pause",
  former: "Anciens clients",
};
const viewParam: Record<CustomerOverviewView, string> = { all: "tous", active: "actifs", overdue: "en-retard", preparation: "en-preparation", paused: "en-pause", former: "anciens" };

/** Flattened row for sorting / faceting. */
type Row = AdminCustomerOverviewRow & { family: string; cadenceKey: string; lastContactMs: number; nextMs: number | undefined };

const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;

function CadenceText({ cadence }: { cadence: AdminCustomerOverviewRow["cadence"] }) {
  if (!cadence) return <span className="text-muted-foreground">—</span>;
  if (cadence.state === "overdue") return <span className="whitespace-nowrap text-xs font-bold text-danger">En retard · {cadence.overdueByDays ?? 0} j</span>;
  if (cadence.state === "due") return <span className="whitespace-nowrap text-xs font-bold text-warning">À faire</span>;
  return <span className="whitespace-nowrap text-xs font-bold text-success">À jour</span>;
}

function Offer({ row }: { row: AdminCustomerOverviewRow }) {
  const sub = row.currentSubscription;
  if (!sub) return <span className="text-muted-foreground">Aucun abonnement</span>;
  return (
    <span className="flex min-w-0 max-w-full items-center gap-1.5">
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-[2px]", familyMeta[familyOfSlug(sub.serviceSlug)].dotClass)} />
      <span className="truncate">
        {sub.serviceName}
        {sub.variantName ? ` · ${sub.variantName}` : ""}
      </span>
      {row.otherOpenSubscriptions > 0 ? (
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] font-bold text-muted-foreground" title={`${row.otherOpenSubscriptions} autre(s) abonnement(s) en cours`}>
          +{row.otherOpenSubscriptions}
        </span>
      ) : null}
    </span>
  );
}

function RowActions({ row }: { row: AdminCustomerOverviewRow }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${row.customer.fullName}`} className="text-muted-foreground">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => navigate(`/admin/clients/${row.customer.id}`)}>
          <UserRound /> Ouvrir la fiche
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.open(waLink(row.customer.whatsapp), "_blank", "noopener,noreferrer")}>
          <MessageCircle /> Écrire sur WhatsApp
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const columns: ColumnDef<Row, unknown>[] = [
  {
    id: "name",
    accessorFn: (r) => r.customer.fullName,
    meta: { label: "Client" },
    enableHiding: false,
    header: ({ column }) => <SortHeader column={column} title="Client" />,
    cell: ({ row }) => (
      <NavLink to={`/admin/clients/${row.original.customer.id}`} className="group flex items-center gap-2.5">
        <Avatar name={row.original.customer.fullName} size="sm" />
        <span className="flex min-w-0 flex-col">
          <span className="font-bold group-hover:underline">{row.original.customer.fullName}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{row.original.customer.whatsapp}</span>
        </span>
      </NavLink>
    ),
  },
  { id: "family", accessorKey: "family", meta: { label: "Abonnement en cours" }, filterFn: "facet", header: "Abonnement en cours", cell: ({ row }) => <span className="block w-[240px] max-w-[240px]"><Offer row={row.original} /></span> },
  { id: "status", accessorFn: (r) => r.clientStatus, meta: { label: "Statut" }, header: "Statut", cell: ({ row }) => <StatusPill size="sm" status={clientStatus[row.original.clientStatus]} /> },
  { id: "cadence", accessorKey: "cadenceKey", meta: { label: "Suivi" }, filterFn: "facet", header: "Suivi", cell: ({ row }) => <CadenceText cadence={row.original.cadence} /> },
  {
    id: "next",
    accessorKey: "nextMs",
    meta: { label: "Prochain RDV" },
    sortUndefined: "last",
    header: ({ column }) => <SortHeader column={column} title="Prochain RDV" />,
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.nextAppointment ? dateTimeFr(row.original.nextAppointment.scheduledStart) : <span className="text-muted-foreground">—</span>}</span>,
  },
  {
    id: "lastContact",
    accessorKey: "lastContactMs",
    meta: { label: "Dernier contact" },
    header: ({ column }) => <SortHeader column={column} title="Dernier contact" />,
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{relativeDaysFr(row.original.lastContactAt)}</span>,
  },
  { id: "city", accessorFn: (r) => r.customer.city ?? "", meta: { label: "Ville" }, header: "Ville", cell: ({ row }) => <span className="text-muted-foreground">{row.original.customer.city ?? "—"}</span> },
  { id: "actions", enableHiding: false, enableSorting: false, header: () => <span className="sr-only">Actions</span>, cell: ({ row }) => <RowActions row={row.original} /> },
];

function MobileCard({ row }: { row: Row }) {
  return (
    <NavLink to={`/admin/clients/${row.customer.id}`} className="flex flex-col gap-2.5 rounded-xl border border-border p-3.5 active:bg-muted">
      <div className="flex items-center gap-3">
        <Avatar name={row.customer.fullName} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-bold">{row.customer.fullName}</span>
          <span className="text-xs text-muted-foreground"><Offer row={row} /></span>
        </div>
        <StatusPill size="sm" status={clientStatus[row.clientStatus]} />
      </div>
      <div className="flex justify-between gap-2 border-t border-border-subtle pt-2.5 text-xs">
        <span className="text-muted-foreground">
          RDV : <strong className="text-foreground">{row.nextAppointment ? dateTimeFr(row.nextAppointment.scheduledStart) : "—"}</strong>
        </span>
        <CadenceText cadence={row.cadence} />
      </div>
    </NavLink>
  );
}

/** Clients (boards 04, 04b). Data: GET /admin/customers/overview (rules validated 2026-10-22). */
export function ClientsPage() {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const query = useQuery({ queryKey: ["customers", "overview"], queryFn: () => customersApi.overview(), refetchInterval: 60_000 });
  const view = customerOverviewViews.find((v) => viewParam[v] === params.get("vue")) ?? "all";

  const rows = useMemo<Row[]>(
    () =>
      (query.data?.customers ?? []).map((r) => ({
        ...r,
        family: r.currentSubscription ? familyOfSlug(r.currentSubscription.serviceSlug) : "none",
        cadenceKey: r.cadence?.state ?? "none",
        lastContactMs: r.lastContactAt ? new Date(r.lastContactAt).getTime() : 0,
        // Undefined sorts last: clients without an upcoming appointment go to the end.
        nextMs: r.nextAppointment ? new Date(r.nextAppointment.scheduledStart).getTime() : undefined,
      })),
    [query.data],
  );
  const visible = useMemo(() => rows.filter((r) => r.views.includes(view)), [rows, view]);
  const counts = query.data?.counts;

  const setView = (next: CustomerOverviewView) => {
    const merged = new URLSearchParams(params);
    if (next === "all") merged.delete("vue");
    else merged.set("vue", viewParam[next]);
    setParams(merged, { replace: true });
  };

  return (
    <AdminPage
      title="Clients"
      description={counts ? `${counts.all} fiche(s) · ${counts.active} avec un abonnement actif` : "Fiches clients et suivi"}
      actions={
        <Button onClick={() => setCreating(true)}>
          <Plus /> Nouveau client
        </Button>
      }
    >
      {query.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">Chargement des clients…</p>
      ) : query.isError ? (
        <EmptyState title="Impossible de charger les clients" description={customerErrorMessage(query.error)} action={<Button variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button>} />
      ) : (
        <div className="flex flex-col gap-4">
          <div role="group" aria-label="Vues" className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1">
            {customerOverviewViews.map((v) => {
              const selected = v === view;
              const hot = v === "overdue" && (counts?.overdue ?? 0) > 0;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setView(v)}
                  className={cn(
                    "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "border-primary font-bold text-foreground" : "border-transparent font-semibold text-muted-foreground hover:text-foreground",
                  )}
                >
                  {viewLabels[v]}
                  <span className={cn("rounded-full px-1.5 text-[11px] font-bold tabular-nums", hot ? "bg-danger-soft text-danger" : "bg-muted text-muted-foreground")}>{counts?.[v] ?? 0}</span>
                </button>
              );
            })}
          </div>

          <DataTable
            key={view}
            columns={columns}
            data={visible}
            getRowId={(r) => r.customer.id}
            searchPlaceholder="Nom, numéro WhatsApp ou ville…"
            searchText={(r) => `${r.customer.fullName} ${r.customer.whatsapp} ${r.customer.whatsapp.replace(/[^0-9]/g, "")} ${r.customer.city ?? ""}`}
            facets={[
              { columnId: "family", title: "Offre", options: [...offerFamilies.map((f) => ({ value: f, label: familyMeta[f].label })), { value: "unknown", label: familyMeta.unknown.label }, { value: "none", label: "Sans abonnement" }] },
              { columnId: "cadence", title: "Suivi", options: [{ value: "overdue", label: "En retard" }, { value: "due", label: "À faire" }, { value: "healthy", label: "À jour" }, { value: "none", label: "Sans cadence" }] },
            ]}
            columnToggle
            pageSize={10}
            itemLabel="clients"
            caption={`Clients · ${viewLabels[view]}`}
            initialSorting={[{ id: "name", desc: false }]}
            emptyTitle={view === "all" ? "Aucun client pour le moment" : `Aucun client dans « ${viewLabels[view]} »`}
            emptyDescription={view === "all" ? "Crée une fiche ou convertis une demande pour commencer." : "Change de vue ou de filtres."}
            mobileCard={(r) => <MobileCard row={r} />}
          />
        </div>
      )}
      <NewCustomerSheet open={creating} onOpenChange={setCreating} />
    </AdminPage>
  );
}
