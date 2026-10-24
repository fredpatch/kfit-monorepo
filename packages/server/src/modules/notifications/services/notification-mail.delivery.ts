import nodemailer from "nodemailer";
import type { SmtpAuthMailConfig } from "../../auth/services/auth-mail.delivery.js";

/** Generic internal e-mail for S7.2 (same SMTP settings as auth mail). Returns the provider message id when SMTP gives one. */
export type NotificationMailDelivery = { send(input: { to: string; subject: string; text: string; html: string | null }): Promise<{ messageId: string | null }> };

/** Error codes stored on the outbox row: never the provider message or the e-mail content. */
export function smtpErrorCode(error: unknown): string {
  const code = (error as { code?: unknown; responseCode?: unknown } | null)?.code;
  const response = (error as { responseCode?: unknown } | null)?.responseCode;
  if (typeof response === "number") return `SMTP_${response}`;
  return typeof code === "string" && /^[A-Z_]{2,40}$/.test(code) ? `SMTP_${code}` : "SMTP_SEND_FAILED";
}

export class NodemailerNotificationMailDelivery implements NotificationMailDelivery {
  private readonly transport: ReturnType<typeof nodemailer.createTransport>;
  constructor(private readonly config: SmtpAuthMailConfig) {
    this.transport = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: config.user ? { user: config.user, pass: config.pass ?? "" } : undefined });
  }
  async send(input: { to: string; subject: string; text: string; html: string | null }) {
    const info = await this.transport.sendMail({ from: this.config.from, to: input.to, subject: input.subject, text: input.text, ...(input.html ? { html: input.html } : {}) });
    return { messageId: typeof info.messageId === "string" ? info.messageId : null };
  }
}
