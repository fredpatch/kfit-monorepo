import assert from "node:assert/strict";
import test from "node:test";
import { cleanupInOrder, isLocalTestDatabase, testFixtureName, uniqueTestWhatsapp } from "./integration-fixtures.js";

test("POL-01 integration guard accepts only local kfit_dev on 5433 (D1)", () => {
  assert.equal(isLocalTestDatabase("postgres://u:p@localhost:5433/kfit_dev"), true);
  assert.equal(isLocalTestDatabase("postgres://u:p@127.0.0.1:5433/kfit_dev"), true);
  for (const url of ["postgres://u:p@localhost:5432/kfit_dev", "postgres://u:p@db.example.com:5433/kfit_dev", "postgres://u:p@localhost:5433/kfit_prod",
    "postgres://u:p@localhost:5433/kfit_dev?sslmode=require", "", undefined, "not a url"]) assert.equal(isLocalTestDatabase(url), false, String(url));
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
