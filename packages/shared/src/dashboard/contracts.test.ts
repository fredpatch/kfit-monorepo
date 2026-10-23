import assert from "node:assert/strict";
import test from "node:test";
import { dashboardAlertKinds, dashboardApiRoutes, dashboardErrorCodes, dashboardPeriods } from "./contracts.js";

test("dashboard analytics preserves existing routes and uses closed periods/errors/alerts", () => {
  assert.equal(dashboardApiRoutes.today, "/admin/today"); assert.equal(dashboardApiRoutes.appointments, "/admin/appointments");
  assert.equal(dashboardApiRoutes.analytics, "/admin/dashboard/analytics"); assert.equal(dashboardApiRoutes.alerts, "/admin/dashboard/alerts");
  assert.deepEqual(dashboardPeriods, ["4w", "8w", "12m"]);
  assert.equal(new Set(dashboardAlertKinds).size, 7); assert.equal(new Set(dashboardErrorCodes).size, dashboardErrorCodes.length);
  assert.ok(dashboardErrorCodes.every(code => code.startsWith("DASHBOARD_")));
});
