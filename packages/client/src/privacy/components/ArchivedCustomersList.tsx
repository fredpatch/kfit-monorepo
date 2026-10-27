import { NavLink } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { subjectMode, type AdminArchivedCustomer } from "@kfit/shared";
import {
  DataTable,
  SortHeader,
} from "../../components/data-table/data-table.js";
import { Avatar } from "../../components/ui/avatar.js";
import { Button } from "../../components/ui/button.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { Pill } from "../../components/ui/status-pill.js";
import { dateFr } from "../../lib/format.js";
import { useArchivedCustomers } from "../api/privacy-queries.js";
import { privacyErrorMessage } from "../lib/privacy-error-messages.js";

type Row = AdminArchivedCustomer & { archivedMs: number };

function StatePill({ row }: { row: AdminArchivedCustomer }) {
  return subjectMode(row) === "anonymized" ? (
    <Pill size="sm" tone="warning">
      Anonymisé
    </Pill>
  ) : (
    <Pill size="sm">Archivé</Pill>
  );
}
function Holds({ count }: { count: number }) {
  return count > 0 ? (
    <span className="whitespace-nowrap text-xs font-bold text-danger">
      {count} blocage{count > 1 ? "s" : ""}
    </span>
  ) : null;
}

const columns: ColumnDef<Row, unknown>[] = [
  {
    id: "name",
    accessorKey: "displayName",
    meta: { label: "Nom" },
    enableHiding: false,
    header: ({ column }) => <SortHeader column={column} title="Nom" />,
    cell: ({ row }) => (
      <NavLink
        to={`/admin/clients/${row.original.id}`}
        className="group flex items-center gap-2.5"
      >
        <Avatar name={row.original.displayName} size="sm" />
        <span className="font-bold group-hover:underline">
          {row.original.displayName}
        </span>
      </NavLink>
    ),
  },
  {
    id: "archivedAt",
    accessorKey: "archivedMs",
    meta: { label: "Archivé le" },
    header: ({ column }) => <SortHeader column={column} title="Archivé le" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {dateFr(row.original.archivedAt)}
      </span>
    ),
  },
  {
    id: "state",
    accessorFn: (r) => subjectMode(r),
    meta: { label: "État" },
    header: "État",
    cell: ({ row }) => <StatePill row={row.original} />,
  },
  {
    id: "holds",
    accessorKey: "activeHolds",
    meta: { label: "Blocages" },
    header: "Blocages",
    cell: ({ row }) => <Holds count={row.original.activeHolds} />,
  },
];

function MobileCard({ row }: { row: Row }) {
  return (
    <NavLink
      to={`/admin/clients/${row.id}`}
      className="flex items-center gap-3 rounded-xl border border-border p-3.5 active:bg-muted"
    >
      <Avatar name={row.displayName} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-bold">
          {row.displayName}
        </span>
        <span className="text-xs text-muted-foreground">
          Archivé le {dateFr(row.archivedAt)}
        </span>
        <Holds count={row.activeHolds} />
      </span>
      <StatePill row={row} />
    </NavLink>
  );
}

/** Clients › « Archivés » (S7.3b-2 D1): archived and anonymized customers, own query on GET /admin/customers/archived. */
export function ArchivedCustomersList() {
  const query = useArchivedCustomers();
  if (query.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Chargement des clients archivés…
      </p>
    );
  if (query.isError)
    return (
      <EmptyState
        title="Impossible de charger les clients archivés"
        description={privacyErrorMessage(query.error)}
        action={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Réessayer
          </Button>
        }
      />
    );
  const rows: Row[] = query.data.customers.map((c) => ({
    ...c,
    archivedMs: new Date(c.archivedAt).getTime(),
  }));
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchPlaceholder="Nom…"
      searchText={(r) => r.displayName}
      pageSize={10}
      itemLabel="clients"
      caption="Clients · Archivés"
      initialSorting={[{ id: "archivedAt", desc: true }]}
      emptyTitle="Aucun client archivé"
      emptyDescription="Un client archivé depuis sa fiche apparaît ici."
      mobileCard={(r) => <MobileCard row={r} />}
    />
  );
}
