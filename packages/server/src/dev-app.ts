import { db } from "./db/client.js";
import { DevToolsController } from "./modules/dev-tools/controllers/dev-tools.controller.js";
import { DrizzleTestDataRepository } from "./modules/dev-tools/repositories/test-data.repository.js";
import { TestDataService } from "./modules/dev-tools/services/test-data.service.js";
import { createRuntime } from "./runtime.js";

export function createDevelopmentApp() {
  return createDevelopmentRuntime().app;
}

/** S7.4 D1: development composition = the shared runtime plus the TEST-01 « Données de test » tools. */
export function createDevelopmentRuntime() {
  return createRuntime({
    mode: "development",
    env: process.env,
    devToolsController: ({ auditHashPepper, removePrivateFile, warn }) =>
      new DevToolsController(
        new TestDataService(
          new DrizzleTestDataRepository(db, { auditHashPepper }),
          removePrivateFile,
          warn,
        ),
      ),
  });
}
