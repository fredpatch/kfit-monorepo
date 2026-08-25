import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { catalogueApiRoutes } from "@kfit/shared";
import { createExpressCatalogueRouter } from "../routes/express-catalogue.router.js";
import { CatalogueController } from "../controllers/catalogue.controller.js";

async function withTestServer<T>(controller: CatalogueController, run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(createExpressCatalogueRouter({ controller }));
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

test("catalogue Express router exposes public service list without auth", async () => {
  const controller = new CatalogueController({
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
  });

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${catalogueApiRoutes.publicServices}`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
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
    });
  });
});

test("catalogue Express router returns stable error on unexpected failures", async () => {
  const controller = new CatalogueController({
    async listPublicServices() {
      throw new Error("boom");
    },
  });

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${catalogueApiRoutes.publicServices}`);

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" });
  });
});
