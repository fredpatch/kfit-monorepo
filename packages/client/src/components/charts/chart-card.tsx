import { useState, type ReactNode } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { Button } from "../ui/button.js";
import { cn } from "../../lib/utils.js";

export type ChartTableRow = { label: string; values: Array<string | number> };

type ChartCardProps = {
  title: string;
  description?: string;
  /** Period switch or other controls. */
  actions?: ReactNode;
  /** Same data as a table - every chart has a table view (accessibility, exact values). */
  table: { columns: string[]; rows: ChartTableRow[] };
  children: ReactNode;
  className?: string;
};

/** Card wrapper for charts with a « Graphique / Tableau » toggle (board 01b). */
export function ChartCard({
  title,
  description,
  actions,
  table,
  children,
  className,
}: ChartCardProps) {
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-bold">{title}</h2>
          {description ? (
            <p className="text-[13px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={view === "table"}
            onClick={() => setView(view === "chart" ? "table" : "chart")}
          >
            {view === "chart" ? (
              <Table2 aria-hidden="true" />
            ) : (
              <BarChart3 aria-hidden="true" />
            )}
            {view === "chart" ? "Tableau" : "Graphique"}
          </Button>
        </div>
      </div>
      {view === "chart" ? (
        children
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-y border-border text-left text-muted-foreground">
                {table.columns.map((c, i) => (
                  <th
                    key={c}
                    scope="col"
                    className={cn(
                      "px-3 py-2 font-semibold",
                      i > 0 ? "text-right" : "",
                    )}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r.label} className="border-b border-border-subtle">
                  <th scope="row" className="px-3 py-2 text-left font-semibold">
                    {r.label}
                  </th>
                  {r.values.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
