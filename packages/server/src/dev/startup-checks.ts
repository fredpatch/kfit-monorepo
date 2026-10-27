import net from "node:net";
import nodemailer from "nodemailer";
import type { Pool } from "pg";
import { logger } from "../logging/logger.js";
import { loadSmtpAuthMailConfig } from "../modules/auth/services/auth-mail.delivery.js";

const TIMEOUT_MS = 3_000;

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`timed out after ${TIMEOUT_MS} ms`)),
        TIMEOUT_MS,
      ),
    ),
  ]);
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** host:port/name only; the credentials in DATABASE_URL never reach the terminal. */
function databaseTarget(databaseUrl: string | undefined): string {
  try {
    const url = new URL(databaseUrl ?? "");
    return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return "DATABASE_URL";
  }
}

function pingClamav(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let reply = "";
    socket.once("error", reject);
    socket.on("connect", () => socket.write("zPING\0"));
    socket.on("data", (chunk) => {
      reply += chunk.toString();
    });
    socket.on("end", () =>
      reply.includes("PONG")
        ? resolve()
        : reject(new Error(`unexpected reply "${reply.trim()}"`)),
    );
  });
}

/**
 * Dev startup report, one line per external service. Only the database is required (returns false when it is down);
 * SMTP and ClamAV each disable one feature, so they warn and the API still starts.
 */
export async function runStartupChecks(
  pool: Pool,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const database = databaseTarget(env.DATABASE_URL);
  let databaseReady = true;
  try {
    await withTimeout(pool.query("select 1"));
    logger.info(`✔ Database connected (${database})`);
  } catch (error) {
    databaseReady = false;
    logger.error(`✖ Database unreachable (${database}): ${reason(error)}`);
  }

  if (!env.SMTP_HOST) {
    logger.warn(
      "⚠ SMTP not configured: password recovery and sensitive-action codes are disabled",
    );
  } else {
    const smtp = loadSmtpAuthMailConfig(env);
    try {
      await withTimeout(
        nodemailer
          .createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            auth: smtp.user
              ? { user: smtp.user, pass: smtp.pass ?? "" }
              : undefined,
          })
          .verify(),
      );
      const inbox = env.MAILPIT_UI_PORT
        ? `, inbox http://localhost:${env.MAILPIT_UI_PORT}`
        : "";
      logger.info(`✔ SMTP ready (${smtp.host}:${smtp.port}${inbox})`);
    } catch (error) {
      logger.warn(
        `⚠ SMTP unreachable (${smtp.host}:${smtp.port}): e-mailed codes will fail. ${reason(error)}`,
      );
    }
  }

  const clamavHost = env.CLAMAV_HOST ?? "127.0.0.1";
  const clamavPort = Number(env.CLAMAV_PORT ?? 3310);
  try {
    await withTimeout(pingClamav(clamavHost, clamavPort));
    logger.info(`✔ ClamAV ready (${clamavHost}:${clamavPort})`);
  } catch (error) {
    logger.warn(
      `⚠ ClamAV unreachable (${clamavHost}:${clamavPort}): document uploads will fail their scan. ${reason(error)}`,
    );
  }

  return databaseReady;
}
