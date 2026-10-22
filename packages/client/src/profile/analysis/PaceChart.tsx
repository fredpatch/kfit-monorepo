import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CustomerAnalyticsPace } from "@kfit/shared";
import { chartColors } from "../../components/charts/chart-colors.js";
import { numberFr, shortDateFr } from "../../lib/format.js";

type Point = { t: number; realized?: number; expected?: number };

/**
 * Burn-up (board 03b · Rythme des prestations): realized services (steps) vs the linear expected pace.
 * Time axis is numeric so both lines share real dates; « Aujourd'hui » is a vertical reference.
 */
export function PaceChart({ pace, height = 220 }: { pace: CustomerAnalyticsPace; height?: number }) {
  const start = new Date(pace.startDate).getTime();
  const end = new Date(pace.endDate).getTime();
  const today = Math.min(Date.now(), end);
  const points: Point[] = [
    ...pace.series.map((p) => ({ t: new Date(p.date).getTime(), realized: p.realized })),
    { t: start, expected: 0 },
    { t: end, expected: pace.entitled },
  ].sort((a, b) => a.t - b.t);
  const ticks = [start, start + (end - start) / 2, end];

  return (
    <div role="img" aria-label={`Prestations réalisées : ${pace.realized} sur ${pace.entitled}, attendu aujourd'hui ${numberFr(pace.expected, 1)}`} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 16, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={chartColors.grid} />
          <XAxis dataKey="t" type="number" domain={[start, end]} ticks={ticks} tickFormatter={(t: number) => shortDateFr(new Date(t).toISOString())} tickLine={false} axisLine={{ stroke: chartColors.axis }} tick={{ fill: chartColors.axisText, fontSize: 11 }} />
          <YAxis domain={[0, pace.entitled]} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: chartColors.axisText, fontSize: 11 }} width={40} />
          <Tooltip
            labelFormatter={(t) => shortDateFr(new Date(Number(t)).toISOString())}
            formatter={(value, name) => [numberFr(Number(value), 1), name === "realized" ? "Réalisé" : "Rythme attendu"]}
            contentStyle={{ background: chartColors.ink, border: "none", borderRadius: 6, fontSize: 12 }}
            itemStyle={{ color: "#fff" }}
            labelStyle={{ color: "#fff", fontWeight: 700 }}
          />
          <ReferenceLine x={today} stroke={chartColors.reference} strokeDasharray="3 3" label={{ value: "Aujourd'hui", position: "insideTopLeft", fill: chartColors.axisText, fontSize: 11 }} />
          <Line dataKey="expected" type="linear" stroke={chartColors.reference} strokeDasharray="6 5" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="realized" type="stepAfter" stroke={chartColors.primary} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
