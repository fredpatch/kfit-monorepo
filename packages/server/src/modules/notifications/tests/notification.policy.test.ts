import assert from "node:assert/strict";
import test from "node:test";
import type { DashboardAlert } from "@kfit/shared";
import { candidateFromAlert, candidatesFromAlerts, digestDedupeKey, digestDue, digestMail, nextAttemptAfterFailure, notificationMaxAttempts, reminderMail, reminderWindow } from "../services/notification.policy.js";

const sub = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", cust = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", inst = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const alert = (over: Partial<DashboardAlert>): DashboardAlert => ({ kind: "follow_up_overdue", severity: "warning", customerId: cust, customerDisplayName: "Awa N.", subscriptionId: sub, requestId: null, resourceId: null,
  title: "Suivi en retard", summary: "Coaching 12 semaines", referenceAt: "2026-10-20T09:00:00.000Z", deepLink: `/admin/clients/${cust}?abonnement=${sub}&onglet=suivis`, ...over });

test("installment candidate drops the amount, uses a stable dedupe key and the merged « Paiements » tab", () => {
  const candidate = candidateFromAlert(alert({ kind: "installment_overdue", resourceId: inst, summary: "45 000 FCFA restant à régler", deepLink: `/admin/clients/${cust}?abonnement=${sub}&onglet=finance` }))!;
  assert.equal(candidate.dedupeKey, `installment_overdue:${inst}`);
  assert.equal(candidate.summary, "Échéance du 20 octobre");
  assert.ok(!/FCFA|\d{2} ?\d{3}/.test(JSON.stringify(candidate)));
  assert.match(candidate.deepLink, /onglet=paiements$/);
});

test("candidates dedupe two preparation tasks of one subscription and skip alerts missing their identity", () => {
  const list = candidatesFromAlerts([
    alert({ kind: "preparation_blocked", title: "Réservation expirée" }),
    alert({ kind: "preparation_blocked", title: "Préparation à compléter" }),
    alert({ kind: "request_to_contact", subscriptionId: null, customerId: null, requestId: null }),
    alert({ kind: "quote_action_required", resourceId: inst, deepLink: `/admin/clients/${cust}?abonnement=${sub}&onglet=devis` }),
  ]);
  assert.deepEqual(list.map((c) => c.dedupeKey), [`preparation_blocked:${sub}`, `quote_action_required:${inst}`]);
  assert.match(list[1]!.deepLink, /onglet=paiements$/);
});

test("reminder windows advance every N days and never repeat without a reminder key", () => {
  const first = new Date("2026-10-01T10:00:00Z");
  assert.equal(reminderWindow(new Date("2026-10-03T09:59:00Z"), first, 3), 0);
  assert.equal(reminderWindow(new Date("2026-10-04T10:00:00Z"), first, 3), 1);
  assert.equal(reminderWindow(new Date("2026-10-30T10:00:00Z"), first, null), 0);
});

test("digest is due from 08:00 Libreville (UTC+1) and keyed by the Libreville business date", () => {
  assert.equal(digestDue(new Date("2026-10-24T06:59:00Z"), 8), false);
  assert.equal(digestDue(new Date("2026-10-24T07:00:00Z"), 8), true);
  assert.equal(digestDedupeKey("u1", new Date("2026-10-24T23:30:00Z")), "digest:u1:2026-10-25");
});

test("retry schedule is +5m, +30m, +2h, +12h then dead letter", () => {
  const now = new Date("2026-10-24T10:00:00Z");
  assert.deepEqual([1, 2, 3, 4].map((n) => (nextAttemptAfterFailure(n, now)!.getTime() - now.getTime()) / 60_000), [5, 30, 120, 720]);
  assert.equal(nextAttemptAfterFailure(notificationMaxAttempts, now), null);
});

test("e-mail content is French, links absolute, counts only", () => {
  const digest = digestMail({ installment_overdue: 2, payment_proof_pending: 1 }, "2026-10-24", "https://app.kfit.example/");
  assert.equal(digest.subject, "K'FIT — Actions à traiter");
  assert.match(digest.bodyText, /samedi 24 octobre/);
  assert.match(digest.bodyText, /- 2 échéances en retard\n- 1 justificatif à vérifier/);
  assert.match(digest.bodyText, /https:\/\/app\.kfit\.example\/admin$/m);
  const reminder = reminderMail({ kind: "follow_up_overdue", title: "Suivi en retard", summary: "Coaching", customerDisplayName: "Awa N.", deepLink: "/admin/clients/x" }, 2, "http://localhost:5173");
  assert.equal(reminder.subject, "K'FIT — Rappel : Suivi en retard — Awa N.");
  assert.match(reminder.bodyText, /http:\/\/localhost:5173\/admin\/clients\/x/);
});
