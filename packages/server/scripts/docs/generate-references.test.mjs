import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkFrontMatter, parseClientMessages, parseEnvExample, parseErrorCodeArrays, parseNamedCodes, renderErrorCodes, SERVER_CODE_SOURCES } from "./generate-references.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

test("DOC-01 DC6: every …ErrorCodes array is parsed, comments inside the array ignored", () => {
  const source = `export const aErrorCodes = [\n  "A_ONE", // note\n  /** D6 */ "A_TWO",\n] as const;\nexport const bErrorCodes = ["B_ONE"] as const;\nexport const other = ["X"] as const;`;
  assert.deepEqual(parseErrorCodeArrays(source, "sample"), [{ name: "aErrorCodes", codes: ["A_ONE", "A_TWO"] }, { name: "bErrorCodes", codes: ["B_ONE"] }]);
});

test("DOC-01 DC6: a declaration in another form, an empty list or a non-literal item fails loudly", () => {
  assert.throws(() => parseErrorCodeArrays(`export const aErrorCodes = [...base, "A"] as const;`, "spread"), /unexpected item/);
  assert.throws(() => parseErrorCodeArrays(`export const aErrorCodes = codes;`, "alias"), /not in the form/);
  assert.throws(() => parseErrorCodeArrays(`export const aErrorCodes = [] as const;`, "empty"), /empty list/);
  assert.throws(() => parseNamedCodes(`export const other = 1;`, { name: "opsErrorCodes", kind: "array" }, "ops"), /opsErrorCodes not found/);
  assert.throws(() => parseNamedCodes(`export const other = 1;`, { name: "SECURITY_FLOOR_NOT_MET", kind: "string" }, "floor"), /not found/);
});

test("DOC-01 DC6: the repository yields every shared array and every expected server code", async () => {
  const declared = [];
  const walk = async (dir) => { for (const entry of await readdir(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) await walk(full); else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) declared.push(...(await readFile(full, "utf8")).matchAll(/export const (\w+ErrorCodes)\s*=/g)); } };
  await walk(path.join(root, "packages/shared/src"));
  const { text, count } = await renderErrorCodes(root);
  assert.ok(declared.length >= 20, "the shared contracts declare their codes");
  for (const source of SERVER_CODE_SOURCES) assert.ok(text.includes(source.name), source.name);
  for (const code of ["AUTH_SESSION_REQUIRED", "CUSTOMER_ARCHIVED", "ENV_MISSING", "MANIFEST_INVALID", "SECURITY_FLOOR_NOT_MET", "REQUEST_ENCODING_UNSUPPORTED"]) assert.match(text, new RegExp(`\\| \`${code}\` \\|`), code);
  assert.equal((text.match(/^\| `/gm) ?? []).length, count);
});

test("DOC-01 DC6: client messages are read from `CODE: \"…\"` maps; .env.example keeps groups and never needs values", () => {
  const messages = parseClientMessages([`const m = { A_CODE: "Texte « un »", "B_CODE": "Deux \\"x\\"" };`, `const n = { A_CODE: "Autre" };`]);
  assert.deepEqual(messages.get("A_CODE"), ["Texte « un »", "Autre"]);
  assert.deepEqual(messages.get("B_CODE"), ['Deux "x"']);
  assert.deepEqual(parseEnvExample("# Group\n# about A\nA=secret-value\nB=other\n\n# Next\nC="), [
    { key: "A", group: "Group", description: "about A" }, { key: "B", group: "Group", description: "" }, { key: "C", group: "Next", description: "" },
  ]);
});

test("DOC-01 DC3: front matter needs the five keys and allowed values", () => {
  const ok = "---\ntitre: T\npublic: exploitation\nstatut: à jour\nvérifié-sur: abc1234\ncouvre: [S7.4b]\n---\n# T\n";
  assert.deepEqual(checkFrontMatter(ok, "ok"), []);
  assert.match(checkFrontMatter("# T\n", "none").join(), /front matter missing/);
  assert.match(checkFrontMatter(ok.replace("exploitation", "ops"), "bad").join(), /public/);
  assert.match(checkFrontMatter(ok.replace("statut: à jour\n", ""), "missing").join(), /statut missing/);
});
