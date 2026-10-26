import assert from "node:assert/strict";
import test from "node:test";
import { confirmationMatches, customerPrivacyMenu, ficheReadOnly, ficheTabVisibility, prospectPrivacyMenu, subjectMode, type PrivacyMenu } from "./subject-view.js";

const at = "2026-10-26T08:00:00.000Z";
const flat = (menu: PrivacyMenu) => menu.map((group) => group.map((e) => (e.enabled ? e.action : `${e.action}:disabled`)));

test("S7.3b-2 D5: the confirmation name matches after trim, NFC and collapsed spaces, case-sensitive", () => {
  assert.ok(confirmationMatches("  Awa   Ndong ", "Awa Ndong"));
  assert.ok(confirmationMatches("Adéla Obame", "Adéla Obame"), "NFD input matches NFC name");
  assert.ok(confirmationMatches("Client anonymisé · 1A2B", "Client anonymisé · 1A2B"));
  assert.equal(confirmationMatches("awa ndong", "Awa Ndong"), false);
  assert.equal(confirmationMatches("Awa", "Awa Ndong"), false);
  assert.equal(confirmationMatches("", "Awa Ndong"), false);
});

test("S7.3b-2: the mode follows the privacy dates; anonymized wins over archived", () => {
  assert.equal(subjectMode({ archivedAt: null, anonymizedAt: null }), "active");
  assert.equal(subjectMode({ archivedAt: at, anonymizedAt: null }), "archived");
  assert.equal(subjectMode({ archivedAt: at, anonymizedAt: at }), "anonymized");
  assert.equal(ficheReadOnly("active"), false);
  assert.equal(ficheReadOnly("archived"), true);
  assert.equal(ficheReadOnly("anonymized"), true);
});

test("S7.3b-2 D3: customer ⋯ menu per mode", () => {
  assert.deepEqual(flat(customerPrivacyMenu({ archivedAt: null, anonymizedAt: null, archivable: true, unarchivable: false })), [["archive", "add_hold"]]);
  assert.deepEqual(flat(customerPrivacyMenu({ archivedAt: null, anonymizedAt: null, archivable: false, unarchivable: false })), [["archive:disabled", "add_hold"]]);
  assert.deepEqual(flat(customerPrivacyMenu({ archivedAt: at, anonymizedAt: null, archivable: false, unarchivable: true })), [["unarchive", "add_hold"], ["anonymize"]]);
  assert.deepEqual(flat(customerPrivacyMenu({ archivedAt: at, anonymizedAt: null, archivable: false, unarchivable: false })), [["add_hold"], ["anonymize"]]);
  assert.deepEqual(flat(customerPrivacyMenu({ archivedAt: at, anonymizedAt: at, archivable: false, unarchivable: false })), [["add_hold"]]);
});

test("S7.3b-2 D8: prospect ⋯ entries per mode", () => {
  assert.deepEqual(flat(prospectPrivacyMenu({ archivedAt: null, anonymizedAt: null, archivable: true })), [["archive"]]);
  assert.deepEqual(flat(prospectPrivacyMenu({ archivedAt: null, anonymizedAt: null, archivable: false })), []);
  assert.deepEqual(flat(prospectPrivacyMenu({ archivedAt: at, anonymizedAt: null, archivable: false })), [["unarchive"], ["anonymize"]]);
  assert.deepEqual(flat(prospectPrivacyMenu({ archivedAt: at, anonymizedAt: at, archivable: false })), []);
});

test("S7.3b-2 D2/D6: tab visibility per mode", () => {
  const tabs = ["apercu", "analyse", "rendez-vous", "suivis", "preparation", "progression", "documents", "paiements", "sante"];
  const view = (mode: "active" | "archived" | "anonymized") => Object.fromEntries(tabs.map((t) => [t, ficheTabVisibility(mode, t)]));
  assert.ok(Object.values(view("active")).every((v) => v === "visible"));
  assert.deepEqual(Object.entries(view("archived")).filter(([, v]) => v !== "visible"), [["analyse", "hidden"]]);
  assert.deepEqual(Object.entries(view("anonymized")).filter(([, v]) => v !== "visible"),
    [["analyse", "hidden"], ["progression", "erased"], ["documents", "erased"], ["sante", "erased"]]);
});
