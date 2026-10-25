import type { TestDataAnalysisResponse, TestDataCounts } from "@kfit/shared";
import type { DrizzleTestDataRepository, TestDataActor } from "../repositories/test-data.repository.js";
import { testDataCounts, testDataFingerprint } from "./test-data.policy.js";

export type TestDataPurgeOutcome = { status: "changed" } | { status: "purged"; counts: TestDataCounts };

export class TestDataService {
  constructor(
    private readonly repository: Pick<DrizzleTestDataRepository, "classify" | "purge">,
    private readonly removeFile: (storageKey: string) => Promise<void>,
    private readonly log: (line: string) => void,
  ) {}

  async analyse(): Promise<TestDataAnalysisResponse> {
    const classification = await this.repository.classify();
    return { ...testDataCounts(classification), fingerprint: testDataFingerprint(classification) };
  }

  /** TEST-01 D5: stored files go only after the commit, best effort; a failure is logged by document version id. */
  async purge(fingerprint: string, actor: TestDataActor): Promise<TestDataPurgeOutcome> {
    const result = await this.repository.purge(fingerprint, testDataFingerprint, actor);
    if (result.status === "changed") return result;
    for (const file of result.files) {
      try { await this.removeFile(file.storageKey); }
      catch { this.log(`dev test-data purge: stored file not removed for document version ${file.documentVersionId}`); }
    }
    return { status: "purged", counts: result.counts };
  }
}
