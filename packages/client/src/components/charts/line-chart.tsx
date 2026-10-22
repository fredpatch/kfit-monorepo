import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartColors } from "./chart-colors.js";

export type LineSeries = { key: string; label: string; color?: string; dashed?: boolean };
export type ReferenceMark = { y: number; label: string; tone?: "goal" | "threshold" };

type TrendLineChartProps<T extends Record<string, unknown>> = {
  data: T[];
  xKey: keyof T & string;
  series: LineSeries[];
  /** Goal (green dashed) or threshold (amber dashed) lines, e.g. cadence 7 days, target 75 kg. */
  references?: ReferenceMark[];
  formatValue?: (value: number) => string;
  /** Optional per-point note shown in the tooltip (e.g. the client's comment on a measurement). */
  noteKey?: keyof T & string;
  label: string;
  height?: number;
  yDomain?: [number | "auto", number | "auto"];
};

type TooltipPayload = { dataKey?: string | number; value?: number; color?: string; payload: Record<string, unknown> };

function TooltipBox({ active, payload, label, series, formatValue, noteKey }: { active?: boolean; payload?: TooltipPayload[]; label?: string; series: LineSeries[]; formatValue: (v: number) => string; noteKey?: string }) {
  if (!active || !payload?.length) return null;
  const note = noteKey ? payload[0]?.payload[noteKey] : undefined;
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg">
      <span className="font-bold">{label}</span>
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey);
        return typeof p.value === "number" ? (
          <span key={String(p.dataKey)}>
            {series.length > 1 && s ? `${s.label} : ` : ""}
            {formatValue(p.value)}
          </span>
        ) : null;
      })}
      {typeof note === "string" && note ? <span className="text-brand-100">« {note} »</span> : null}
    </div>
  );
}

/** Line chart for trends with goal / threshold lines (boards 03b, 08). Legend shown when ≥ 2 series. */
export function TrendLineChart<T extends Record<string, unknown>>({ data, xKey, series, references = [], formatValue = (v) => String(v), noteKey, label, height = 240, yDomain = ["auto", "auto"] }: TrendLineChartProps<T>) {
  return (
    <div className="flex w-full flex-col gap-2">
      <div role="img" aria-label={label} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke={chartColors.grid} />
            <XAxis dataKey={(row: T) => row[xKey] as string} tickLine={false} axisLine={{ stroke: chartColors.axis }} tick={{ fill: chartColors.axisText, fontSize: 11 }} />
            <YAxis domain={yDomain} tickLine={false} axisLine={false} tick={{ fill: chartColors.axisText, fontSize: 11 }} width={44} />
            <Tooltip content={<TooltipBox series={series} formatValue={formatValue} {...(noteKey ? { noteKey } : {})} />} cursor={{ stroke: chartColors.axis }} />
            {references.map((r) => (
              <ReferenceLine
                key={r.label}
                y={r.y}
                stroke={r.tone === "threshold" ? chartColors.warning : chartColors.primary}
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{ value: r.label, position: "insideTopRight", fill: r.tone === "threshold" ? "#92400e" : chartColors.primary, fontSize: 11, fontWeight: 700 }}
              />
            ))}
            {series.map((s) => (
              <Line
                key={s.key}
                type="linear"
                dataKey={s.key}
                stroke={s.color ?? chartColors.primary}
                strokeWidth={s.dashed ? 2 : 2.5}
                {...(s.dashed ? { strokeDasharray: "6 5" } : {})}
                dot={s.dashed ? false : { r: 3.5, fill: s.color ?? chartColors.primary, stroke: "#fff", strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {series.length > 1 ? (
        <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="w-4" style={{ borderTop: `${s.dashed ? "2px dashed" : "3px solid"} ${s.color ?? chartColors.primary}` }} />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
