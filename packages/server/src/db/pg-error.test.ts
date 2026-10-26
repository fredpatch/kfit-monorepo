import assert from "node:assert/strict";
import test from "node:test";
import { isPgForeignKeyViolation, isPgUniqueViolation, pgErrorInfo } from "./pg-error.js";

const pg = (code: string, constraint?: string) => Object.assign(new Error("driver"), { code, ...(constraint ? { constraint } : {}) });
const wrap = (cause: unknown) => new Error("Failed query", { cause });

test("FIX-02 D1: reads the driver error at the top level and through one or two wrappers", () => {
  assert.deepEqual(pgErrorInfo(pg("23505", "a_uq")), { code: "23505", constraint: "a_uq" });
  assert.deepEqual(pgErrorInfo(wrap(pg("23505", "a_uq"))), { code: "23505", constraint: "a_uq" });
  assert.deepEqual(pgErrorInfo(wrap(wrap(pg("40001")))), { code: "40001", constraint: null });
});

test("FIX-02 D1: a self-referencing cause, a non-pg error and a too-deep chain return null", () => {
  const cyclic = new Error("cycle") as Error & { cause?: unknown };
  cyclic.cause = cyclic;
  assert.equal(pgErrorInfo(cyclic), null);
  assert.equal(pgErrorInfo(new Error("plain")), null);
  assert.equal(pgErrorInfo("23505"), null);
  assert.equal(pgErrorInfo(null), null);
  let deep: unknown = pg("23505");
  for (let i = 0; i < 10; i += 1) deep = wrap(deep);
  assert.equal(pgErrorInfo(deep), null);
});

test("FIX-02 D1: unique and foreign-key predicates match the code and, when given, the constraint", () => {
  const wrapped = wrap(pg("23505", "service_requests_submission_token_uq"));
  assert.ok(isPgUniqueViolation(wrapped));
  assert.ok(isPgUniqueViolation(wrapped, "service_requests_submission_token_uq"));
  assert.equal(isPgUniqueViolation(wrapped, "service_requests_reference_uq"), false);
  assert.equal(isPgUniqueViolation(wrap(pg("23503"))), false);
  assert.ok(isPgForeignKeyViolation(wrap(pg("23503"))));
  assert.equal(isPgForeignKeyViolation(wrapped), false);
});
