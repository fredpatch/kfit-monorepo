import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * FIX-03 F1: the repository root, from this module's location (packages/server/src/config or packages/server/dist/config,
 * both four levels below it). Configured relative paths resolve against it, never against process.cwd(), so the API, the
 * ops scripts and the privacy scripts read the same directories wherever they are started from.
 */
export const REPO_ROOT = fileURLToPath(
  new URL("../../../../", import.meta.url),
);

/** FIX-03 F1: default private storage, identical to the pre-FIX-03 default of an API started from packages/server. */
export const DEFAULT_PRIVATE_STORAGE_DIR = "storage/private/documents";

/**
 * FIX-03 F1: absolute stays absolute; relative resolves against REPO_ROOT. An empty value falls back to `fallback`
 * (itself repo-relative or absolute), or null without one.
 */
export function resolveConfiguredPath(
  value: string | undefined,
  options: { fallback: string },
): string;
export function resolveConfiguredPath(
  value: string | undefined,
  options?: { fallback?: undefined },
): string | null;
export function resolveConfiguredPath(
  value: string | undefined,
  options: { fallback?: string | undefined } = {},
): string | null {
  const configured = value?.trim() || options.fallback;
  return configured ? path.resolve(REPO_ROOT, configured) : null;
}
