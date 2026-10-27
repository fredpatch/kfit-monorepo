/** TEST-01 D1/D4: the two local databases on the K'FIT Docker port (gotchas: native PostgreSQL keeps 5432). */
export const LOCAL_DATABASE_PORT = "5433";
export const LOCAL_DATABASE_HOSTS = ["localhost", "127.0.0.1"] as const;
export const DEV_DATABASE_NAME = "kfit_dev";
export const INTEGRATION_TEST_DATABASE_NAME = "kfit_test";

/** Database name when the URL targets the local Docker port without query overrides; null for anything else. */
export function localDatabaseName(url: string | undefined): string | null {
  try {
    const target = new URL(url ?? "");
    if (
      !["postgres:", "postgresql:"].includes(target.protocol) ||
      !LOCAL_DATABASE_HOSTS.some((host) => host === target.hostname)
    )
      return null;
    if (target.port !== LOCAL_DATABASE_PORT || target.search || target.hash)
      return null;
    return decodeURIComponent(target.pathname.slice(1)) || null;
  } catch {
    return null;
  }
}

/** TEST-01 D1: true when the URL names kfit_test on any host, so the dev API refuses it even when remote or on 5432. */
export function namesIntegrationTestDatabase(url: string | undefined): boolean {
  try {
    return (
      decodeURIComponent(new URL(url ?? "").pathname.slice(1)) ===
      INTEGRATION_TEST_DATABASE_NAME
    );
  } catch {
    return false;
  }
}
