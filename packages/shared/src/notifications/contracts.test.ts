import assert from "node:assert/strict";
import test from "node:test";
import { emailEnabledKey, notificationKinds, notificationSettingDefaults, notificationSettingRegistry, parseNotificationSettingsUpdate, reminderDaysKey } from "./contracts.js";

test("notification settings defaults: e-mail on, digest 08:00, per-kind e-mails off", () => {
  const d = notificationSettingDefaults();
  assert.equal(d["notifications.email.enabled"], true);
  assert.equal(d["notifications.daily_digest.enabled"], true);
  assert.equal(d["notifications.daily_digest.hour"], 8);
  for (const kind of notificationKinds) assert.equal(d[emailEnabledKey(kind)], false);
});

test("every kind has an email_enabled key; reminder_days only for overdue follow-ups and installments", () => {
  for (const kind of notificationKinds) assert.ok(Object.hasOwn(notificationSettingRegistry, emailEnabledKey(kind)));
  assert.deepEqual(notificationKinds.filter((k) => reminderDaysKey(k)), ["follow_up_overdue", "installment_overdue"]);
});

test("settings update rejects unknown keys, wrong types, out-of-range values and empty or extra payloads", () => {
  assert.deepEqual(parseNotificationSettingsUpdate({ settings: { "notifications.daily_digest.hour": 9 } }), { "notifications.daily_digest.hour": 9 });
  for (const bad of [
    null, [], {}, { settings: {} }, { settings: [] }, { settings: { unknown: true } }, { settings: { "notifications.email.enabled": "true" } },
    { settings: { "notifications.daily_digest.hour": 24 } }, { settings: { "notifications.daily_digest.hour": -1 } }, { settings: { "notifications.daily_digest.hour": 8.5 } },
    { settings: { "notifications.follow_up_overdue.reminder_days": 0 } }, { settings: { "notifications.installment_overdue.reminder_days": 31 } },
    { settings: { "notifications.email.enabled": true }, extra: 1 },
  ]) assert.equal(parseNotificationSettingsUpdate(bad), null, JSON.stringify(bad));
});
