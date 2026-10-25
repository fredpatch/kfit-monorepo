import { schedule, type ScheduledTask } from "node-cron";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import type { db as appDb } from "../../../db/client.js";
import { scheduledJobRuns } from "../../../db/schema/operations.js";

/*
 * Coordinated scheduled jobs (Gate 1 § Scheduled jobs). Each logical run has a stable runKey; a PostgreSQL session advisory
 * lock gives one owner across API replicas; scheduled_job_runs records outcome, attempt and error code.
 * A run already succeeded (or running elsewhere) for the same runKey is skipped; a failed run is retried with attempt + 1.
 */
export type JobOutcome = { outcome: "succeeded"; result: Record<string, number> } | { outcome: "failed"; errorCode: string } | { outcome: "skipped_locked" | "skipped_done" };

/** Window-aligned run key: one logical run per job and window (e.g. 15 min), whatever the replica or wake-up time. */
export function windowRunKey(now: Date, windowMs: number): string {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString();
}

export async function runScheduledJob(pool: Pool, db: typeof appDb, jobKey: string, runKey: string, work: () => Promise<Record<string, number>>): Promise<JobOutcome> {
  const client = await pool.connect();
  let locked = false;
  try {
    const lock = await client.query<{ ok: boolean }>("select pg_try_advisory_lock(hashtextextended($1, 0)) as ok", [`kfit:job:${jobKey}`]);
    locked = lock.rows[0]?.ok === true;
    if (!locked) return { outcome: "skipped_locked" };
    const claimed = await db.insert(scheduledJobRuns).values({ jobKey, runKey, status: "running" })
      .onConflictDoUpdate({
        target: [scheduledJobRuns.jobKey, scheduledJobRuns.runKey],
        set: { status: "running", attempt: sql`${scheduledJobRuns.attempt} + 1`, startedAt: sql`now()`, finishedAt: null, errorCode: null },
        setWhere: sql`${scheduledJobRuns.status} in ('failed', 'running')`,
      })
      .returning({ id: scheduledJobRuns.id });
    // 'running' left by a crashed owner is reclaimed: we hold the job lock, so no other owner can be running it now.
    const run = claimed[0];
    if (!run) return { outcome: "skipped_done" };
    try {
      const result = await work();
      await db.update(scheduledJobRuns).set({ status: "succeeded", finishedAt: sql`now()`, resultJson: result }).where(sql`${scheduledJobRuns.id} = ${run.id}`);
      return { outcome: "succeeded", result };
    } catch (error) {
      const errorCode = error instanceof Error && /^[A-Z_]{3,60}$/.test(error.message) ? error.message : "JOB_FAILED";
      await db.update(scheduledJobRuns).set({ status: "failed", finishedAt: sql`now()`, errorCode }).where(sql`${scheduledJobRuns.id} = ${run.id}`);
      return { outcome: "failed", errorCode };
    }
  } finally {
    if (locked) await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", [`kfit:job:${jobKey}`]).catch(() => undefined);
    client.release();
  }
}

/** `timezone` and `runKey` are optional (S7.3 daily purge keys its run on the Libreville business date). */
export type NotificationJobDefinition = { jobKey: string; cron: string; windowMs: number; timezone?: string; runKey?: (now: Date) => string; work: () => Promise<Record<string, number>> };

/** Starts the wake-ups (reconcile every 15 min, delivery every 5 min) and runs each once at start. Returns a stop function. */
export function startScheduledJobs(pool: Pool, db: typeof appDb, jobs: NotificationJobDefinition[], log: (line: string) => void): () => void {
  const tasks: ScheduledTask[] = [];
  for (const job of jobs) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const outcome = await runScheduledJob(pool, db, job.jobKey, job.runKey ? job.runKey(new Date()) : windowRunKey(new Date(), job.windowMs), job.work);
        if (outcome.outcome === "failed") log(`✖ ${job.jobKey} failed (${outcome.errorCode})`);
      } catch {
        log(`✖ ${job.jobKey} could not run (database unavailable?)`);
      } finally {
        running = false;
      }
    };
    tasks.push(job.timezone ? schedule(job.cron, tick, { timezone: job.timezone }) : schedule(job.cron, tick));
    void tick();
  }
  return () => { for (const task of tasks) void task.stop(); };
}
