import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { catalogueApiRoutes } from "@kfit/shared";
import { authCookieNames } from "../../auth/middleware/auth.cookies.js";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { CatalogueController } from "../controllers/catalogue.controller.js";
import type { CatalogueContentError } from "../repositories/catalogue-content.repository.js";
import { createExpressCatalogueRouter } from "../routes/express-catalogue.router.js";
import { CatalogueContentService, type CatalogueContentAction, type CatalogueContentRepository } from "../services/catalogue-content.service.js";

const serviceId = "21000000-0000-4000-8000-000000000003", variantId = "22000000-0000-4000-8000-000000000003", componentId = "23000000-0000-4000-8000-000000000005";
const admin: AuthenticatedSessionContext = { userId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222", role: "admin" };
const csrf = { "content-type": "application/json", cookie: `${authCookieNames.csrfToken}=c`, "x-csrf-token": "c" };
const path = (route: string) => route.replace(":serviceId", serviceId).replace(":variantId", variantId).replace(":componentId", componentId);
const routes: Array<{ method: string; route: string; body?: object }> = [
  { method: "POST", route: catalogueApiRoutes.adminVariants, body: { name: "Premium", slug: "premium" } },
  { method: "PATCH", route: catalogueApiRoutes.adminVariant, body: { priceXaf: 1 } },
  { method: "POST", route: catalogueApiRoutes.adminVariantArchive },
  { method: "POST", route: catalogueApiRoutes.adminComponents, body: { componentType: "appointment", label: "Séance", quantity: 1 } },
  { method: "PATCH", route: catalogueApiRoutes.adminComponent, body: { label: "Séance" } },
  { method: "POST", route: catalogueApiRoutes.adminComponentArchive },
  { method: "PUT", route: catalogueApiRoutes.adminServiceRules, body: { followUpFrequencyDays: 7, lateCancelNoticeHours: null, lateCancelConsumesComponent: false, missedConsumesComponent: false, medicalClearancePolicy: "required" } },
  { method: "PUT", route: catalogueApiRoutes.adminVariantRules, body: { followUpFrequencyDays: null, lateCancelNoticeHours: null, lateCancelConsumesComponent: false, missedConsumesComponent: false, medicalClearancePolicy: null } },
  { method: "DELETE", route: catalogueApiRoutes.adminVariantRules },
  { method: "GET", route: catalogueApiRoutes.adminServiceDeliverability },
];

function repository(seen: CatalogueContentAction[], error?: CatalogueContentError): CatalogueContentRepository {
  const answer = (action: CatalogueContentAction, value: unknown) => async () => { seen.push(action); return error ? { ok: false as const, error } : { ok: true as const, value } as never; };
  return {
    createVariant: answer("variant_create", { id: variantId }), updateVariant: answer("variant_update", { id: variantId }), archiveVariant: answer("variant_archive", { id: variantId }),
    createComponent: answer("component_create", { id: componentId }), updateComponent: answer("component_update", { id: componentId }), archiveComponent: answer("component_archive", { id: componentId }),
    putRules: answer("rules_put", { value: { serviceId }, onboardingSubscriptionsAffected: 1 }), removeVariantRules: answer("variant_rules_delete", { value: true, onboardingSubscriptionsAffected: 0 }),
    deliverability: answer("deliverability", { serviceId, deliverable: true, failures: [] }),
  };
}
const unused = () => { throw new Error("not used"); };
const catalogueFake = { listPublicServices: unused, listAdminServices: unused, listAdminOverview: unused, createAdminService: unused, updateAdminService: unused,
  archiveAdminService: unused, updateAdminServiceCapacity: unused, reorderAdminServices: unused,
  async publishAdminService() { return { status: "not_deliverable" as const, failures: [{ rule: "service_rules_missing" as const, variantId: null }] }; } };

async function serve(run: (base: string) => Promise<void>, options: { session?: AuthenticatedSessionContext | null; error?: CatalogueContentError; seen?: CatalogueContentAction[] } = {}) {
  const controller = new CatalogueController(catalogueFake, new CatalogueContentService(repository(options.seen ?? [], options.error)));
  const app = express(); app.use(express.json());
  app.use(createExpressCatalogueRouter({ controller, resolveSession: async () => options.session === undefined ? admin : options.session }));
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
const call = (base: string, r: (typeof routes)[number], headers: Record<string, string> = csrf) =>
  fetch(base + path(r.route), { method: r.method, headers, ...(r.method === "GET" || !r.body ? {} : { body: JSON.stringify(r.body) }) });

for (const [label, session, status] of [["unauthenticated", null, 401], ["coach", { ...admin, role: "coach" as const }, 403]] as const) test(`CAT-03 content routes reject ${label} callers`, async () => {
  const seen: CatalogueContentAction[] = [];
  await serve(async base => { for (const r of routes) assert.equal((await call(base, r)).status, status, `${r.method} ${r.route}`); }, { session, seen });
  assert.deepEqual(seen, []);
});

test("CAT-03 content mutations require CSRF and same origin; the deliverability read does not", async () => {
  const seen: CatalogueContentAction[] = [];
  await serve(async base => {
    for (const r of routes.filter(r => r.method !== "GET")) {
      assert.equal((await call(base, r, { "content-type": "application/json" })).status, 403, `${r.method} ${r.route} without CSRF`);
      assert.equal((await call(base, r, { ...csrf, origin: "https://foreign.invalid" })).status, 403, `${r.method} ${r.route} foreign origin`);
    }
    assert.equal((await call(base, routes.at(-1)!, {})).status, 200);
  }, { seen });
  assert.deepEqual(seen, ["deliverability"]);
});

test("CAT-03 admin reaches every content action; creates answer 201 and rules report the affected count", async () => {
  const seen: CatalogueContentAction[] = [];
  await serve(async base => {
    const statuses = [];
    for (const r of routes) statuses.push((await call(base, r)).status);
    assert.deepEqual(statuses, [201, 200, 200, 201, 200, 200, 200, 200, 200, 200]);
    assert.deepEqual(await (await call(base, routes[6]!)).json(), { rules: { serviceId }, onboardingSubscriptionsAffected: 1 });
  }, { seen });
  assert.deepEqual(seen.slice(0, 10), ["variant_create", "variant_update", "variant_archive", "component_create", "component_update", "component_archive", "rules_put", "rules_put", "variant_rules_delete", "deliverability"]);
});

test("CAT-03 errors map to explicit codes", async () => {
  for (const [error, status, code] of [["variant_slug_conflict", 409, "CATALOGUE_VARIANT_SLUG_CONFLICT"], ["variant_not_found", 404, "CATALOGUE_VARIANT_NOT_FOUND"],
    ["variant_archived", 409, "CATALOGUE_VARIANT_ARCHIVED"], ["component_archived", 409, "CATALOGUE_COMPONENT_ARCHIVED"], ["service_archived", 409, "CATALOGUE_SERVICE_ARCHIVED"],
    ["override_not_found", 404, "CATALOGUE_RULES_OVERRIDE_NOT_FOUND"], ["override_has_questionnaire", 409, "CATALOGUE_RULES_OVERRIDE_HAS_QUESTIONNAIRE"]] as const) {
    await serve(async base => {
      const response = await call(base, routes[1]!); assert.equal(response.status, status, error); assert.deepEqual(await response.json(), { error: code });
    }, { error });
  }
  await serve(async base => {
    const bad = await fetch(base + path(catalogueApiRoutes.adminComponents), { method: "POST", headers: csrf, body: JSON.stringify({ componentType: "massage", label: "X", quantity: 1 }) });
    assert.equal(bad.status, 400); assert.deepEqual(await bad.json(), { error: "CATALOGUE_SERVICE_INVALID_INPUT", reason: "component_type_invalid" });
    const malformed = await fetch(base + catalogueApiRoutes.adminVariant.replace(":serviceId", serviceId).replace(":variantId", "nope"), { method: "PATCH", headers: csrf, body: "{}" });
    assert.equal(malformed.status, 404); assert.deepEqual(await malformed.json(), { error: "CATALOGUE_VARIANT_NOT_FOUND" });
    const archiveBody = await fetch(base + path(catalogueApiRoutes.adminVariantArchive), { method: "POST", headers: csrf, body: JSON.stringify({ archivedAt: null }) });
    assert.equal(archiveBody.status, 400);
  });
});

test("CAT-03 publish of an undeliverable offer answers 409 with the failed rules (D6)", async () => {
  await serve(async base => {
    const response = await fetch(base + path(catalogueApiRoutes.adminServicePublish), { method: "POST", headers: csrf, body: "{}" });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "CATALOGUE_SERVICE_NOT_DELIVERABLE", failures: [{ rule: "service_rules_missing", variantId: null }] });
  });
});
