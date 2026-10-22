import { cn } from "../../lib/utils.js";

export type StackedSegment = { key: string; label: string; value: number; color: string };

type StackedBarProps = {
  segments: StackedSegment[];
  /** Accessible summary of the distribution. */
  label: string;
  /** Total shown in the legend percentages; defaults to the sum. */
  total?: number;
  layout?: "inline" | "list";
  className?: string;
};

/**
 * Part-of-whole bar (board 01b · « Clients actifs par offre »). HTML, no chart library.
 * Legend + values are always shown, so colour is never the only carrier of meaning.
 */
export function StackedBar({ segments, label, total, layout = "inline", className }: StackedBarProps) {
  const sum = total ?? segments.reduce((acc, s) => acc + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  const pct = (v: number) => (sum ? Math.round((v / sum) * 100) : 0);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div role="img" aria-label={label} className="flex h-7 gap-0.5 overflow-hidden rounded-md">
        {visible.length === 0 ? <span className="flex-1 bg-muted" /> : visible.map((s) => <span key={s.key} title={`${s.label} : ${s.value}`} style={{ flex: `${s.value} 1 0`, background: s.color }} />)}
      </div>
      <ul className={cn(layout === "inline" ? "flex flex-wrap gap-x-5 gap-y-2" : "flex flex-col gap-2.5")}>
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-[13px]">
            <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            <span className={cn("font-semibold", layout === "list" ? "flex-1" : "")}>{s.label}</span>
            <span className="font-bold tabular-nums">{s.value}</span>
            <span className="w-11 text-right text-muted-foreground tabular-nums">{pct(s.value)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
