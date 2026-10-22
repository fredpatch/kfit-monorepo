import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Plus, Search, X } from "lucide-react";
import { cn } from "../../lib/utils.js";
import { Button } from "../ui/button.js";
import { NativeSelect } from "../ui/input.js";
import { EmptyState } from "../ui/empty-state.js";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu.js";

declare module "@tanstack/react-table" {
  interface FilterFns {
    /** Matches any selected facet value. Set filterFn: "facet" on faceted columns. */
    facet: FilterFn<unknown>;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** French column name for the « Colonnes » menu. */
    label?: string;
  }
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type FacetOption = { value: string; label: string };
export type Facet = { columnId: string; title: string; options: FacetOption[] };

export type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  /** Free-text search across the values returned by searchText. */
  searchPlaceholder?: string;
  searchText?: (row: TData) => string;
  facets?: Facet[];
  /** Row checkboxes + dark bulk-action bar (board 01b). */
  selectable?: boolean;
  bulkActions?: (rows: TData[], clear: () => void) => React.ReactNode;
  /** Actions at the right end of the toolbar (e.g. the primary « Nouveau client »). */
  toolbarActions?: React.ReactNode;
  /** Show the « Colonnes » visibility menu. */
  columnToggle?: boolean;
  /** Compact read-only density with simple Précédent / Suivant pagination. */
  variant?: "default" | "compact";
  pageSize?: number;
  /** Below 768 px rows render as stacked cards when provided (board 04b). */
  mobileCard?: (row: TData) => React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  /** French noun for counts, e.g. "clients". */
  itemLabel?: string;
  caption?: string;
  initialSorting?: SortingState;
  className?: string;
};

/* Faceted filters match any of the selected values. Use filterFn: "facet" on the column. */
export const facetFilter: FilterFn<unknown> = (row, columnId, selected: string[]) => {
  if (!selected || selected.length === 0) return true;
  const value = row.getValue(columnId);
  return Array.isArray(value) ? value.some((v) => selected.includes(String(v))) : selected.includes(String(value));
};

/* ------------------------------------------------------------------ */
/* Header helpers                                                      */
/* ------------------------------------------------------------------ */

/** Sortable column header. Usage: header: ({ column }) => <SortHeader column={column} title="Client" /> */
export function SortHeader({ column, title }: { column: { getIsSorted(): false | "asc" | "desc"; toggleSorting(desc?: boolean): void }; title: string }) {
  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className={cn("-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 font-semibold hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", sorted ? "text-foreground" : "")}
      aria-label={`Trier par ${title}`}
    >
      {title}
      <Icon className={cn("size-3.5", sorted ? "" : "opacity-50")} aria-hidden="true" />
    </button>
  );
}

function SelectionCheckbox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: (value: boolean) => void; label: string }) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !checked;
  }, [checked, indeterminate]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 cursor-pointer accent-primary" />;
}

/* ------------------------------------------------------------------ */
/* Toolbar pieces                                                      */
/* ------------------------------------------------------------------ */

function FacetFilter({ facet, selected, onChange, counts }: { facet: Facet; selected: string[]; onChange: (next: string[]) => void; counts: Map<unknown, number> }) {
  const labels = facet.options.filter((o) => selected.includes(o.value)).map((o) => o.label);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="h-9 border-dashed">
          <Plus aria-hidden="true" />
          {facet.title}
          {labels.length > 0 ? (
            <>
              <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-input" />
              {labels.length > 2 ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{labels.length} choisis</span>
              ) : (
                labels.map((label) => (
                  <span key={label} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {label}
                  </span>
                ))
              )}
            </>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{facet.title}</DropdownMenuLabel>
        {facet.options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={(checked) => onChange(checked ? [...selected, option.value] : selected.filter((v) => v !== option.value))}
          >
            <span className="flex-1">{option.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{counts.get(option.value) ?? 0}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* DataTable                                                           */
/* ------------------------------------------------------------------ */

/**
 * Data table (board 01b) on TanStack Table v8: search, faceted filters, sorting,
 * column visibility, selection + bulk bar, client-side pagination, mobile cards.
 * Pagination is client-side while list endpoints return everything (backlog: server-side pagination).
 */
export function DataTable<TData>({
  columns: userColumns,
  data,
  getRowId,
  searchPlaceholder = "Rechercher…",
  searchText,
  facets = [],
  selectable = false,
  bulkActions,
  toolbarActions,
  columnToggle = false,
  variant = "default",
  pageSize = 10,
  mobileCard,
  emptyTitle = "Aucun résultat",
  emptyDescription,
  itemLabel = "lignes",
  caption,
  initialSorting = [],
  className,
}: DataTableProps<TData>) {
  const compact = variant === "compact";
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  const columns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!selectable) return userColumns;
    const select: ColumnDef<TData, unknown> = {
      id: "__select",
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <SelectionCheckbox
          label="Tout sélectionner sur cette page"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onChange={(value) => table.toggleAllPageRowsSelected(value)}
        />
      ),
      cell: ({ row }) => <SelectionCheckbox label="Sélectionner la ligne" checked={row.getIsSelected()} onChange={(value) => row.toggleSelected(value)} />,
    };
    return [select, ...userColumns];
  }, [selectable, userColumns]);

  const table = useReactTable<TData>({
    data,
    columns,
    ...(getRowId ? { getRowId: (row: TData) => getRowId(row) } : {}),
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row: Row<TData>, _columnId: string, value: string) => {
      if (!value) return true;
      const haystack = (searchText ? searchText(row.original) : "").toLocaleLowerCase("fr");
      return haystack.includes(String(value).toLocaleLowerCase("fr").trim());
    },
    filterFns: { facet: facetFilter as FilterFn<TData> },
    enableRowSelection: selectable,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  const filtered = table.getFilteredRowModel().rows.length;
  const selectedRows = table.getFilteredSelectedRowModel().rows.map((r) => r.original);
  const isFiltered = globalFilter !== "" || columnFilters.length > 0;
  const { pageIndex, pageSize: size } = table.getState().pagination;
  const from = filtered === 0 ? 0 : pageIndex * size + 1;
  const to = Math.min(filtered, (pageIndex + 1) * size);
  const rows = table.getRowModel().rows;
  const hasToolbar = Boolean(searchText) || facets.length > 0 || columnToggle || toolbarActions;

  const resetFilters = () => {
    setGlobalFilter("");
    setColumnFilters([]);
  };

  return (
    <section className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card", className)}>
      {hasToolbar ? (
        <div className="flex flex-wrap items-center gap-2 p-4 sm:px-5">
          {searchText ? (
            <label className="flex h-9 w-full items-center gap-2 rounded-md border border-input px-2.5 text-muted-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25 sm:w-64">
              <Search className="size-4 shrink-0" aria-hidden="true" />
              <input
                type="search"
                value={globalFilter}
                onChange={(e) => {
                  setGlobalFilter(e.target.value);
                  table.setPageIndex(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
          ) : null}
          {facets.map((facet) => {
            const column = table.getColumn(facet.columnId);
            if (!column) return null;
            const selected = (column.getFilterValue() as string[] | undefined) ?? [];
            return (
              <FacetFilter
                key={facet.columnId}
                facet={facet}
                selected={selected}
                counts={column.getFacetedUniqueValues()}
                onChange={(next) => {
                  column.setFilterValue(next.length ? next : undefined);
                  table.setPageIndex(0);
                }}
              />
            );
          })}
          {isFiltered ? (
            <Button variant="ghost" size="sm" className="h-9" onClick={resetFilters}>
              Réinitialiser
              <X aria-hidden="true" />
            </Button>
          ) : null}
          <div className="flex-1" />
          {columnToggle ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="h-9">
                  <Columns3 aria-hidden="true" />
                  Colonnes
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Colonnes affichées</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table
                  .getAllLeafColumns()
                  .filter((c) => c.getCanHide())
                  .map((c) => (
                    <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(value) => c.toggleVisibility(Boolean(value))}>
                      {c.columnDef.meta?.label ?? c.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {toolbarActions}
        </div>
      ) : null}

      {selectable && selectedRows.length > 0 && bulkActions ? (
        <div role="region" aria-label="Actions groupées" className="mx-4 mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-brand-950 px-3 py-2 text-[13px] text-white sm:mx-5">
          <span className="font-bold">
            {selectedRows.length} sélectionné{selectedRows.length > 1 ? "s" : ""}
          </span>
          <span aria-hidden="true" className="h-4 w-px bg-white/20" />
          <div className="flex flex-wrap gap-2 [&_button]:h-7 [&_button]:bg-white/10 [&_button]:text-white [&_button:hover]:bg-white/20">{bulkActions(selectedRows, () => table.resetRowSelection())}</div>
          <div className="flex-1" />
          <button type="button" onClick={() => table.resetRowSelection()} className="rounded px-2 py-1 text-xs text-brand-100 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime">
            Effacer
          </button>
        </div>
      ) : null}

      {/* Mobile cards */}
      {mobileCard ? (
        <ul className="flex flex-col gap-2 px-3 pb-3 md:hidden">
          {rows.map((row) => (
            <li key={row.id}>{mobileCard(row.original)}</li>
          ))}
        </ul>
      ) : null}

      <div className={cn("overflow-x-auto", mobileCard ? "hidden md:block" : "")}>
        <table className="w-full border-collapse text-[13px]">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className={cn("border-y border-border text-left text-muted-foreground", compact ? "" : "bg-[#f7f8f5]")}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : undefined}
                    className={cn("whitespace-nowrap font-semibold first:pl-5 last:pr-5", compact ? "px-3 py-2" : "px-3 py-2.5", header.column.id === "__select" ? "w-10" : "")}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-state={row.getIsSelected() ? "selected" : undefined} className="border-b border-border-subtle transition-colors hover:bg-[#fafbf8] data-[state=selected]:bg-brand-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cn("align-middle first:pl-5 last:pr-5", compact ? "px-3 py-2" : "px-3 py-3")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title={isFiltered ? "Aucun résultat pour ces filtres" : emptyTitle}
            {...(isFiltered ? { description: "Modifie la recherche ou réinitialise les filtres." } : emptyDescription ? { description: emptyDescription } : {})}
            {...(isFiltered ? { action: <Button variant="secondary" size="sm" onClick={resetFilters}>Réinitialiser les filtres</Button> } : {})}
          />
        </div>
      ) : null}

      {/* Pagination */}
      {compact ? (
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {from}–{to} sur {filtered}
          </span>
          <div className="flex gap-1.5">
            <Button variant="secondary" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
              Précédent
            </Button>
            <Button variant="secondary" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
              Suivant
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-3">
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {selectable && selectedRows.length > 0 ? `${selectedRows.length} sur ${filtered} ${itemLabel} sélectionné(s)` : `${from}–${to} sur ${filtered} ${itemLabel}`}
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              Lignes par page
              <NativeSelect className="h-8 w-[72px] text-[13px]" value={String(size)} onChange={(e) => table.setPageSize(Number(e.target.value))}>
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <span className="text-[13px] font-semibold tabular-nums">
              Page {table.getPageCount() === 0 ? 0 : pageIndex + 1} sur {table.getPageCount()}
            </span>
            <div className="flex gap-1.5">
              <Button variant="secondary" size="icon-sm" aria-label="Première page" disabled={!table.getCanPreviousPage()} onClick={() => table.setPageIndex(0)}>
                <ChevronsLeft />
              </Button>
              <Button variant="secondary" size="icon-sm" aria-label="Page précédente" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
                <ChevronLeft />
              </Button>
              <Button variant="secondary" size="icon-sm" aria-label="Page suivante" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
                <ChevronRight />
              </Button>
              <Button variant="secondary" size="icon-sm" aria-label="Dernière page" disabled={!table.getCanNextPage()} onClick={() => table.setPageIndex(table.getPageCount() - 1)}>
                <ChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Compact read-only table (history, logs): search and filters optional, no selection, simple pagination. */
export function ReadOnlyTable<TData>(props: Omit<DataTableProps<TData>, "selectable" | "bulkActions" | "columnToggle" | "variant" | "mobileCard">) {
  return <DataTable {...props} variant="compact" pageSize={props.pageSize ?? 8} />;
}
