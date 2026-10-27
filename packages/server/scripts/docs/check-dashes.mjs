import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * PRETTY-01 P3: no long dash (U+2014) or en dash (U+2013) in sources, scripts, docs, exploration-cache and root Markdown.
 * The empty-value placeholder is « - ». French guillemets and non-breaking spaces are fine. Exit 1 with file:line.
 */
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const IN_SCOPE =
  /^(packages\/[^/]+\/(src|scripts)\/|scripts\/|docs\/|exploration-cache\/|[^/]+\.md$)/;
const TEXT = /\.(ts|tsx|mjs|js|cjs|json|md|css|html|sql|ya?ml|txt)$/;
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { cwd: root, encoding: "utf8" },
)
  .split("\n")
  .filter((file) => IN_SCOPE.test(file) && TEXT.test(file));
const hits = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(path.join(root, file), "utf8");
  } catch {
    continue;
  }
  if (!DASH.test(text)) continue;
  text.split(/\r?\n/).forEach((line, index) => {
    if (DASH.test(line)) hits.push(`${file}:${index + 1}`);
  });
}
if (hits.length) {
  console.error(
    `✖ lint:dashes - ${hits.length} line(s) with a long dash (use « - »):\n${hits.join("\n")}`,
  );
  process.exit(1);
}
console.log(`✔ lint:dashes - ${files.length} files, no long dash`);
