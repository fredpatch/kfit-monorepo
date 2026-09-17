import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { catalogueApiRoutes, type CatalogueAdminService } from "@kfit/shared";
import { createExpressCatalogueRouter } from "../routes/express-catalogue.router.js";
import { CatalogueController } from "../controllers/catalogue.controller.js";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { authCookieNames } from "../../auth/middleware/auth.cookies.js";

type CatalogueServiceFake = ConstructorParameters<typeof CatalogueController>[0];

const adminSession: AuthenticatedSessionContext = {
  userId: "11111111-1111-1111-1111-111111111111",
  sessionId: "22222222-2222-2222-2222-222222222222",
  role: "admin",
};

const coachSession: AuthenticatedSessionContext = {
  ...adminSession,
  role: "coach",
};

const adminService: CatalogueAdminService = {
  id: "service-1",
  name: "Coaching nutrition",
  slug: "coaching-nutrition",
  description: null,
  pricingMode: "fixed",
  basePriceXaf: 75000,
  deliveryType: "time_based",
  defaultDurationValue: 1,
  defaultDurationUnit: "month",
  availabilityStatus: "open",
  capacityMode: "unlimited",
  capacityLimit: null,
  waitlistEnabled: false,
  isPublic: true,
  sortOrder: 1,
  publishedAt: "2026-08-25T08:00:00.000Z",
  archivedAt: null,
  updatedAt: "2026-08-25T08:00:00.000Z",
};

function makeService(overrides: Partial<CatalogueServiceFake> = {}): CatalogueServiceFake {
  return {
    async listPublicServices() {
      return {
        services: [
          {
            id: "service-1",
            name: "Coaching nutrition",
            slug: "coaching-nutrition",
            description: null,
            pricingMode: "fixed",
            basePriceXaf: 75000,
            deliveryType: "time_based",
            defaultDurationValue: 1,
            defaultDurationUnit: "month",
            availabilityStatus: "open",
            capacityMode: "unlimited",
            capacityLimit: null,
            waitlistEnabled: false,
            publishedAt: "2026-08-25T08:00:00.000Z",
            components: [],
            policy: null,
            variants: [],
          },
        ],
      };
    },
    async listAdminServices() {
      return { services: [adminService] };
    },
    async createAdminService() {
      return { status: "ok", response: { service: { ...adminService, id: "service-created", isPublic: false, publishedAt: null } } };
    },
    async updateAdminService() {
      return { status: "ok", response: { service: { ...adminService, name: "Updated" } } };
    },
    async publishAdminService() {
      return { status: "ok", response: { service: adminService } };
    },
    async archiveAdminService() {
      return { status: "ok", response: { service: { ...adminService, availabilityStatus: "archived", isPublic: false } } };
    },
    async updateAdminServiceCapacity() {
      return { status: "ok", response: { service: { ...adminService, availabilityStatus: "waitlist_only", capacityMode: "limited", capacityLimit: 6, waitlistEnabled: true } } };
    },
    async reorderAdminServices() {
      return { status: "ok", response: { services: [{ ...adminService, sortOrder: 9 }] } };
    },
    ...overrides,
  };
}

async function withTestServer<T>(
  controller: CatalogueController,
  run: (baseUrl: string) => Promise<T>,
  resolveSession: () => AuthenticatedSessionContext | null = () => null,
): Promise<T> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(createExpressCatalogueRouter({ controller, resolveSession }));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error("Test server did not expose a TCP address");

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function csrfHeaders() {
  const csrf = "csrf-token";
  return {
    "content-type": "application/json",
    cookie: `${authCookieNames.csrfToken}=${csrf}`,
    "x-csrf-token": csrf,
  };
}

test("catalogue Express router exposes public service list without auth", async () => {
  const controller = new CatalogueController(makeService());

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${catalogueApiRoutes.publicServices}`);

    assert.equal(response.status, 200);
    assert.equal((await response.json() as { services: Array<{ slug: string }> }).services[0]?.slug, "coaching-nutrition");
  });
});

test("catalogue Express router returns stable error on unexpected failures", async () => {
  const controller = new CatalogueController(makeService({
    async listPublicServices() {
      throw new Error("boom");
    },
  }));

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${catalogueApiRoutes.publicServices}`);

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" });
  });
});

test("catalogue admin routes require an authenticated admin session", async () => {
  const controller = new CatalogueController(makeService());

  await withTestServer(controller, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}${catalogueApiRoutes.adminServices}`);
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { error: "AUTH_SESSION_REQUIRED" });
  });

  await withTestServer(controller, async (baseUrl) => {
    const forbidden = await fetch(`${baseUrl}${catalogueApiRoutes.adminServices}`);
    assert.equal(forbidden.status, 403);
    assert.deepEqual(await forbidden.json(), { error: "CATALOGUE_ADMIN_FORBIDDEN" });
  }, () => coachSession);
});

test("catalogue admin routes list and mutate services with CSRF", async () => {
  const controller = new CatalogueController(makeService());

  await withTestServer(controller, async (baseUrl) => {
    const list = await fetch(`${baseUrl}${catalogueApiRoutes.adminServices}`);
    assert.equal(list.status, 200);
    assert.equal((await list.json() as { services: Array<{ slug: string }> }).services[0]?.slug, "coaching-nutrition");

    const missingCsrf = await fetch(`${baseUrl}${catalogueApiRoutes.adminServices}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(missingCsrf.status, 403);
    assert.deepEqual(await missingCsrf.json(), { error: "AUTH_CSRF_INVALID" });

    const created = await fetch(`${baseUrl}${catalogueApiRoutes.adminServices}`, {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify({
        name: "Bilan individuel",
        slug: "bilan-individuel",
        pricingMode: "quote",
        deliveryType: "one_time",
        capacityMode: "unlimited",
      }),
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json() as { service: { id: string } }).service.id, "service-created");

    const updated = await fetch(`${baseUrl}/admin/catalogue/services/service-1`, {
      method: "PATCH",
      headers: csrfHeaders(),
      body: JSON.stringify({ name: "Updated" }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json() as { service: { name: string } }).service.name, "Updated");

    const capacity = await fetch(`${baseUrl}/admin/catalogue/services/service-1/capacity`, {
      method: "PATCH",
      headers: csrfHeaders(),
      body: JSON.stringify({
        availabilityStatus: "waitlist_only",
        capacityMode: "limited",
        capacityLimit: 6,
        waitlistEnabled: true,
      }),
    });
    assert.equal(capacity.status, 200);
    const capacityBody = await capacity.json() as { service: { availabilityStatus: string; capacityLimit: number } };
    assert.equal(capacityBody.service.availabilityStatus, "waitlist_only");
    assert.equal(capacityBody.service.capacityLimit, 6);

    const reordered = await fetch(`${baseUrl}${catalogueApiRoutes.adminServiceOrder}`, {
      method: "PATCH",
      headers: csrfHeaders(),
      body: JSON.stringify({ items: [{ serviceId: "service-1", sortOrder: 9 }] }),
    });
    assert.equal(reordered.status, 200);
    assert.equal((await reordered.json() as { services: Array<{ sortOrder: number }> }).services[0]?.sortOrder, 9);
  }, () => adminSession);
});
