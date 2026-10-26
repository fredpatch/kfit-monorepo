import assert from "node:assert/strict";
import test from "node:test";
import { assertRuntimeSecurityFloor, SECURITY_FLOOR_NOT_MET, SecurityFloorError } from "./runtime-floor.startup.js";
import { evaluateRuntimeFloor, SECURITY_FLOOR } from "./security-floor.js";

const reasons = (version: string) => {
  const result = evaluateRuntimeFloor(version);
  return result.ok ? "ok" : result.failures.map((f) => `${f.id}:${f.reason}`).join(",");
};

test("SEC-01 D1: CVE-2026-111497 floor per supported line; other lines and unreadable versions fail closed", () => {
  assert.equal(reasons("22.23.3"), "CVE-2026-111497:below_minimum");
  assert.equal(reasons("22.23.4"), "ok");
  assert.equal(reasons("v22.23.4"), "ok");
  assert.equal(reasons("22.30.0"), "ok");
  assert.equal(reasons("24.22.0"), "CVE-2026-111497:below_minimum");
  assert.equal(reasons("24.22.1"), "ok");
  assert.equal(reasons("26.12.1"), "ok");
  assert.equal(reasons("20.19.0"), "CVE-2026-111497:unsupported_line");
  assert.equal(reasons("25.9.0"), "CVE-2026-111497:unsupported_line");
  for (const malformed of ["", "22", "22.23", "v22.x.4", "22.23.4-rc.1", "node"]) assert.equal(reasons(malformed), "CVE-2026-111497:unsupported_line", malformed);
});

test("SEC-01 D1: a below-minimum failure carries the current and required versions", () => {
  assert.deepEqual(evaluateRuntimeFloor("v22.1.0"), { ok: false, failures: [{ id: "CVE-2026-111497", reason: "below_minimum", current: "v22.1.0", required: "22.23.4" }] });
});

test("SEC-01 D1: the next advisory is one more registry entry, evaluated on its own", () => {
  const floor = [...SECURITY_FLOOR, { id: "SYNTHETIC-NEXT", component: "node" as const, minimumByLine: { 22: "22.24.0" }, publishedAt: "2026-11-01", note: "synthetic" }];
  const result = evaluateRuntimeFloor("22.23.4", floor);
  assert.deepEqual(result.ok ? [] : result.failures.map((f) => f.id), ["SYNTHETIC-NEXT"]);
});

test("SEC-01 D2: production below the floor refuses to start with SECURITY_FLOOR_NOT_MET", () => {
  const warnings: string[] = [];
  assert.throws(() => assertRuntimeSecurityFloor({ nodeEnv: "production", version: "v22.23.3", log: { warn: (m) => warnings.push(m) } }),
    (error) => error instanceof SecurityFloorError && error.code === SECURITY_FLOOR_NOT_MET && error.message.includes("CVE-2026-111497"));
  assert.deepEqual(warnings, []);
});

test("SEC-01 D2: development below the floor warns once with ids and versions; a patched version is silent", () => {
  const warnings: string[] = [];
  const log = { warn: (m: string) => warnings.push(m) };
  assertRuntimeSecurityFloor({ nodeEnv: "development", version: "v24.22.0", log });
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0]!.startsWith(SECURITY_FLOOR_NOT_MET));
  assert.ok(warnings[0]!.includes("CVE-2026-111497") && warnings[0]!.includes("v24.22.0") && warnings[0]!.includes("24.22.1"));
  assert.ok(!warnings[0]!.includes("    at "), "no stack");
  assertRuntimeSecurityFloor({ nodeEnv: "production", version: "v24.22.1", log });
  assertRuntimeSecurityFloor({ nodeEnv: undefined, version: "v26.12.1", log });
  assert.equal(warnings.length, 1);
});
