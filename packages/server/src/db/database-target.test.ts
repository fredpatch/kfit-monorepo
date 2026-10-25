import assert from "node:assert/strict";
import test from "node:test";
import { localDatabaseName, namesIntegrationTestDatabase } from "./database-target.js";

test("TEST-01 local database names come only from the K'FIT Docker port without overrides (D1, D4)", () => {
  assert.equal(localDatabaseName("postgresql://u:p@localhost:5433/kfit_dev"), "kfit_dev");
  assert.equal(localDatabaseName("postgres://u:p@127.0.0.1:5433/kfit_test"), "kfit_test");
  for (const url of ["postgresql://u:p@localhost:5432/kfit_dev", "postgresql://u:p@db.example.com:5433/kfit_dev", "postgresql://u:p@localhost:5433/kfit_dev?host=remote",
    "http://localhost:5433/kfit_dev", "postgresql://u:p@localhost:5433/", "", undefined, "nope"]) assert.equal(localDatabaseName(url), null, String(url));
});

test("TEST-01 the dev API refuses any URL naming kfit_test, local or not (D1)", () => {
  for (const url of ["postgresql://u:p@localhost:5433/kfit_test", "postgresql://u:p@db.example.com:5432/kfit_test"]) assert.equal(namesIntegrationTestDatabase(url), true, url);
  for (const url of ["postgresql://u:p@localhost:5433/kfit_dev", "postgresql://u:p@localhost:5433/kfit_test_copy", undefined, "nope"]) assert.equal(namesIntegrationTestDatabase(url), false, String(url));
});
