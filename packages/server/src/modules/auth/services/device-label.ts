/*
 * SEC-02 E4: a short « Navigateur · Système » label shown in the devices list. The full User-Agent is never stored.
 * Order matters: Edge and Chrome on iOS both claim Safari, Edge claims Chrome, Android claims Linux, iOS claims Mac OS X.
 */
const BROWSERS: ReadonlyArray<readonly [label: string, pattern: RegExp]> = [
  ["Edge", /\bEdg(e|A|iOS)?\//],
  ["Firefox", /\b(Firefox|FxiOS)\//],
  ["Chrome", /\b(Chrome|CriOS)\//],
  ["Safari", /\bVersion\/[\d.]+.*\bSafari\//],
];

const SYSTEMS: ReadonlyArray<readonly [label: string, pattern: RegExp]> = [
  ["Android", /\bAndroid\b/],
  ["iOS", /\b(iPhone|iPad|iPod)\b/],
  ["Windows", /\bWindows\b/],
  ["macOS", /\b(Macintosh|Mac OS X)\b/],
  ["Linux", /\bLinux\b/],
];

const OTHER = "Autre";

const match = (table: typeof BROWSERS, userAgent: string) => table.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? OTHER;

export function deviceLabel(userAgent: string | null | undefined): string {
  const value = userAgent ?? "";
  return `${match(BROWSERS, value)} · ${match(SYSTEMS, value)}`;
}
