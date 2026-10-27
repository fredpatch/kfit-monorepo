import type { DashboardAlert } from "@kfit/shared";
import type { DrizzleNotificationsRepository, ReconcileResult } from "../repositories/notifications.repository.js";
import type { NotificationMailDelivery } from "./notification-mail.delivery.js";
import { smtpErrorCode } from "./notification-mail.delivery.js";
import { candidatesFromAlerts, nextAttemptAfterFailure, type NotificationCandidate } from "./notification.policy.js";

/** The two S7.2 jobs. Sources are read through the S7.1 alert derivation, so each owner module keeps business truth. */
export class NotificationJobsService {
  constructor(
    private readonly repository: Pick<DrizzleNotificationsRepository, "reconcile" | "claimDue" | "markSent" | "markFailed" | "interruptStale">,
    private readonly alerts: () => Promise<DashboardAlert[]>,
    private readonly mail: NotificationMailDelivery | null,
    private readonly clock: () => Date = () => new Date(),
    /** OPS-01 O9: supervision alerts, reconciled in the same pass so they open and resolve like every other kind. */
    private readonly extraCandidates: () => Promise<NotificationCandidate[]> = async () => [],
  ) {}

  /** notifications.reconcile — a failure throws (the job run is recorded failed); nothing is e-mailed without durable history. */
  async reconcile(): Promise<ReconcileResult> {
    const alerts = await this.alerts();
    return this.repository.reconcile([...candidatesFromAlerts(alerts), ...(await this.extraCandidates())], this.clock());
  }

  /** notifications.email-delivery — SMTP happens outside any transaction; an SMTP failure never touches notifications or business data. */
  async deliver(batch = 20): Promise<{ claimed: number; sent: number; failed: number; deadLettered: number; interrupted: number }> {
    const now = this.clock();
    const interrupted = await this.repository.interruptStale(new Date(now.getTime() - 30 * 60_000), now);
    const rows = await this.repository.claimDue(now, batch);
    const result = { claimed: rows.length, sent: 0, failed: 0, deadLettered: 0, interrupted };
    for (const row of rows) {
      try {
        if (!this.mail) throw Object.assign(new Error("SMTP not configured"), { code: "NOT_CONFIGURED" });
        const sent = await this.mail.send({ to: row.toEmail, subject: row.subject, text: row.bodyText, html: row.bodyHtml });
        await this.repository.markSent(row.id, sent.messageId, this.clock());
        result.sent++;
      } catch (error) {
        const next = nextAttemptAfterFailure(row.attemptCount, this.clock());
        await this.repository.markFailed(row.id, smtpErrorCode(error), next, this.clock());
        if (next) result.failed++; else result.deadLettered++;
      }
    }
    return result;
  }
}
