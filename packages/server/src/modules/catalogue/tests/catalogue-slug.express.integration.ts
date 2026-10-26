import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import express from "express";
import { like } from "drizzle-orm";
import { catalogueApiRoutes } from "@kfit/shared";
import { db, pool } from "../../../db/client.js";
import { services } from "../../../db/schema/catalogue.js";
import { assertLocalTestDatabase, testFixtureName } from "../../../testing/integration-fixtures.js";
import { authCookieNames } from "../../auth/middleware/auth.cookies.js";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { CatalogueController } from "../controllers/catalogue.controller.js";
import { DrizzleCatalogueRepository } from "../repositories/catalogue.repositories.js";
import { createExpressCatalogueRouter } from "../routes/express-catalogue.router.js";
import { CatalogueService } from "../services/catalogue.service.js";

const admin: AuthenticatedSessionContext = { userId: randomUUID(), sessionId: randomUUID(), role: "admin" };
const csrf = "synthetic-slug-csrf";
const headers = { "content-type": "application/json", cookie: `${authCookieNames.csrfToken}=${csrf}`, "x-csrf-token": csrf };
const slugPrefix = `fix02-slug-${randomUUID().slice(0, 8)}`;
let safe = false;

before(() => { assertLocalTestDatabase(); safe = true; });
after(async () => {
  try {
    if (safe) await db.delete(services).where(like(services.slug, `${slugPrefix}%`));
  } finally {
    await pool.end();
  }
});

async function withRouter(run: (url: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use(createExpressCatalogueRouter({ controller: new CatalogueController(new CatalogueService(new DrizzleCatalogueRepository(db))), resolveSession: () => admin }));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const create = (url: string, slug: string) => fetch(url + catalogueApiRoutes.adminServices, {
  method: "POST", headers, body: JSON.stringify({ name: testFixtureName("Slug offer"), slug, pricingMode: "quote", deliveryType: "one_time", capacityMode: "unlimited" }),
});

test("FIX-02 D2: a duplicate offer slug (wrapped 23505) answers 409 CATALOGUE_SERVICE_SLUG_CONFLICT on create and update, not 500", async () => {
  await withRouter(async (url) => {
    const first = await create(url, `${slugPrefix}-a`);
    assert.equal(first.status, 201);
    const duplicate = await create(url, `${slugPrefix}-a`);
    assert.equal(duplicate.status, 409);
    assert.deepEqual(await duplicate.json(), { error: "CATALOGUE_SERVICE_SLUG_CONFLICT" });

    const second = await create(url, `${slugPrefix}-b`);
    assert.equal(second.status, 201);
    const { service } = await second.json() as { service: { id: string } };
    const renamed = await fetch(url + catalogueApiRoutes.adminService.replace(":serviceId", service.id), { method: "PATCH", headers, body: JSON.stringify({ slug: `${slugPrefix}-a` }) });
    assert.equal(renamed.status, 409);
    assert.deepEqual(await renamed.json(), { error: "CATALOGUE_SERVICE_SLUG_CONFLICT" });
  });
});
