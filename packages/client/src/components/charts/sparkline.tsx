import { chartColors } from "./chart-colors.js";

type SparklineProps = {
  values: Array<number | null>;
  /** Accessible summary, e.g. "Clients actifs sur 8 semaines : de 12 à 18". */
  label: string;
  width?: number;
  height?: number;
  className?: string;
};

/** Tiny trend line for KPI tiles. Plain SVG (no chart library) to keep tiles cheap. */
export function Sparkline({
  values,
  label,
  width = 120,
  height = 36,
  className,
}: SparklineProps) {
  if (values.length < 2) return null;
  const known = values.filter((value): value is number => value !== null);
  const min = known.length ? Math.min(...known) : 0;
  const max = known.length ? Math.max(...known) : 0;
  const range = max - min || 1;
  const pad = 4;
  const segments: Array<Array<readonly [number, number]>> = [];
  let segment: Array<readonly [number, number]> = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (segment.length) segments.push(segment);
      segment = [];
      return;
    }
    segment.push([
      pad + (index * (width - pad * 2)) / (values.length - 1),
      height - pad - ((value - min) / range) * (height - pad * 2),
    ]);
  });
  if (segment.length) segments.push(segment);
  const accessibleLabel = values.includes(null)
    ? `${label} · Historique indisponible pour certaines semaines`
    : label;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={accessibleLabel}
      className={className}
    >
      <title>{accessibleLabel}</title>
      {segments.map((points, index) => {
        const line = points
          .map(
            ([x, y], pointIndex) =>
              `${pointIndex ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`,
          )
          .join(" ");
        const first = points[0]!,
          last = points.at(-1)!;
        const area = `${line} L${last[0].toFixed(1)} ${height} L${first[0].toFixed(1)} ${height} Z`;
        return (
          <g key={index}>
            {points.length > 1 ? (
              <path d={area} fill={chartColors.primarySoft} />
            ) : null}
            <path
              d={line}
              fill="none"
              stroke={chartColors.primary}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle
              cx={last[0]}
              cy={last[1]}
              r={3.5}
              fill={chartColors.primary}
              stroke="#fff"
              strokeWidth={2}
            />
          </g>
        );
      })}
    </svg>
  );
}
