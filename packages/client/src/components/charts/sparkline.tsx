import { chartColors } from "./chart-colors.js";

type SparklineProps = {
  values: number[];
  /** Accessible summary, e.g. "Clients actifs sur 8 semaines : de 12 à 18". */
  label: string;
  width?: number;
  height?: number;
  className?: string;
};

/** Tiny trend line for KPI tiles. Plain SVG (no chart library) to keep tiles cheap. */
export function Sparkline({ values, label, width = 120, height = 36, className }: SparklineProps) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 4;
  const points = values.map((v, i) => [pad + (i * (width - pad * 2)) / (values.length - 1), height - pad - ((v - min) / range) * (height - pad * 2)] as const);
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;
  const area = `${line} L${last[0].toFixed(1)} ${height} L${first[0].toFixed(1)} ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label} className={className}>
      <path d={area} fill={chartColors.primarySoft} />
      <path d={line} fill="none" stroke={chartColors.primary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3.5} fill={chartColors.primary} stroke="#fff" strokeWidth={2} />
    </svg>
  );
}
