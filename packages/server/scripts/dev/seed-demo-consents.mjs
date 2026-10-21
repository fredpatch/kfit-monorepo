import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
loadEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
process.env.NODE_ENV ??= "development";
let pool;
try {
  const { assertLocalDemoEnvironment } = await import("../../dist/dev/demo-admin.js");
  assertLocalDemoEnvironment(process.env);
  const { loadAuthConfig } = await import("../../dist/modules/auth/config/auth.config.js");
  const config = loadAuthConfig(process.env);
  const database = await import("../../dist/db/client.js"); pool = database.pool;
  const { consentDefinitions } = await import("../../dist/db/schema/onboarding.js");
  const { DrizzleConsentRepository } = await import("../../dist/modules/consents/repositories/consent.repository.js");
  const repository = new DrizzleConsentRepository(database.db, { auditHashPepper: config.auditHashPepper });
  const existing = await database.db.select().from(consentDefinitions);
  for (const consentType of ["service_terms", "privacy_notice"]) {
    if (existing.some(row => row.consentType === consentType && row.status === "published")) continue;
    const version = (existing.filter(row => row.consentType === consentType).reduce((max, row) => BigInt(row.version) > max ? BigInt(row.version) : max, 0n) + 1n).toString();
    const result = await repository.saveDefinition({ consentType, version, title: consentType === "service_terms" ? "DÉMONSTRATION — Conditions fictives" : "DÉMONSTRATION — Confidentialité fictive",
      content: "DÉMONSTRATION LOCALE UNIQUEMENT. Ce texte synthétique sert à tester les choix d’accord et de refus. Il ne constitue aucun document juridique applicable. Ne pas utiliser pour un véritable recueil client.", publish: true });
    if (!result.ok) throw new Error("Synthetic definition provisioning failed");
  }
  console.log("Local demo consent definitions ready. Existing published documents preserved. Synthetic text has no legal validity.");
} catch {
  console.error("Demo consent setup failed. Requires development mode, local database on port 5433 and the S4.4 migration."); process.exitCode = 1;
} finally { if (pool) await pool.end(); }
