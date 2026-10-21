import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames, questionnaireApiRoutes } from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { QuestionnaireController } from "../controllers/questionnaire.controller.js";
import { createExpressQuestionnaireRouter } from "../routes/express-questionnaire.router.js";
import { QuestionnaireService, QuestionnaireTemplateService, type QuestionnaireRepository, type TemplateRepository, type QuestionnaireResult } from "../services/questionnaire.service.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import { syntheticTemplate } from "./questionnaire.fixtures.js";
const id = randomUUID(), csrf = "synthetic-questionnaire-csrf";
const session: AuthenticatedSessionContext = { userId: id, sessionId: id, role: "admin" };
const headers = { "content-type": "application/json", cookie: `${authCookieNames.csrfToken}=${csrf}`, "x-csrf-token": csrf };
const ok: QuestionnaireResult = { ok: true, body: { result: { outcome: "submitted", submissionId: id, revisionNumber: 1 } } };
const repository: QuestionnaireRepository = { async execute() { return ok; }, async publicAccess(_token, _input, _actor, rejected) { return rejected ? { ok: false, error: "QUESTIONNAIRE_INVALID_INPUT" } : ok; } };
const templateRepository: TemplateRepository = { async execute() { return ok; } };
const routes = [
  ...Object.entries(questionnaireApiRoutes).filter(([key]) => key !== "public").map(([action, route]) => ({ action, path: route.replace(":subscriptionId", id).replace(":templateId", id).replace(":tokenId", id), method: ["templates", "detail"].includes(action) ? "GET" : "POST" })),
  { action: "create", path: questionnaireApiRoutes.templates, method: "POST" },
];
async function withServer(run: (base: string) => Promise<void>, repo = repository, templates = templateRepository, auth: AuthenticatedSessionContext | null = session, max = 100) {
  const app = express(); app.use(express.json()); app.use(createExpressQuestionnaireRouter({ controller: new QuestionnaireController(new QuestionnaireService(repo), new QuestionnaireTemplateService(templates)), resolveSession: () => auth,
    rateLimiter: new IpRateLimiter({ windowMs: 60000, maxPerWindow: max }) }));
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
for (const role of [null, "coach"] as const) test(`every questionnaire admin route denies ${role ?? "anonymous"} callers`, async () => {
  await withServer(async base => { for (const route of routes) { const response = await fetch(base + route.path, { method: route.method, headers, ...(route.method === "POST" ? { body: "{}" } : {}) }); assert.equal(response.status, role ? 403 : 401); } },
    { ...repository, async execute() { assert.fail("unauthorized write"); } }, { async execute() { assert.fail("unauthorized template write"); } }, role ? { ...session, role } : null);
});
test("every questionnaire admin mutation requires CSRF and same origin", async () => {
  await withServer(async base => { for (const route of routes.filter(r => r.method === "POST")) {
    const missing = await fetch(base + route.path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); assert.equal(missing.status, 403);
    const foreign = await fetch(base + route.path, { method: "POST", headers: { ...headers, origin: "https://foreign.invalid" }, body: "{}" }); assert.equal(foreign.status, 403);
  } });
});
test("authorized questionnaire routes transport caller-owned fields and authenticated provenance", async () => {
  const seen: string[] = [];
  await withServer(async base => { for (const route of routes) {
    const body = ["create", "newVersion"].includes(route.action) ? syntheticTemplate() : route.action === "link" ? { expiresAt: "2030-01-01T00:00:00Z" }
      : route.action === "coachSubmit" ? { templateId: id, templateVersion: 1, schemaHash: "0".repeat(64), expectedHeadId: null, answers: [] } : {};
    const response = await fetch(base + route.path, { method: route.method, headers: { ...headers, origin: base }, ...(route.method === "POST" ? { body: JSON.stringify(body) } : {}) }); assert.equal(response.status, 200);
  } }, { ...repository, async execute(_id, command, actor) { assert.equal(actor.userId, id); seen.push(command.action); return ok; } },
    { async execute(command, actor) { assert.equal(actor.userId, id); seen.push(command.action); return ok; } });
  assert.equal(seen.length, routes.length);
});
test("public questionnaire endpoints need no session/CSRF but forbid foreign origin", async () => {
  await withServer(async base => {
    assert.equal((await fetch(base + "/public/questionnaires/synthetic")).status, 200);
    const init = { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ answers: [], healthDataDecision: "refused" }) };
    assert.equal((await fetch(base + "/public/questionnaires/synthetic", init)).status, 200);
    assert.equal((await fetch(base + "/public/questionnaires/synthetic", { ...init, headers: { ...init.headers, origin: "https://foreign.invalid" } })).status, 403);
  }, repository, templateRepository, null);
});
test("public questionnaire DTO rejects template/version/definition overrides", async () => {
  await withServer(async base => { const response = await fetch(base + "/public/questionnaires/synthetic", { method: "POST", headers, body: JSON.stringify({ answers: [], templateId: id }) }); assert.equal(response.status, 400); });
});
test("questionnaire public reads are rate limited and never cache sensitive schema", async () => {
  await withServer(async base => {
    const first = await fetch(base + "/public/questionnaires/synthetic"); assert.equal(first.headers.get("cache-control"), "no-store"); assert.equal(first.headers.get("referrer-policy"), "no-referrer");
    assert.equal((await fetch(base + "/public/questionnaires/synthetic")).status, 429);
  }, repository, templateRepository, null, 1);
});
test("questionnaire public errors are typed and internal details are redacted", async () => {
  await withServer(async base => { const response = await fetch(base + "/public/questionnaires/synthetic"); assert.equal(response.status, 410); assert.deepEqual(await response.json(), { error: "QUESTIONNAIRE_LINK_CONSUMED" }); },
    { ...repository, async publicAccess() { return { ok: false, error: "QUESTIONNAIRE_LINK_CONSUMED" }; } });
  await withServer(async base => { const response = await fetch(base + "/public/questionnaires/synthetic"); assert.equal(response.status, 500); assert.deepEqual(await response.json(), { error: "QUESTIONNAIRE_ROUTE_UNEXPECTED_FAILURE" }); },
    { ...repository, async publicAccess() { throw new Error("SYNTHETIC PRIVATE ANSWER / SQL / token"); } });
});
