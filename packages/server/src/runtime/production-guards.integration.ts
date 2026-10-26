import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { inArray } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { consentDefinitions } from "../db/schema/onboarding.js";
import { assertLocalTestDatabase } from "../testing/integration-fixtures.js";
import { findPublishedDemoConsents } from "./production-guards.js";

const syntheticType = `synthetic_demo_${randomUUID().slice(0, 8)}`;
const created: string[] = [];
let safe = false;

before(() => { assertLocalTestDatabase(); safe = true; });
after(async () => {
  try {
    if (safe && created.length) await db.delete(consentDefinitions).where(inArray(consentDefinitions.id, created));
  } finally {
    await pool.end();
  }
});

async function insert(title: string, status: "draft" | "published" | "retired") {
  const id = randomUUID();
  created.push(id);
  const now = new Date();
  await db.insert(consentDefinitions).values({ id, consentType: syntheticType, version: `v-${id.slice(0, 8)}`, title, content: "Synthetic", contentHash: "0".repeat(64), status,
    publishedAt: status === "draft" ? null : now, retiredAt: status === "retired" ? now : null });
  return id;
}
const syntheticCount = async () => {
  const failure = await findPublishedDemoConsents(db);
  return failure?.detail.includes(syntheticType) ? failure : null;
};

test("S7.3 D9 / S7.4 D2: a draft or retired « DÉMONSTRATION » text is fine; a published one refuses production start", async () => {
  await insert("DÉMONSTRATION — conditions de service", "draft");
  await insert("DÉMONSTRATION — notice", "retired");
  await insert("Conditions générales", "published");
  assert.equal(await syntheticCount(), null);

  await insert("Texte de DÉMONSTRATION", "published");
  const failure = await syntheticCount();
  assert.equal(failure?.code, "DEMO_CONSENT_PUBLISHED");
  assert.ok(!failure?.detail.includes("Texte"), "detail gives counts and consent types only");
});

test("S7.3 D9: « Demonstration » without accent or capitals also refuses", async () => {
  const before = (await findPublishedDemoConsents(db))?.detail ?? "";
  await insert("Demonstration only", "published");
  const after = (await findPublishedDemoConsents(db))?.detail ?? "";
  const count = (detail: string) => Number(/^(\d+)/.exec(detail)?.[1] ?? 0);
  assert.equal(count(after), count(before) + 1);
});
