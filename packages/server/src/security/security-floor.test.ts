import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRuntimeSecurityFloor,
  SECURITY_FLOOR_NOT_MET,
  SecurityFloorError,
} from "./runtime-floor.startup.js";
import {
  evaluateRuntimeFloor,
  parseNodeVersion,
  SECURITY_FLOOR,
  type RuntimeAdvisory,
} from "./security-floor.js";

const NODE2SHELL = "CVE-2026-111497";
const NOVEMBER_2026 = "CVE-2026-123863";

const advisory = (id: string): RuntimeAdvisory => {
  const found = SECURITY_FLOOR.find((entry) => entry.id === id);
  assert.ok(found, `${id} is in SECURITY_FLOOR`);
  return found;
};

const reasons = (
  version: string,
  floor: readonly RuntimeAdvisory[] = SECURITY_FLOOR,
) => {
  const result = evaluateRuntimeFloor(version, floor);
  return result.ok
    ? "ok"
    : result.failures.map((f) => `${f.id}:${f.reason}`).join(",");
};

test("SEC-01 D1: CVE-2026-111497 (Node2Shell, October 2026 release) alone keeps its own patched floors", () => {
  const entry = advisory(NODE2SHELL);
  assert.equal(entry.publishedAt, "2026-10-22");
  assert.deepEqual(entry.minimumByLine, {
    22: "22.23.4",
    24: "24.22.1",
    26: "26.12.1",
  });
  const floor = [entry];
  assert.equal(reasons("22.23.3", floor), `${NODE2SHELL}:below_minimum`);
  assert.equal(reasons("22.23.4", floor), "ok");
  assert.equal(reasons("v22.23.4", floor), "ok");
  assert.equal(reasons("24.22.0", floor), `${NODE2SHELL}:below_minimum`);
  assert.equal(reasons("24.22.1", floor), "ok");
  assert.equal(reasons("26.12.0", floor), `${NODE2SHELL}:below_minimum`);
  assert.equal(reasons("26.12.1", floor), "ok");
  assert.equal(reasons("20.19.0", floor), `${NODE2SHELL}:unsupported_line`);
});

test("SEC-01 D1: CVE-2026-123863 (November 2026 release) alone requires 22.23.5 / 24.22.3 / 26.13.1", () => {
  const entry = advisory(NOVEMBER_2026);
  assert.equal(entry.publishedAt, "2026-11-11");
  assert.deepEqual(entry.minimumByLine, {
    22: "22.23.5",
    24: "24.22.3",
    26: "26.13.1",
  });
  const floor = [entry];
  assert.equal(reasons("22.23.4", floor), `${NOVEMBER_2026}:below_minimum`);
  assert.equal(reasons("22.23.5", floor), "ok");
  assert.equal(reasons("v22.23.5", floor), "ok");
  assert.equal(reasons("24.22.2", floor), `${NOVEMBER_2026}:below_minimum`);
  assert.equal(reasons("24.22.3", floor), "ok");
  assert.equal(reasons("26.13.0", floor), `${NOVEMBER_2026}:below_minimum`);
  assert.equal(reasons("26.13.1", floor), "ok");
  assert.equal(reasons("20.19.0", floor), `${NOVEMBER_2026}:unsupported_line`);
});

test("SEC-01 D1: the effective current floor (highest minimum per line) is 22.23.5 / 24.22.3 / 26.13.1", () => {
  const newer = (a: string, b: string) => {
    const [x, y] = [parseNodeVersion(a)!, parseNodeVersion(b)!];
    for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i]! > y[i]!;
    return false;
  };
  const effective: Record<number, string> = {};
  for (const entry of SECURITY_FLOOR)
    for (const [line, minimum] of Object.entries(entry.minimumByLine)) {
      const current = effective[Number(line)];
      if (!current || newer(minimum, current))
        effective[Number(line)] = minimum;
    }
  assert.deepEqual(effective, { 22: "22.23.5", 24: "24.22.3", 26: "26.13.1" });

  // The effective minimums pass the whole table; each version just below them fails.
  for (const version of ["22.23.5", "24.22.3", "26.13.1", "22.30.0"])
    assert.equal(reasons(version), "ok", version);
  // Above the October floor, below the November one: only the November advisory fails.
  for (const version of ["22.23.4", "24.22.1", "24.22.2", "26.12.1", "26.13.0"])
    assert.equal(reasons(version), `${NOVEMBER_2026}:below_minimum`, version);
  // Below both: each advisory reports its own failure.
  for (const version of ["22.23.3", "24.22.0", "26.12.0"])
    assert.equal(
      reasons(version),
      `${NODE2SHELL}:below_minimum,${NOVEMBER_2026}:below_minimum`,
      version,
    );
});

test("SEC-01 D1: other lines and unreadable versions fail closed against every advisory", () => {
  const both = `${NODE2SHELL}:unsupported_line,${NOVEMBER_2026}:unsupported_line`;
  assert.equal(reasons("20.19.0"), both);
  assert.equal(reasons("25.9.0"), both);
  for (const malformed of [
    "",
    "22",
    "22.23",
    "v22.x.4",
    "22.23.5-rc.1",
    "node",
  ])
    assert.equal(reasons(malformed), both, malformed);
});

test("SEC-01 D1: a below-minimum failure carries the current and required versions", () => {
  assert.deepEqual(evaluateRuntimeFloor("v22.1.0"), {
    ok: false,
    failures: [
      {
        id: NODE2SHELL,
        reason: "below_minimum",
        current: "v22.1.0",
        required: "22.23.4",
      },
      {
        id: NOVEMBER_2026,
        reason: "below_minimum",
        current: "v22.1.0",
        required: "22.23.5",
      },
    ],
  });
});

test("SEC-01 D1: the next advisory is one more registry entry, evaluated on its own", () => {
  const floor = [
    ...SECURITY_FLOOR,
    {
      id: "SYNTHETIC-NEXT",
      component: "node" as const,
      minimumByLine: { 22: "22.24.0" },
      publishedAt: "2026-12-01",
      note: "synthetic",
    },
  ];
  const result = evaluateRuntimeFloor("22.23.5", floor);
  assert.deepEqual(result.ok ? [] : result.failures.map((f) => f.id), [
    "SYNTHETIC-NEXT",
  ]);
});

test("SEC-01 D2: production below the floor refuses to start with SECURITY_FLOOR_NOT_MET", () => {
  const warnings: string[] = [];
  assert.throws(
    () =>
      assertRuntimeSecurityFloor({
        nodeEnv: "production",
        version: "v22.23.4",
        log: { warn: (m) => warnings.push(m) },
      }),
    (error) =>
      error instanceof SecurityFloorError &&
      error.code === SECURITY_FLOOR_NOT_MET &&
      error.message.includes(NOVEMBER_2026) &&
      !error.message.includes(NODE2SHELL),
  );
  assert.deepEqual(warnings, []);
});

test("SEC-01 D2: development below the floor warns once with ids and versions; a patched version is silent", () => {
  const warnings: string[] = [];
  const log = { warn: (m: string) => warnings.push(m) };
  assertRuntimeSecurityFloor({
    nodeEnv: "development",
    version: "v24.22.0",
    log,
  });
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0]!.startsWith(SECURITY_FLOOR_NOT_MET));
  assert.ok(
    warnings[0]!.includes(NODE2SHELL) &&
      warnings[0]!.includes(NOVEMBER_2026) &&
      warnings[0]!.includes("v24.22.0") &&
      warnings[0]!.includes("24.22.1") &&
      warnings[0]!.includes("24.22.3"),
  );
  assert.ok(!warnings[0]!.includes("    at "), "no stack");
  assertRuntimeSecurityFloor({
    nodeEnv: "production",
    version: "v24.22.3",
    log,
  });
  assertRuntimeSecurityFloor({ nodeEnv: undefined, version: "v26.13.1", log });
  assertRuntimeSecurityFloor({
    nodeEnv: "production",
    version: "v22.23.5",
    log,
  });
  assert.equal(warnings.length, 1);
});
