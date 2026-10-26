import { spawn } from "node:child_process";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import type { PgAccess } from "./ops-config.js";

/** Bounded stderr kept as the error cause for debugging; never printed (it may name hosts or databases). */
const STDERR_TAIL_BYTES = 4096;

export type Spawned = { stdin: Writable; stdout: Readable; done: Promise<void> };

/** Spawns without a shell. `done` rejects on a spawn error or a non-zero exit; the message names the tool and exit code only. */
export function spawnTool(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; label: string }): Spawned {
  const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-STDERR_TAIL_BYTES); });
  const done = new Promise<void>((resolve, reject) => {
    child.once("error", (error) => reject(new Error(`${options.label} could not start`, { cause: error })));
    child.once("close", (code, signal) => code === 0 ? resolve() : reject(new Error(`${options.label} exited ${code ?? signal}`, { cause: new Error(stderr) })));
  });
  return { stdin: child.stdin, stdout: child.stdout, done };
}

export async function captureTool(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; label: string }): Promise<string> {
  const run = spawnTool(command, args, options);
  run.stdin.end();
  let out = "";
  run.stdout.on("data", (chunk: Buffer) => { out += chunk.toString("utf8"); });
  await run.done;
  return out.trim();
}

const firstLine = (text: string) => text.split(/\r?\n/)[0]?.trim() ?? "";

/** Major version from `pg_dump (PostgreSQL) 16.4` style output; null when unreadable. */
export function pgClientMajor(versionLine: string): number | null {
  const match = /\(PostgreSQL\)\s+(\d+)/.exec(versionLine);
  return match ? Number(match[1]) : null;
}

/** libpq environment for native tools: credentials never go on the command line. */
export function libpqEnv(databaseUrl: string, database: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl);
  const sslmode = url.searchParams.get("sslmode");
  return {
    ...process.env,
    PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: database,
    ...(sslmode ? { PGSSLMODE: sslmode } : {}),
  };
}

export type PgTools = {
  version(tool: "pg_dump" | "pg_restore"): Promise<string>;
  /** pg_dump -Fc of `database` inside the exported `snapshot` (B7 table counts come from the same snapshot). */
  dump(database: string, snapshot: string): Spawned;
  /** pg_restore --no-owner --exit-on-error from stdin; `clean` drops existing objects first (--confirm-overwrite). */
  restore(database: string, clean: boolean): Spawned;
};

/**
 * S7.4b B2. docker: `docker compose [-f file] exec -T <service>` runs the tools inside the postgres container as its
 * POSTGRES_USER (no credentials leave the container). native: tools on PATH, connection from DATABASE_URL via libpq env.
 */
export function createPgTools(access: PgAccess, databaseUrl: string): PgTools {
  if (access.mode === "native") {
    return {
      version: async (tool) => firstLine(await captureTool(tool, ["--version"], { label: tool })),
      dump: (database, snapshot) => spawnTool("pg_dump", ["--format=custom", `--snapshot=${snapshot}`], { env: libpqEnv(databaseUrl, database), label: "pg_dump" }),
      restore: (database, clean) => spawnTool("pg_restore", ["--no-owner", "--exit-on-error", ...(clean ? ["--clean", "--if-exists"] : []), `--dbname=${database}`], { env: libpqEnv(databaseUrl, database), label: "pg_restore" }),
    };
  }
  const compose = [...(access.composeFile ? ["-f", access.composeFile] : []), "exec", "-T", access.service];
  const inContainer = (label: string, script: string, args: string[]) =>
    spawnTool("docker", ["compose", ...compose, "sh", "-c", script, "sh", ...args], { cwd: access.composeDir, label });
  return {
    version: async (tool) => firstLine(await captureTool("docker", ["compose", ...compose, tool, "--version"], { cwd: access.composeDir, label: tool })),
    dump: (database, snapshot) => inContainer("pg_dump", 'exec pg_dump -U "$POSTGRES_USER" --format=custom --snapshot="$2" --dbname="$1"', [database, snapshot]),
    restore: (database, clean) => inContainer("pg_restore", `exec pg_restore -U "$POSTGRES_USER" --no-owner --exit-on-error ${clean ? "--clean --if-exists " : ""}--dbname="$1"`, [database]),
  };
}

/**
 * S7.4b B3: system tar. On Windows the bundled bsdtar (System32\tar.exe) is used explicitly, so a GNU tar earlier on PATH
 * (Git Bash) never reads a drive letter as a remote host. Archives hold paths relative to the root (`-C root .`).
 */
export function tarCommand(): string {
  return process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
}
export const tarVersion = async () => firstLine(await captureTool(tarCommand(), ["--version"], { label: "tar" }));
export const tarCreate = (root: string) => spawnTool(tarCommand(), ["-cf", "-", "-C", root, "."], { label: "tar" });
export const tarExtract = (destination: string) => spawnTool(tarCommand(), ["-xf", "-", "-C", destination], { label: "tar" });
