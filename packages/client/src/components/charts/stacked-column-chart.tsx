import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartColors } from "./chart-colors.js";

export type ColumnSeries = { key: string; label: string; color: string };

type StackedColumnChartProps<T extends Record<string, unknown>> = {
  data: T[];
  xKey: keyof T & string;
  /** Bottom to top. Status colours only when the series ARE statuses (e.g. honoré / reporté / absent). */
  series: ColumnSeries[];
  label: string;
  height?: number;
};

type TooltipPayload = { dataKey?: string | number; value?: number; color?: string };

function TooltipBox({ active, payload, label, series }: { active?: boolean; payload?: TooltipPayload[]; label?: string; series: ColumnSeries[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg">
      <span className="font-bold">{label}</span>
      {series.map((s) => {
        const value = payload.find((p) => p.dataKey === s.key)?.value ?? 0;
        return (
          <span key={s.key}>
            {s.label} : {value}
          </span>
        );
      })}
    </div>
  );
}

/** Stacked columns over time (board 03b · assiduité par semaine). Legend always shown. */
export function StackedColumnChart<T extends Record<string, unknown>>({ data, xKey, series, label, height = 200 }: StackedColumnChartProps<T>) {
  return (
    <div className="flex w-full flex-col gap-2">
      <div role="img" aria-label={label} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke={chartColors.grid} />
            <XAxis dataKey={(row: T) => row[xKey] as string} tickLine={false} axisLine={{ stroke: chartColors.axis }} tick={{ fill: chartColors.axisText, fontSize: 11 }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: chartColors.axisText, fontSize: 11 }} width={40} />
            <Tooltip cursor={{ fill: chartColors.primarySoft }} content={<TooltipBox series={series} />} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} stackId="stack" fill={s.color} maxBarSize={40} isAnimationActive={false} {...(i === series.length - 1 ? { radius: [4, 4, 0, 0] as [number, number, number, number] } : {})} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
