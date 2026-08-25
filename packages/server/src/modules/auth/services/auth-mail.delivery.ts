import nodemailer from "nodemailer";

export type PasswordRecoveryMail = {
  to: string;
  code: string;
  expiresAt: Date;
};

export type AuthMailDelivery = {
  sendPasswordRecoveryCode(input: PasswordRecoveryMail): Promise<void>;
};

export type SmtpAuthMailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

export function loadSmtpAuthMailConfig(env: NodeJS.ProcessEnv): SmtpAuthMailConfig {
  const port = Number(env.SMTP_PORT ?? "1025");
  if (!Number.isSafeInteger(port) || port <= 0) throw new Error("SMTP_PORT must be a positive integer");
  if (!env.SMTP_HOST) throw new Error("SMTP_HOST is required");
  if (!env.SMTP_FROM) throw new Error("SMTP_FROM is required");

  return {
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE === "true",
    from: env.SMTP_FROM,
    ...(env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : {}),
  };
}

export class NodemailerAuthMailDelivery implements AuthMailDelivery {
  private readonly transport: ReturnType<typeof nodemailer.createTransport>;

  constructor(private readonly config: SmtpAuthMailConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass ?? "" } : undefined,
    });
  }

  async sendPasswordRecoveryCode(input: PasswordRecoveryMail): Promise<void> {
    await this.transport.sendMail({
      from: this.config.from,
      to: input.to,
      subject: "K'FIT — Code de réinitialisation",
      text: [
        "Vous avez demandé la réinitialisation de votre mot de passe K'FIT.",
        `Code : ${input.code}`,
        `Expiration : ${input.expiresAt.toISOString()}`,
        "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
      ].join("\n\n"),
    });
  }
}
