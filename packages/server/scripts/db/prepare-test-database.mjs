import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import pg from "pg";

// TEST-01 D2: create the local kfit_test database when missing, apply every migration, then the idempotent catalogue seed
// (Fred 2026-10-25: the customers and agenda integration tests read a seeded service). Safe to rerun.
const envTest = fileURLToPath(
  new URL("../../../../.env.test", import.meta.url),
);
if (!existsSync(envTest)) {
  console.error(
    "✖ .env.test is missing at the repository root: copy .env.test.example and fill the credentials.",
  );
  process.exit(1);
}
const { parsed = {} } = loadEnv({ path: envTest, processEnv: {} });
const databaseUrl = parsed.DATABASE_URL;

const { INTEGRATION_TEST_DATABASE_NAME } =
  await import("../../dist/db/database-target.js");
const { isLocalTestDatabase } =
  await import("../../dist/testing/integration-fixtures.js");
if (!isLocalTestDatabase(databaseUrl)) {
  console.error(
    `✖ .env.test DATABASE_URL must target localhost:5433/${INTEGRATION_TEST_DATABASE_NAME}. Nothing was changed.`,
  );
  process.exit(1);
}

const maintenance = new URL(databaseUrl);
maintenance.pathname = "/postgres";
const client = new pg.Client({ connectionString: maintenance.toString() });
await client.connect();
try {
  const existing = await client.query(
    "select 1 from pg_database where datname = $1",
    [INTEGRATION_TEST_DATABASE_NAME],
  );
  if (existing.rowCount)
    console.log(`✔ ${INTEGRATION_TEST_DATABASE_NAME} already exists`);
  else {
    await client.query(`create database "${INTEGRATION_TEST_DATABASE_NAME}"`);
    console.log(`✔ ${INTEGRATION_TEST_DATABASE_NAME} created`);
  }
} finally {
  await client.end();
}

const serverRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrate = spawnSync("npx", ["drizzle-kit", "migrate"], {
  cwd: serverRoot,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: databaseUrl },
});
if (migrate.status !== 0) {
  console.error(
    `✖ drizzle-kit migrate failed on ${INTEGRATION_TEST_DATABASE_NAME}`,
  );
  process.exit(migrate.status ?? 1);
}
console.log(`✔ ${INTEGRATION_TEST_DATABASE_NAME} migrated`);

const seed = spawnSync(
  process.execPath,
  ["./dist/db/seeds/catalogue.seed.js"],
  {
    cwd: serverRoot,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, DATABASE_URL: databaseUrl },
  },
);
if (seed.status !== 0) {
  console.error(`✖ catalogue seed failed on ${INTEGRATION_TEST_DATABASE_NAME}`);
  process.exit(seed.status ?? 1);
}
console.log(`✔ ${INTEGRATION_TEST_DATABASE_NAME} catalogue seeded`);
