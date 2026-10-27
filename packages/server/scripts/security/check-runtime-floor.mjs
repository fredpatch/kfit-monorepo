/*
 * SEC-01 D3: fails (exit 1) when this Node runtime is below the security floor. Runs in CI right after Setup Node,
 * before `npm ci` and any build, so it reads the registry source directly (Node type stripping) instead of dist/ -
 * no copy of the table. A Node too old to strip types is below every floor line anyway: the import failure exits 1.
 * KFIT_SECURITY_FLOOR_TEST_VERSION overrides the version for the script's own test; it is ignored in production.
 */
const override =
  process.env.NODE_ENV === "production"
    ? undefined
    : process.env.KFIT_SECURITY_FLOOR_TEST_VERSION;
const version = override || process.version;

let evaluateRuntimeFloor;
try {
  ({ evaluateRuntimeFloor } = await import(
    new URL("../../src/security/security-floor.ts", import.meta.url).href
  ));
} catch (error) {
  console.error(
    `✖ security:check could not load the security floor on Node ${process.version} (${error?.code ?? "load failure"}). Use the version in .nvmrc.`,
  );
  process.exit(1);
}

const result = evaluateRuntimeFloor(version);
if (result.ok) {
  console.log(
    `✔ security:check - Node ${version} meets the runtime security floor`,
  );
} else {
  console.error(
    `✖ security:check - Node ${version} is below the runtime security floor:`,
  );
  for (const failure of result.failures) {
    console.error(
      `  ${failure.id}: ${failure.reason}${failure.required ? ` (required ≥ ${failure.required})` : ""}`,
    );
  }
  process.exit(1);
}
