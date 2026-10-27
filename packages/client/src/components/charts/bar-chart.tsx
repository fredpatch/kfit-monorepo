import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartColors } from "./chart-colors.js";

export type BarDatum = {
  label: string;
  value: number;
  /** Tooltip detail, e.g. "6-12 oct." */ detail?: string;
};

type SimpleBarChartProps = {
  data: BarDatum[];
  /** Tooltip value text, e.g. (v) => `${v} demandes`. */
  formatValue?: (value: number) => string;
  /** Accessible summary of what the chart shows. */
  label: string;
  height?: number;
  /** Index drawn in full colour (current period); others are muted. Defaults to the last bar. */
  highlightIndex?: number;
};

function TooltipBox({
  active,
  payload,
  formatValue,
}: {
  active?: boolean;
  payload?: Array<{ payload: BarDatum }>;
  formatValue: (v: number) => string;
}) {
  const datum = active ? payload?.[0]?.payload : undefined;
  if (!datum) return null;
  return (
    <div className="rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg">
      <strong>{formatValue(datum.value)}</strong>
      {datum.detail ? ` · ${datum.detail}` : ` · ${datum.label}`}
    </div>
  );
}

/** Single-series bar chart (board 01b). One series only: no legend, the card title names it. */
export function SimpleBarChart({
  data,
  formatValue = (v) => String(v),
  label,
  height = 200,
  highlightIndex,
}: SimpleBarChartProps) {
  const highlighted = highlightIndex ?? data.length - 1;
  return (
    <div role="img" aria-label={label} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: -16 }}
          barCategoryGap="28%"
        >
          <CartesianGrid vertical={false} stroke={chartColors.grid} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: chartColors.axis }}
            tick={{ fill: chartColors.axisText, fontSize: 11 }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: chartColors.axisText, fontSize: 11 }}
            width={40}
          />
          <Tooltip
            cursor={{ fill: chartColors.primarySoft }}
            content={<TooltipBox formatValue={formatValue} />}
          />
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            maxBarSize={44}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell
                key={d.label}
                fill={
                  i === highlighted
                    ? chartColors.primary
                    : chartColors.primaryMuted
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
