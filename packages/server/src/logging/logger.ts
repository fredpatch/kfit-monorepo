import winston from "winston";

const { combine, colorize, timestamp, printf } = winston.format;

/** Terminal logger: one timestamped, colorized line per event. Never pass passwords, tokens, OTPs, session ids or personal data. */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "http",
  format: combine(
    colorize(),
    timestamp({ format: "HH:mm:ss" }),
    printf(({ timestamp: time, level, message }) => `${String(time)} ${level} ${String(message)}`),
  ),
  transports: [new winston.transports.Console()],
});
