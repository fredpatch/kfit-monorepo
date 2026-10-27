/*
 * FIX-02 D1: Drizzle wraps the driver error, so the SQLSTATE and constraint sit on `error.cause`. Every repository reads
 * Postgres failures through these helpers instead of a local walker.
 */

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
/** FIX-02 D1: bound on the cause chain; real chains are 1-2 levels deep. */
export const PG_ERROR_MAX_DEPTH = 10;

export type PgErrorInfo = { code: string; constraint: string | null };

/** First object in the cause chain carrying a string `code`; stops on a self-reference and after PG_ERROR_MAX_DEPTH levels. */
export function pgErrorInfo(error: unknown): PgErrorInfo | null {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < PG_ERROR_MAX_DEPTH &&
    current !== null &&
    typeof current === "object";
    depth += 1
  ) {
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (typeof candidate.code === "string")
      return {
        code: candidate.code,
        constraint:
          typeof candidate.constraint === "string"
            ? candidate.constraint
            : null,
      };
    if (candidate.cause === current) return null;
    current = candidate.cause;
  }
  return null;
}

export function isPgUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  const info = pgErrorInfo(error);
  return (
    info?.code === PG_UNIQUE_VIOLATION &&
    (constraint === undefined || info.constraint === constraint)
  );
}

export function isPgForeignKeyViolation(error: unknown): boolean {
  return pgErrorInfo(error)?.code === PG_FOREIGN_KEY_VIOLATION;
}
