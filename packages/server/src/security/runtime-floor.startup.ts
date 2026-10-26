import { evaluateRuntimeFloor, type RuntimeFloorFailure } from "./security-floor.js";

/** SEC-01 D2: error code of a production start refused below the runtime security floor. */
export const SECURITY_FLOOR_NOT_MET = "SECURITY_FLOOR_NOT_MET";

export class SecurityFloorError extends Error {
  readonly code = SECURITY_FLOOR_NOT_MET;
  constructor(readonly failures: RuntimeFloorFailure[]) {
    super(`${SECURITY_FLOOR_NOT_MET}: ${failures.map((failure) => failure.id).join(", ")}`);
    this.name = "SecurityFloorError";
  }
}

/**
 * SEC-01 D2: production refuses to start below the floor; any other environment logs one structured warning and goes
 * on. Called first by createDevelopmentRuntime; the S7.4 production entrypoint calls it the same way.
 */
export function assertRuntimeSecurityFloor({ nodeEnv, version = process.version, log }: { nodeEnv: string | undefined; version?: string; log: { warn(message: string): unknown } }): void {
  const result = evaluateRuntimeFloor(version);
  if (result.ok) return;
  if (nodeEnv === "production") throw new SecurityFloorError(result.failures);
  log.warn(`${SECURITY_FLOOR_NOT_MET} ${JSON.stringify({ failures: result.failures })}`);
}
