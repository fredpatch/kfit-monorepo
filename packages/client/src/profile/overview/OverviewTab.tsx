import { useQuery } from "@tanstack/react-query";
import { subscriptionErrorMessage, subscriptionsApi } from "../../subscriptions/api/subscriptions-api.js";
import { Button } from "../../components/ui/button.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { SubscriptionCard } from "./SubscriptionCard.js";
import { CadenceCard, HistoryCard, PreparationCard, UpcomingAppointmentsCard } from "./side-cards.js";

type OverviewTabProps = { subscriptionId: string; openTab: (tab: "rendez-vous" | "suivis" | "preparation") => void };

/** Client profile · Aperçu (board 03). Read from existing per-subscription endpoints; no new API. */
export function OverviewTab({ subscriptionId, openTab }: OverviewTabProps) {
  const query = useQuery({ queryKey: ["subscription-lifecycle", subscriptionId], queryFn: () => subscriptionsApi.get(subscriptionId) });

  if (query.isPending) return <p role="status" className="text-sm text-muted-foreground">Chargement de l'abonnement…</p>;
  if (query.isError) {
    return <EmptyState title="Impossible de charger l'abonnement" description={subscriptionErrorMessage(query.error)} action={<Button variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button>} />;
  }
  const view = query.data.subscription;
  const showCadence = ["active", "paused", "completion_due"].includes(view.status);
  const showPreparation = ["onboarding", "awaiting_payment", "medical_clearance_required", "ready_to_start", "active"].includes(view.status);

  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
        <SubscriptionCard view={view} />
        <UpcomingAppointmentsCard subscriptionId={subscriptionId} openTab={openTab} />
      </div>
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
        {showCadence ? <CadenceCard subscriptionId={subscriptionId} openTab={openTab} /> : null}
        {showPreparation ? <PreparationCard subscriptionId={subscriptionId} openTab={openTab} /> : null}
        <HistoryCard view={view} />
      </div>
    </div>
  );
}
