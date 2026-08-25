import "dotenv/config";
import crypto from "node:crypto";
import cron from "node-cron";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for scheduled-job pre-flight");
}

const JOB_KEY = "preflight.scheduled-job";
const runKey = `sprint0-${crypto.randomUUID()}`;
const lockKey = `${JOB_KEY}:${runKey}`;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const clientA = new Client({ connectionString: databaseUrl });
const clientB = new Client({ connectionString: databaseUrl });

async function verifySchedulerTick() {
  let ticks = 0;
  let task;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      task?.stop();
      reject(new Error("node-cron did not fire within the pre-flight timeout"));
    }, 3500);

    task = cron.schedule("* * * * * *", () => {
      ticks += 1;
      task.stop();
      clearTimeout(timeout);
      resolve();
    });
  });

  assert(ticks === 1, "Scheduler should fire exactly once in the controlled pre-flight");
  console.log("node-cron scheduler tick verified");
}

async function advisoryTryLock(client) {
  const result = await client.query(
    "select pg_try_advisory_lock(hashtextextended($1, 0)) as acquired",
    [lockKey],
  );
  return result.rows[0]?.acquired === true;
}

async function advisoryUnlock(client) {
  await client.query(
    "select pg_advisory_unlock(hashtextextended($1, 0))",
    [lockKey],
  );
}

async function cleanup() {
  await clientA.query(
    "delete from scheduled_job_runs where job_key = $1 and run_key = $2",
    [JOB_KEY, runKey],
  );
}

try {
  await verifySchedulerTick();

  await clientA.connect();
  await clientB.connect();

  await cleanup();

  const firstLock = await advisoryTryLock(clientA);
  const duplicateLock = await advisoryTryLock(clientB);

  assert(firstLock, "Worker A should acquire the job lock");
  assert(!duplicateLock, "Worker B must not acquire a duplicate concurrent job lock");
  console.log("Concurrent duplicate execution blocked by PostgreSQL advisory lock");

  await clientA.query(
    `insert into scheduled_job_runs
      (id, job_key, run_key, status, attempt, started_at, result_json)
     values ($1, $2, $3, 'running', 1, now(), $4::jsonb)`,
    [crypto.randomUUID(), JOB_KEY, runKey, JSON.stringify({ phase: "first-attempt" })],
  );

  let duplicatePrevented = false;
  try {
    await clientA.query(
      `insert into scheduled_job_runs
        (id, job_key, run_key, status, attempt, started_at)
       values ($1, $2, $3, 'running', 1, now())`,
      [crypto.randomUUID(), JOB_KEY, runKey],
    );
  } catch (error) {
    duplicatePrevented = error?.code === "23505";
  }
  assert(duplicatePrevented, "Stable job run key must prevent duplicate run records");
  console.log("Stable (job_key, run_key) idempotency key verified");

  await clientA.query(
    `update scheduled_job_runs
       set status = 'failed',
           finished_at = now(),
           error_code = 'PREFLIGHT_SIMULATED_FAILURE',
           result_json = $3::jsonb
     where job_key = $1 and run_key = $2`,
    [JOB_KEY, runKey, JSON.stringify({ retryable: true })],
  );

  const failed = await clientA.query(
    `select status, attempt, error_code, result_json
       from scheduled_job_runs
      where job_key = $1 and run_key = $2`,
    [JOB_KEY, runKey],
  );
  assert(failed.rows[0]?.status === "failed", "Failure outcome was not recorded");
  assert(failed.rows[0]?.error_code === "PREFLIGHT_SIMULATED_FAILURE", "Stable error code missing");
  console.log("Failure outcome and stable error code recorded");

  await clientA.query(
    `update scheduled_job_runs
       set status = 'running',
           attempt = attempt + 1,
           started_at = now(),
           finished_at = null,
           error_code = null,
           result_json = $3::jsonb
     where job_key = $1 and run_key = $2`,
    [JOB_KEY, runKey, JSON.stringify({ phase: "retry" })],
  );

  await clientA.query(
    `update scheduled_job_runs
       set status = 'succeeded',
           finished_at = now(),
           result_json = $3::jsonb
     where job_key = $1 and run_key = $2`,
    [JOB_KEY, runKey, JSON.stringify({ processed: 1, externalSideEffects: 0 })],
  );

  const retried = await clientA.query(
    `select status, attempt, result_json
       from scheduled_job_runs
      where job_key = $1 and run_key = $2`,
    [JOB_KEY, runKey],
  );
  assert(retried.rows[0]?.status === "succeeded", "Retry did not reach succeeded state");
  assert(retried.rows[0]?.attempt === 2, "Retry attempt counter should be 2");
  assert(retried.rows[0]?.result_json?.processed === 1, "Observable result metrics missing");
  console.log("Retry safety, attempt counting, and outcome metrics verified");

  await advisoryUnlock(clientA);
  const lockAfterRelease = await advisoryTryLock(clientB);
  assert(lockAfterRelease, "Lock should be available after worker A releases it");
  await advisoryUnlock(clientB);
  console.log("Lock release/reacquisition verified");

  await cleanup();
  console.log("Scheduled-jobs pre-flight PASSED");
} finally {
  try { await advisoryUnlock(clientA); } catch {}
  try { await advisoryUnlock(clientB); } catch {}
  try { await cleanup(); } catch {}
  await Promise.allSettled([clientA.end(), clientB.end()]);
}
