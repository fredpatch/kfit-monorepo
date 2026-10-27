import {
  type DashboardAlert,
  type DashboardAlertsResponse,
  type TodayTaskKind,
} from "@kfit/shared";
import type { DashboardActor, TodayService } from "./today.service.js";
import type { DrizzleDashboardAlertsRepository } from "../repositories/alerts.repository.js";

export class DashboardAlertsService {
  constructor(
    private readonly repository: Pick<
      DrizzleDashboardAlertsRepository,
      "snapshot"
    >,
    private readonly today: Pick<TodayService, "today">,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async alerts(actor: DashboardActor): Promise<DashboardAlertsResponse> {
    const now = this.clock();
    const [source, current] = await Promise.all([
      this.repository.snapshot(now),
      this.today.today(actor),
    ]);
    const alerts: DashboardAlert[] = [];
    const taskKinds: Partial<
      Record<
        TodayTaskKind,
        { kind: DashboardAlert["kind"]; title: string; tab: string }
      >
    > = {
      follow_up_overdue: {
        kind: "follow_up_overdue",
        title: "Suivi en retard",
        tab: "suivis",
      },
      request_new: {
        kind: "request_to_contact",
        title: "Demande à contacter",
        tab: "",
      },
      preparation_expired: {
        kind: "preparation_blocked",
        title: "Réservation expirée",
        tab: "preparation",
      },
      preparation_waiting: {
        kind: "preparation_blocked",
        title: "Préparation à compléter",
        tab: "preparation",
      },
      completion_due: {
        kind: "completion_due",
        title: "Revue de fin à effectuer",
        tab: "apercu",
      },
    };
    const profile = (customerId: string, subscriptionId: string, tab: string) =>
      `/admin/clients/${customerId}?abonnement=${subscriptionId}&onglet=${tab}`;
    for (const task of current.tasks) {
      // POL-01 D5: the two finance kinds come from the « À traiter » tasks; same fields and key order as the former loops.
      if (
        task.kind === "installment_overdue" ||
        task.kind === "payment_proof_pending"
      ) {
        const owner = source.owners.find(
          (row) => row.subscriptionId === task.subscriptionId,
        );
        if (!owner) continue;
        alerts.push(
          task.kind === "installment_overdue"
            ? {
                ...owner,
                kind: "installment_overdue",
                severity: "warning",
                requestId: null,
                resourceId: task.resourceId ?? null,
                title: "Échéance en retard",
                summary: `${(task.amountXaf ?? 0).toLocaleString("fr-FR")} FCFA restant à régler`,
                referenceAt: task.at,
                deepLink: profile(
                  owner.customerId,
                  owner.subscriptionId,
                  "finance",
                ),
              }
            : {
                ...owner,
                kind: "payment_proof_pending",
                severity: "info",
                requestId: null,
                resourceId: task.resourceId ?? null,
                title: "Justificatif à examiner",
                summary: "Une action est attendue dans le dossier client.",
                referenceAt: task.at,
                deepLink: profile(
                  owner.customerId,
                  owner.subscriptionId,
                  "finance",
                ),
              },
        );
        continue;
      }
      const definition = taskKinds[task.kind];
      if (!definition) continue;
      if (
        task.customerId &&
        !source.owners.some(
          (owner) =>
            owner.customerId === task.customerId &&
            owner.subscriptionId === task.subscriptionId,
        )
      )
        continue;
      alerts.push({
        kind: definition.kind,
        severity: "warning",
        customerId: task.customerId,
        customerDisplayName: task.name,
        subscriptionId: task.subscriptionId,
        requestId: task.requestId,
        resourceId: null,
        title: definition.title,
        summary: task.offer,
        referenceAt: task.at,
        deepLink: task.requestId
          ? `/admin/demandes?demande=${task.requestId}`
          : profile(task.customerId!, task.subscriptionId!, definition.tab),
      });
    }
    // Quote changes stay alerts-only (POL-01 D5).
    for (const row of source.quoteChanges) {
      const owner = source.owners.find(
        (item) => item.subscriptionId === row.subscriptionId,
      );
      if (!owner) continue;
      alerts.push({
        ...owner,
        kind: "quote_action_required",
        severity: "info",
        requestId: null,
        resourceId: row.resourceId,
        title: "Modification de devis demandée",
        summary: "Une action est attendue dans le dossier client.",
        referenceAt: row.referenceAt.toISOString(),
        deepLink: profile(owner.customerId, owner.subscriptionId, "devis"),
      });
    }
    alerts.sort(
      (a, b) =>
        (a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1) ||
        (a.referenceAt ?? "").localeCompare(b.referenceAt ?? "") ||
        a.kind.localeCompare(b.kind) ||
        (a.resourceId ?? a.subscriptionId ?? a.requestId ?? "").localeCompare(
          b.resourceId ?? b.subscriptionId ?? b.requestId ?? "",
        ),
    );
    return { asOf: now.toISOString(), alerts };
  }
}
