import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertLocalTestDatabase, cleanupInOrder, isLocalTestDatabase, testFixtureName, uniqueTestWhatsapp } from "./integration-fixtures.js";

test("TEST-01 integration guard accepts only local kfit_test on 5433 (D1)", () => {
  assert.equal(isLocalTestDatabase("postgres://u:p@localhost:5433/kfit_test"), true);
  assert.equal(isLocalTestDatabase("postgresql://u:p@127.0.0.1:5433/kfit_test"), true);
  for (const url of ["postgres://u:p@localhost:5433/kfit_dev", "postgres://u:p@localhost:5432/kfit_test", "postgres://u:p@db.example.com:5433/kfit_test",
    "postgres://u:p@localhost:5433/kfit_prod", "postgres://u:p@localhost:5433/kfit_test?sslmode=require", "mysql://u:p@localhost:5433/kfit_test", "", undefined, "not a url"]) assert.equal(isLocalTestDatabase(url), false, String(url));
  assert.throws(() => assertLocalTestDatabase("postgres://u:p@localhost:5433/kfit_dev"), /kfit_test/);
});

test("TEST-01 every integration file uses the single guard, with no inline kfit_dev copy (D1)", () => {
  const sourceRoot = fileURLToPath(new URL("../../src/", import.meta.url));
  const files = readdirSync(sourceRoot, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".integration.ts"));
  assert.ok(files.length > 0);
  const offenders = files.filter((file) => {
    const source = readFileSync(path.join(sourceRoot, file), "utf8");
    return source.includes("/kfit_dev") || source.includes("new URL(process.env.DATABASE_URL") || !source.includes("assertLocalTestDatabase()");
  });
  assert.deepEqual(offenders, []);
});

test("POL-01 cleanup runs every step even after a failure and reports the failed ones (D1)", async () => {
  const ran: string[] = [];
  await assert.rejects(cleanupInOrder([
    ["requests", async () => { ran.push("requests"); throw new Error("FK violation"); }],
    ["prospects", async () => { ran.push("prospects"); }],
    ["service", async () => { ran.push("service"); }],
  ]), (error: unknown) => error instanceof AggregateError && error.message.includes("requests") && !error.message.includes("service"));
  assert.deepEqual(ran, ["requests", "prospects", "service"]);
});

test("POL-01 fixtures are marked and never share a WhatsApp number (D1)", () => {
  assert.equal(testFixtureName("Integration test service"), "[TEST] Integration test service");
  const numbers = new Set(Array.from({ length: 50 }, () => uniqueTestWhatsapp()));
  assert.equal(numbers.size, 50);
  for (const number of numbers) assert.match(number, /^\+241\d{8}$/);
});
