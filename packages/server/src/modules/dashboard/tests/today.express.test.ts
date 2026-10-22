import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { TodayController } from "../controllers/today.controller.js";
import { createExpressTodayRouter } from "../routes/express-today.router.js";
import { TodayService, type TodayRepository, type TodaySources } from "../services/today.service.js";

const admin: AuthenticatedSessionContext = { userId: "11111111-1111-1111-1111-111111111111", sessionId: "22222222-2222-2222-2222-222222222222", role: "admin" };
const calls: Array<{ from: string; to: string; statuses: string[] | null }> = [];
const repository: TodayRepository = {
  async listAppointments(from, to, statuses) { calls.push({ from: from.toISOString(), to: to.toISOString(), statuses }); return []; },
  async countRequestsSubmittedSince() { return 3; },
  async countCompletedAppointmentsSince(since) { return since.toISOString() === "2026-10-18T23:00:00.000Z" ? 5 : 1; },
  async listSubscriptionsByStatus() { return []; },
};
const sources: TodaySources = {
  async followUpQueue() { return { asOf: "", items: [] }; },
  async customerOverview() { return { asOf: "", customers: [], counts: { all: 4, active: 2, overdue: 0, preparation: 1, paused: 0, former: 1 } }; },
  async catalogueOverview() { return { asOf: "", services: [] }; },
  async requests() { return []; },
  async onboarding() { return null; },
};
const clock = () => new Date("2026-10-22T09:00:00Z");

async function withServer(run: (url: string) => Promise<void>, session: AuthenticatedSessionContext | null = admin) {
  const app = express();
  app.use(createExpressTodayRouter({ controller: new TodayController(new TodayService(repository, sources, clock)), resolveSession: () => session }));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))); }
}

test("dashboard routes require an admin session", async () => {
  await withServer(async (url) => { for (const path of ["/admin/today", "/admin/appointments"]) assert.equal((await fetch(url + path)).status, 401); }, null);
  await withServer(async (url) => { for (const path of ["/admin/today", "/admin/appointments"]) assert.equal((await fetch(url + path)).status, 403); }, { ...admin, role: "coach" });
});

test("agenda uses Libreville business days (inclusive) and validates its query", async () => {
  await withServer(async (url) => {
    calls.length = 0;
    const ok = await fetch(`${url}/admin/appointments?du=2026-10-22&au=2026-10-23&statut=confirmed,scheduled`);
    assert.equal(ok.status, 200);
    assert.deepEqual(calls[0], { from: "2026-10-21T23:00:00.000Z", to: "2026-10-23T23:00:00.000Z", statuses: ["confirmed", "scheduled"] });
    const today = await fetch(`${url}/admin/appointments`);
    assert.equal(today.status, 200);
    assert.deepEqual(await today.json(), { from: "2026-10-21T23:00:00.000Z", to: "2026-10-22T23:00:00.000Z", appointments: [] });
    for (const q of ["?du=2026-13-01", "?du=2026-10-23&au=2026-10-22", "?du=2026-01-01&au=2026-06-01", "?statut=unknown", "?du=a&du=b"]) {
      const bad = await fetch(`${url}/admin/appointments${q}`);
      assert.equal(bad.status, 400, q);
    }
  });
});

test("today returns KPIs from the owning modules and business-week counts", async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}/admin/today`);
    assert.equal(res.status, 200);
    const body = await res.json() as { businessDate: string; kpis: Record<string, unknown>; tasks: unknown[] };
    assert.equal(body.businessDate, "2026-10-22");
    assert.deepEqual(body.kpis, { activeClients: 2, followUpsOverdue: 0, oldestOverdueDays: null, newRequestsThisWeek: 3, requestsToContact: 0, sessionsCompletedThisWeek: 5, sessionsCompletedToday: 1 });
    assert.deepEqual(body.tasks, []);
  });
});
