import "dotenv/config";
import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST ?? "localhost";
const port = Number(process.env.SMTP_PORT ?? "1025");
const secure = String(process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
const user = process.env.SMTP_USER?.trim();
const pass = process.env.SMTP_PASS?.trim();
const from = process.env.SMTP_FROM ?? "K'FIT Dev <noreply@kfit.local>";
const to = process.env.SMTP_TEST_TO ?? "coach@kfit.local";

const transport = nodemailer.createTransport({
  host,
  port,
  secure,
  ...(user && pass ? { auth: { user, pass } } : {}),
});

console.log(`K'FIT SMTP pre-flight -> ${host}:${port} secure=${secure}`);

try {
  await transport.verify();
  console.log("✓ SMTP connection verified");

  const result = await transport.sendMail({
    from,
    to,
    subject: "K'FIT — Test SMTP Sprint 0",
    text: "Test SMTP K'FIT réussi. Ce message provient du pre-flight Sprint 0.",
    html: "<p><strong>Test SMTP K'FIT réussi.</strong></p><p>Ce message provient du pre-flight Sprint 0.</p>",
  });

  console.log(`✓ test email accepted by SMTP server (${result.messageId})`);
  console.log("SMTP pre-flight PASSED");
  console.log("Dev Mailpit UI: http://localhost:8025");
} catch (error) {
  console.error("SMTP pre-flight FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  transport.close();
}
