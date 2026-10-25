import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames, notificationSettingDefaults } from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { NotificationsController } from "../controllers/notifications.controller.js";
import { createExpressNotificationsRouter } from "../routes/express-notifications.router.js";

const admin: AuthenticatedSessionContext = { userId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222", role: "admin" };
const known = "33333333-3333-4333-8333-333333333333", csrf = "synthetic-notification-csrf";
const writeHeaders = { "content-type": "application/json", cookie: `${authCookieNames.csrfToken}=${csrf}`, "x-csrf-token": csrf };

async function withServer(run: (url: string, calls: string[]) => Promise<void>, session: AuthenticatedSessionContext | null = admin, fail = false) {
  const calls: string[] = [];
  const item = { id: known, kind: "follow_up_overdue", severity: "warning", title: "Suivi en retard", summary: "Coaching", customerDisplayName: "Awa N.", deepLink: "/admin", occurredAt: null,
    firstDetectedAt: "2026-10-24T08:00:00.000Z", lastDetectedAt: "2026-10-24T08:00:00.000Z", readAt: null, resolvedAt: null } as const;
  const repository = {
    async list(userId: string, view: string) { if (fail) throw new Error("secret health note"); calls.push(`list:${userId}:${view}`); return { items: [item], nextCursor: null }; },
    async counts() { return { unread: 4, open: 6 }; },
    async markRead(id: string, actor: { userId: string }) { calls.push(`read:${id}:${actor.userId}`); return id === known ? { ...item, readAt: "2026-10-24T09:00:00.000Z" } : null; },
    async markAllRead() { calls.push("read_all"); return 3; },
    async settings() { return { settings: notificationSettingDefaults(), updatedAt: null }; },
    async updateSettings(update: object) { calls.push(`settings:${JSON.stringify(update)}`); return { settings: { ...notificationSettingDefaults(), ...update }, updatedAt: new Date("2026-10-24T09:00:00Z") }; },
  };
  const app = express(); app.use(express.json());
  app.use(createExpressNotificationsRouter({ controller: new NotificationsController(repository), resolveSession: () => session }));
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

for (const [session, expected] of [[null, 401], [{ ...admin, role: "coach" }, 403]] as const) test(`notification endpoints answer ${expected} without an admin session`, async () => {
  await withServer(async (url) => {
    for (const path of ["/admin/notifications", "/admin/notifications/unread-count", "/admin/notification-settings"]) assert.equal((await fetch(`${url}${path}`)).status, expected);
    assert.equal((await fetch(`${url}/admin/notifications/read-all`, { method: "POST", headers: writeHeaders, body: "{}" })).status, expected);
  }, session);
});

test("admin reads own notifications with no-store; list views and cursors are validated", async () => {
  await withServer(async (url, calls) => {
    const response = await fetch(`${url}/admin/notifications`);
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(((await response.json()) as { items: unknown[] }).items.length, 1);
    assert.deepEqual(await (await fetch(`${url}/admin/notifications/unread-count`)).json(), { unread: 4, open: 6 });
    assert.equal((await fetch(`${url}/admin/notifications?vue=resolved`)).status, 200);
    for (const query of ["vue=all", "vue=active&curseur=abc", "vue=resolved&curseur=bad", "autre=1"]) assert.equal((await fetch(`${url}/admin/notifications?${query}`)).status, 400, query);
    assert.deepEqual(calls, [`list:${admin.userId}:active`, `list:${admin.userId}:resolved`]);
  });
});

test("writes require CSRF; read is scoped to the session user and 404s otherwise", async () => {
  await withServer(async (url, calls) => {
    assert.equal((await fetch(`${url}/admin/notifications/${known}/read`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 403);
    assert.equal((await fetch(`${url}/admin/notifications/${known}/read`, { method: "POST", headers: { ...writeHeaders, origin: "https://evil.example" }, body: "{}" })).status, 403);
    assert.equal((await fetch(`${url}/admin/notifications/${known}/read`, { method: "POST", headers: writeHeaders, body: "{}" })).status, 200);
    assert.equal((await fetch(`${url}/admin/notifications/44444444-4444-4444-8444-444444444444/read`, { method: "POST", headers: writeHeaders, body: "{}" })).status, 404);
    assert.equal((await fetch(`${url}/admin/notifications/not-a-uuid/read`, { method: "POST", headers: writeHeaders, body: "{}" })).status, 400);
    assert.deepEqual(await (await fetch(`${url}/admin/notifications/read-all`, { method: "POST", headers: writeHeaders, body: "{}" })).json(), { updated: 3 });
    assert.deepEqual(calls, [`read:${known}:${admin.userId}`, `read:44444444-4444-4444-8444-444444444444:${admin.userId}`, "read_all"]);
  });
});

test("settings accept only known typed keys in range", async () => {
  await withServer(async (url, calls) => {
    assert.equal(((await (await fetch(`${url}/admin/notification-settings`)).json()) as { settings: Record<string, unknown> }).settings["notifications.daily_digest.hour"], 8);
    for (const settings of [{}, { "notifications.unknown": true }, { "notifications.daily_digest.hour": 24 }, { "notifications.email.enabled": "yes" }, { "notifications.follow_up_overdue.reminder_days": 1.5 }]) {
      const response = await fetch(`${url}/admin/notification-settings`, { method: "PUT", headers: writeHeaders, body: JSON.stringify({ settings }) });
      assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: "NOTIFICATION_SETTINGS_INVALID" });
    }
    const ok = await fetch(`${url}/admin/notification-settings`, { method: "PUT", headers: writeHeaders, body: JSON.stringify({ settings: { "notifications.daily_digest.hour": 7 } }) });
    assert.equal(ok.status, 200);
    assert.deepEqual(calls, ['settings:{"notifications.daily_digest.hour":7}']);
  });
});

test("unexpected failures are redacted", async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/admin/notifications`);
    assert.equal(response.status, 500); assert.deepEqual(await response.json(), { error: "NOTIFICATION_ROUTE_UNEXPECTED_FAILURE" });
  }, admin, true);
});
