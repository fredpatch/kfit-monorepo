import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "../../lib/utils.js";
import type { StatusTone } from "../../lib/status-map.js";
import { Sparkline } from "./sparkline.js";

const toneIcon: Record<StatusTone, string> = {
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-neutral-soft text-neutral",
  waitlist: "bg-waitlist-soft text-waitlist",
};
const toneText: Record<StatusTone, string> = {
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-muted-foreground",
  waitlist: "text-waitlist",
};

type KpiTileProps = {
  label: string;
  value: string;
  unit?: string;
  icon?: LucideIcon;
  tone?: StatusTone;
  /** One short line under the value, e.g. "Le plus ancien : 6 jours". */
  note?: string;
  noteTone?: StatusTone;
  /** Change vs previous period; direction drives the arrow, not the colour. */
  delta?: { text: string; direction: "up" | "down" | "flat"; tone?: StatusTone };
  trend?: number[];
  trendLabel?: string;
  className?: string;
};

/** KPI tile with optional sparkline (boards 01b, 02). Charts are added only when the trend matters. */
export function KpiTile({ label, value, unit, icon: Icon, tone = "neutral", note, noteTone = "neutral", delta, trend, trendLabel, className }: KpiTileProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-card p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
        {Icon ? (
          <span className={cn("flex size-8 items-center justify-center rounded-[10px]", toneIcon[tone])}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : delta ? (
          <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-bold", toneIcon[delta.tone ?? "neutral"])}>
            {delta.direction === "up" ? <ArrowUp className="size-3" aria-hidden="true" /> : delta.direction === "down" ? <ArrowDown className="size-3" aria-hidden="true" /> : null}
            {delta.text}
          </span>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[32px] font-extrabold leading-none tracking-tight tabular-nums">{value}</span>
          {unit ? <span className="text-[13px] text-muted-foreground">{unit}</span> : null}
        </span>
        {trend && trend.length > 1 ? <Sparkline values={trend} label={trendLabel ?? `${label} : évolution`} /> : null}
      </div>
      {note ? <span className={cn("text-xs font-semibold", toneText[noteTone])}>{note}</span> : null}
    </div>
  );
}
