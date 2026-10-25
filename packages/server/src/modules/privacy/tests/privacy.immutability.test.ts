import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Rule 4 / invariant 7: submitted questionnaire answers and captured consents are immutable; only the privacy module
// (anonymization) may rewrite them. This scans every compiled module outside privacy for an update path on those tables.
const modulesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const forbidden = [/\.update\(\s*questionnaireAnswers\b/, /\.update\(\s*consentRecords\b/, /update\s+"?questionnaire_answers"?\s+set/i, /update\s+"?consent_records"?\s+set/i];

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "tests" || entry.name === "privacy" ? [] : sourceFiles(full);
    return entry.name.endsWith(".js") ? [full] : [];
  }));
  return nested.flat();
}

test("no module outside privacy exposes an update of questionnaire_answers or consent_records", async () => {
  const files = await sourceFiles(modulesRoot);
  assert.ok(files.length > 50, "scanned the compiled modules");
  const offenders: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (forbidden.some((pattern) => pattern.test(text))) offenders.push(path.relative(modulesRoot, file));
  }
  assert.deepEqual(offenders, []);
});
