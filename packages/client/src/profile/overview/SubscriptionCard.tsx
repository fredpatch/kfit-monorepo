import { useState } from "react";
import { Check, MoreHorizontal } from "lucide-react";
import type { SubscriptionCommand, SubscriptionDetail } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { cn } from "../../lib/utils.js";
import { describeStatus, subscriptionStatus } from "../../lib/status-map.js";
import { dateFr, moneyXaf, shortDateFr } from "../../lib/format.js";
import { commandLabels, splitCommands } from "./subscription-commands.js";
import { DecisionDialog } from "./DecisionDialog.js";

const units: Record<string, [string, string]> = {
  day: ["jour", "jours"],
  week: ["semaine", "semaines"],
  month: ["mois", "mois"],
};
function durationText(view: SubscriptionDetail): string {
  if (view.durationValueSnapshot === null) return "sans durée fixe";
  const [one, many] = units[view.durationUnitSnapshot ?? ""] ?? ["", ""];
  return `${view.durationValueSnapshot} ${view.durationValueSnapshot > 1 ? many : one}`.trim();
}

/* Lifecycle stepper (board 03). Steps map onto the server statuses; the server stays the authority. */
const steps = [
  {
    label: "Préparation",
    statuses: ["onboarding", "awaiting_payment", "medical_clearance_required"],
  },
  { label: "Prêt à démarrer", statuses: ["ready_to_start"] },
  { label: "Actif", statuses: ["active", "paused"] },
  { label: "Revue de fin", statuses: ["completion_due"] },
  { label: "Terminé", statuses: ["completed"] },
] as const;

function Stepper({ view }: { view: SubscriptionDetail }) {
  const current = steps.findIndex((s) =>
    (s.statuses as readonly string[]).includes(view.status),
  );
  const reachedAt = (index: number) => {
    const statuses = steps[index]?.statuses as readonly string[] | undefined;
    const entry = statuses
      ? view.history.find((h) => statuses.includes(h.toStatus))
      : undefined;
    return entry?.changedAt ?? null;
  };
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="Étapes de l'abonnement">
      {steps.map((step, index) => {
        const done = index < current;
        const isCurrent = index === current;
        const label =
          isCurrent && view.status === "paused" ? "En pause" : step.label;
        const date = reachedAt(index);
        return (
          <li
            key={step.label}
            aria-current={isCurrent ? "step" : undefined}
            className="flex min-w-0 flex-col gap-2"
          >
            <span
              className={cn(
                "h-1.5 rounded-full",
                done
                  ? "bg-primary"
                  : isCurrent
                    ? view.status === "paused"
                      ? "bg-warning"
                      : "bg-lime"
                    : "bg-border",
              )}
            />
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex size-[18px] shrink-0 items-center justify-center rounded-full",
                  done
                    ? "bg-primary text-white"
                    : isCurrent
                      ? "border-[5px] border-primary bg-card"
                      : "border-2 border-input bg-card",
                )}
              >
                {done ? (
                  <Check
                    className="size-[11px]"
                    strokeWidth={3.5}
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              <span
                className={cn(
                  "truncate text-xs",
                  isCurrent ? "font-bold" : "font-semibold",
                  index > current ? "text-muted-foreground" : "",
                )}
              >
                {label}
              </span>
            </span>
            <span className="truncate pl-6 text-[11px] text-muted-foreground">
              {date ? shortDateFr(date) : index > current ? "-" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function TimeProgress({ view }: { view: SubscriptionDetail }) {
  if (
    !view.actualStartDate ||
    !view.plannedEndDate ||
    !["active", "paused", "completion_due"].includes(view.status)
  )
    return null;
  const start = new Date(view.actualStartDate).getTime();
  const end = new Date(view.plannedEndDate).getTime();
  const total = Math.max(1, Math.ceil((end - start) / 86_400_000));
  const day = Math.min(
    total,
    Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1),
  );
  const openPause = view.pauses.find((p) => !p.endedAt);
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-[#f7f8f5] p-4">
      <div className="flex flex-wrap justify-between gap-2 text-[13px]">
        <span>
          <strong>Jour {day}</strong> sur {total}
          {openPause ? (
            <span className="text-warning">
              {" "}
              · en pause depuis le {shortDateFr(openPause.startedAt)}
            </span>
          ) : null}
        </span>
        <span className="text-muted-foreground">
          Démarré le {shortDateFr(view.actualStartDate)} · fin prévue le{" "}
          {dateFr(view.plannedEndDate)}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={day}
        aria-label="Avancement dans la durée prévue"
      >
        <div
          className={cn(
            "h-2 rounded-full",
            openPause ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${Math.round((day / total) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Components({ view }: { view: SubscriptionDetail }) {
  if (view.components.length === 0)
    return (
      <p className="text-[13px] text-muted-foreground">
        Aucune prestation enregistrée pour cet abonnement.
      </p>
    );
  return (
    <ul className="flex flex-col gap-3.5">
      {view.components.map((c) => (
        <li key={c.id} className="flex flex-col gap-2">
          <div className="flex flex-wrap justify-between gap-2 text-[13px]">
            <span className="font-semibold">{c.labelSnapshot}</span>
            <span className="text-muted-foreground tabular-nums">
              <strong className="text-foreground">{c.quantityConsumed}</strong>{" "}
              / {c.quantityEntitled} réalisée(s)
              {c.quantityOwedByCoach > 0
                ? ` · ${c.quantityOwedByCoach} due(s) par la coach`
                : ""}
            </span>
          </div>
          {c.quantityEntitled <= 16 ? (
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${Math.max(1, c.quantityEntitled)}, minmax(0, 1fr))`,
              }}
              aria-hidden="true"
            >
              {Array.from({ length: c.quantityEntitled }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-2 rounded-[3px]",
                    i < c.quantityConsumed ? "bg-primary" : "bg-border",
                  )}
                />
              ))}
            </div>
          ) : (
            <div
              className="h-2 overflow-hidden rounded-full bg-border"
              aria-hidden="true"
            >
              <div
                className="h-2 bg-primary"
                style={{
                  width: `${Math.round((c.quantityConsumed / c.quantityEntitled) * 100)}%`,
                }}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Subscription summary + coach decisions (board 03 · Aperçu). */
export function SubscriptionCard({ view }: { view: SubscriptionDetail }) {
  const [command, setCommand] = useState<SubscriptionCommand | null>(null);
  const { primary, secondary } = splitCommands(view.availableCommands);
  const others = secondary.filter((c) => c !== "cancel");
  const canCancel = secondary.includes("cancel");
  const status = describeStatus(subscriptionStatus, view.status);

  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground tabular-nums">
              {view.reference}
            </span>
            <StatusPill size="sm" status={status} />
          </span>
          <h2 className="text-lg font-bold leading-snug">
            {view.serviceName}
            {` - ${view.variantName ?? "Offre unique"}`}
          </h2>
          <span className="text-[13px] text-muted-foreground">
            {moneyXaf(view.agreedPriceXaf)} · durée convenue{" "}
            {durationText(view)}
          </span>
        </div>
        {primary || others.length > 0 || canCancel ? (
          <div className="flex gap-2">
            {primary ? (
              <Button
                variant={
                  primary === "pause" || primary === "completion-due"
                    ? "secondary"
                    : "default"
                }
                size="sm"
                className="h-9"
                onClick={() => setCommand(primary)}
              >
                {commandLabels[primary]}
              </Button>
            ) : null}
            {others.length > 0 || canCancel ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    className="size-9"
                    aria-label="Autres décisions"
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {others.map((c) => (
                    <DropdownMenuItem key={c} onSelect={() => setCommand(c)}>
                      {commandLabels[c]}
                    </DropdownMenuItem>
                  ))}
                  {canCancel ? (
                    <>
                      {others.length > 0 ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuItem
                        destructive
                        onSelect={() => setCommand("cancel")}
                      >
                        {commandLabels.cancel}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
      </div>

      {view.status === "cancelled" ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger">
          Abonnement annulé le {dateFr(view.cancelledAt)}.
        </p>
      ) : (
        <Stepper view={view} />
      )}
      <TimeProgress view={view} />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-4">
        {[
          ["Début prévu", view.plannedStartDate],
          ["Démarrage réel", view.actualStartDate],
          ["Fin prévue", view.plannedEndDate],
          ["Fin réelle", view.actualEndDate],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold">{dateFr(value, "Non définie")}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold">Prestations convenues</h3>
        <Components view={view} />
      </div>

      <DecisionDialog
        view={view}
        command={command}
        onClose={() => setCommand(null)}
      />
    </section>
  );
}
