import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ARCHIVE_FREEZE_EXEMPTIONS, ARCHIVE_FREEZE_GUARDED_ROUTES, ARCHIVE_FREEZE_SCANNED_MODULES } from "../services/archive-freeze.coverage.js";

const modulesRoot = fileURLToPath(new URL("../../../../src/modules/", import.meta.url));
const guarded: Readonly<Record<string, readonly string[]>> = ARCHIVE_FREEZE_GUARDED_ROUTES;

/** Write registrations of one router source: `router.post|put|patch|delete(<route expression>`. */
export function writeRoutes(source: string): string[] {
  return [...source.matchAll(/router\.(?:post|put|patch|delete)\(\s*([A-Za-z_.[\]]+)/g)].map((match) => match[1]!);
}
function unlisted(module: string, routes: string[]): string[] {
  return routes.filter((route) => !(guarded[module] ?? []).includes(route) && !(route in ARCHIVE_FREEZE_EXEMPTIONS));
}
const sourcesOf = (module: string, folder: string) =>
  readdirSync(path.join(modulesRoot, module, folder)).filter((file) => file.endsWith(".ts")).map((file) => readFileSync(path.join(modulesRoot, module, folder, file), "utf8"));

test("ARCH-01 D8: every write route of the subject modules is guarded or exempt, and no listed route is stale", () => {
  const seen = new Set<string>();
  for (const module of ARCHIVE_FREEZE_SCANNED_MODULES) {
    const routes = sourcesOf(module, "routes").flatMap(writeRoutes);
    routes.forEach((route) => seen.add(route));
    assert.deepEqual(unlisted(module, routes), [], module);
  }
  const listed = [...Object.values(guarded).flat(), ...Object.keys(ARCHIVE_FREEZE_EXEMPTIONS).filter((key) => !key.startsWith("job:"))];
  assert.deepEqual(listed.filter((route) => !seen.has(route)), []);
});

test("ARCH-01 D8: every guarded module calls the shared assertion in its repositories", () => {
  for (const module of Object.keys(guarded)) {
    const source = sourcesOf(module, "repositories").join("\n");
    assert.match(source, /assert(Customer|Prospect)Writable\(tx/, module);
  }
});

test("ARCH-01 D8: a new unlisted write route fails the check", () => {
  const fixture = `router.post(financeApiRoutes.payments, handle("record"));\nrouter.delete(financeApiRoutes.refund, handle("refund"));\nrouter.get(financeApiRoutes.detail, handle("read"));`;
  assert.deepEqual(writeRoutes(fixture), ["financeApiRoutes.payments", "financeApiRoutes.refund"]);
  assert.deepEqual(unlisted("finance", writeRoutes(fixture)), ["financeApiRoutes.refund"]);
});
