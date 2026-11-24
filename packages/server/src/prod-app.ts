import { createRuntime } from "./runtime.js";

/** S7.4 D1: production composition - Secure cookies, loopback and kfit_edge gateway trusted as proxy (S9A.3), no dev tools. Started by scripts/prod/api-server.mjs. */
export function createProductionRuntime(env: NodeJS.ProcessEnv = process.env) {
  return createRuntime({ mode: "production", env });
}
