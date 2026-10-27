import { spawnSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Drizzle models the table/checks/indexes; this generator adds the PostgreSQL
// exclusion constraint that the current Drizzle schema API cannot represent.
const serverRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrations = path.join(serverRoot, "src/db/migrations");
const before = new Set(
  (await readdir(migrations)).filter((name) => name.endsWith(".sql")),
);
const generated = spawnSync(
  process.execPath,
  [
    path.resolve(serverRoot, "../../node_modules/drizzle-kit/bin.cjs"),
    "generate",
  ],
  { cwd: serverRoot, stdio: "inherit" },
);
if (generated.error || generated.status !== 0)
  throw new Error("Cadence migration generation failed");
const added = (await readdir(migrations)).filter(
  (name) => name.endsWith(".sql") && !before.has(name),
);
if (added.length !== 1)
  throw new Error("Expected exactly one new additive cadence migration");
const target = path.join(migrations, added[0]);
const sql = await readFile(target, "utf8");
if (!sql.includes('CREATE TABLE "subscription_follow_up_cadence_history"'))
  throw new Error(
    "Generated migration does not create the cadence history table",
  );
const prefix =
  "CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint\n";
const overlap =
  '\n--> statement-breakpoint\nALTER TABLE "subscription_follow_up_cadence_history" ADD CONSTRAINT "subscription_cadence_history_no_overlap" EXCLUDE USING gist ("subscription_id" WITH =, tstzrange("effective_from", "effective_to", \'[)\') WITH &&);\n';
await writeFile(target, prefix + sql.trimEnd() + overlap, "utf8");
console.log(
  `Generated ${added[0]} with database-enforced non-overlapping cadence ranges.`,
);
