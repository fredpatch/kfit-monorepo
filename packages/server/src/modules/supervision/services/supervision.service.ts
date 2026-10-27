import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  SupervisionAlert,
  SupervisionAlertCode,
  SupervisionJobRunResponse,
  SupervisionMode,
  SupervisionOverviewResponse,
  SupervisionPrivacy,
  SupervisionPurgeSimulationResponse,
  SupervisionRuntime,
  SupervisionSecurityResponse,
  SupervisionStatusResponse,
} from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { evaluateProductionEnv, findPublishedDemoConsents } from "../../../runtime/production-guards.js";
import { evaluateRuntimeFloor } from "../../../security/security-floor.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import { runScheduledJob } from "../../notifications/jobs/scheduled-job.runner.js";
import type { DrizzlePrivacyRepository } from "../../privacy/repositories/privacy.repository.js";
import type { DrizzleSupervisionRepository, SupervisionActor } from "../repositories/supervision.repository.js";
import {
  MANUAL_RUN_COOLDOWN_MS,
  SUPERVISED_JOBS,
  computeSupervisionAlerts,
  supervisedJobView,
  supervisionAlertSeverity,
  type SupervisionState,
} from "./supervision.policy.js";

/** O8: the demo-consent guard reads the database; it is refreshed at most this often. */
export const GUARDS_DATABASE_CACHE_MS = 10 * 60_000;

export type SupervisionServiceDeps = {
  repository: Pick<DrizzleSupervisionRepository, "jobFacts" | "backup" | "restoreCheck" | "privacyFacts" | "securitySeries" | "openSupervisionKeys" | "audit">;
  privacy: Pick<DrizzlePrivacyRepository, "simulatePurge">;
  pool: Pool;
  db: typeof appDb;
  mode: SupervisionMode;
  env: NodeJS.ProcessEnv;
  /** Resolved KFIT_PRIVACY_JOURNAL_DIR, or null when not configured. */
  journalDir: string | null;
  /** O4: the jobs an admin may run by hand, with the same work as their schedule. */
  manualRunners: Record<string, () => Promise<Record<string, number>>>;
  onManualRunRateLimited: () => void;
  clock?: () => Date;
  nodeVersion?: string;
};

export type ManualRunResult = { status: "done"; run: SupervisionJobRunResponse } | { status: "not_runnable" } | { status: "busy" } | { status: "rate_limited" };

async function writable(target: string): Promise<boolean> {
  try {
    await access(target, constants.W_OK);
    return true;
  } catch (error) {
    // Not created yet: the journal creates its directory on the first append, so a writable parent is enough.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
    const parent = path.dirname(target);
    return parent !== target && writable(parent);
  }
}

export class SupervisionService {
  private readonly clock: () => Date;
  private readonly manualLimiter: IpRateLimiter;
  private demoConsentCache: { at: number; failures: string[] } | null = null;

  constructor(private readonly deps: SupervisionServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.manualLimiter = new IpRateLimiter({ windowMs: MANUAL_RUN_COOLDOWN_MS, maxPerWindow: 1, onRefused: deps.onManualRunRateLimited });
  }

  private async runtime(now: Date): Promise<SupervisionRuntime> {
    const version = this.deps.nodeVersion ?? process.version;
    const floor = evaluateRuntimeFloor(version);
    const base = { nodeVersion: version, floor: { ok: floor.ok, failures: floor.ok ? [] : floor.failures.map((f) => `${f.id}:${f.reason}`) }, mode: this.deps.mode };
    if (this.deps.mode !== "production") return { ...base, guards: null };
    const failures = evaluateProductionEnv(this.deps.env, version).failures.map((f) => f.code);
    if (!this.demoConsentCache || now.getTime() - this.demoConsentCache.at > GUARDS_DATABASE_CACHE_MS) {
      const demo = await findPublishedDemoConsents(this.deps.db).catch(() => ({ code: "DEMO_CONSENT_PUBLISHED" as const, detail: "not verified" }));
      this.demoConsentCache = { at: now.getTime(), failures: demo ? [demo.code] : [] };
    }
    const all = [...failures, ...this.demoConsentCache.failures];
    return { ...base, guards: { ok: all.length === 0, failures: all, checkedAt: new Date(this.demoConsentCache.at).toISOString() } };
  }

  private async privacy(now: Date): Promise<SupervisionPrivacy> {
    const facts = await this.deps.repository.privacyFacts(now);
    const configured = this.deps.journalDir !== null;
    return { journal: { configured, writable: configured && (await writable(this.deps.journalDir!)) }, ...facts };
  }

  async state(now: Date = this.clock()): Promise<SupervisionState> {
    const jobs = [];
    for (const job of SUPERVISED_JOBS) jobs.push(supervisedJobView(job, await this.deps.repository.jobFacts(job.jobKey, now), now));
    return {
      jobs,
      backup: await this.deps.repository.backup(now),
      restoreCheck: await this.deps.repository.restoreCheck(),
      privacy: await this.privacy(now),
      runtime: await this.runtime(now),
    };
  }

  /** O9: what notifications.reconcile turns into supervision_alert rows. */
  async alerts(now: Date = this.clock()): Promise<SupervisionAlert[]> {
    return computeSupervisionAlerts(await this.state(now), now, this.deps.mode);
  }

  async overview(): Promise<SupervisionOverviewResponse> {
    const now = this.clock();
    const state = await this.state(now);
    return { generatedAt: now.toISOString(), alerts: computeSupervisionAlerts(state, now, this.deps.mode), ...state };
  }

  async status(userId: string): Promise<SupervisionStatusResponse> {
    const keys = await this.deps.repository.openSupervisionKeys(userId);
    const critical = keys.some((key) => supervisionAlertSeverity[key.split(":")[1] as SupervisionAlertCode] === "critical");
    return { level: keys.length === 0 ? "ok" : critical ? "critical" : "warning", alertCount: keys.length };
  }

  security(days: number): Promise<SupervisionSecurityResponse> {
    return this.deps.repository.securitySeries(days, this.clock());
  }

  /** O4: same lock as the schedule (runKey manual:<uuid>), one per job and minute, audited. */
  async runJob(jobKey: string, actor: SupervisionActor): Promise<ManualRunResult> {
    const work = Object.hasOwn(this.deps.manualRunners, jobKey) ? this.deps.manualRunners[jobKey] : undefined;
    if (!work || SUPERVISED_JOBS.find((job) => job.jobKey === jobKey)?.manual !== "run") return { status: "not_runnable" };
    if (!this.manualLimiter.allow(jobKey, this.clock().getTime())) return { status: "rate_limited" };
    const started = Date.now();
    const outcome = await runScheduledJob(this.deps.pool, this.deps.db, jobKey, `manual:${randomUUID()}`, work);
    const durationMs = Date.now() - started;
    await this.deps.repository.audit(actor, "ops.job.manual_run", { jobKey, outcome: outcome.outcome === "skipped_locked" || outcome.outcome === "skipped_done" ? "busy" : outcome.outcome, durationMs });
    if (outcome.outcome === "succeeded") return { status: "done", run: { jobKey, outcome: "succeeded", durationMs, result: outcome.result, errorCode: null } };
    if (outcome.outcome === "failed") return { status: "done", run: { jobKey, outcome: "failed", durationMs, result: null, errorCode: outcome.errorCode } };
    return { status: "busy" };
  }

  async simulatePurge(actor: SupervisionActor): Promise<SupervisionPurgeSimulationResponse> {
    const counts = await this.deps.privacy.simulatePurge(this.clock());
    await this.deps.repository.audit(actor, "ops.purge.simulated", counts);
    return counts;
  }
}
