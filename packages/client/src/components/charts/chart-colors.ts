/**
 * Chart colours as literal hex: SVG presentation attributes do not reliably resolve CSS variables.
 * Keep in sync with src/styles/index.css. Status tones stay reserved for statuses;
 * family colours follow the family, never the rank (board 01b).
 */
export const chartColors = {
  primary: "#2e6a2e",
  primaryMuted: "rgb(46 106 46 / 0.55)",
  primarySoft: "rgb(46 106 46 / 0.10)",
  reference: "#7b877a",
  grid: "#e4e7e0",
  axis: "#d5dbcf",
  axisText: "#5d6b5f",
  ink: "#141a15",
  success: "#2e6a2e",
  warning: "#d97706",
  danger: "#b42318",
  dangerFill: "#d92d20",
} as const;
