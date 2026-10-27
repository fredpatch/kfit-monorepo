import { useQuery } from "@tanstack/react-query";
import { NavLink, Navigate, useParams } from "react-router";
import { EmptyState } from "../../components/ui/empty-state.js";
import { Button } from "../../components/ui/button.js";
import { subscriptionsApi } from "../../subscriptions/api/subscriptions-api.js";
import { AdminPage } from "../layout/AdminPage.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function InvalidSubscription() {
  return (
    <AdminPage title="Abonnement">
      <EmptyState
        title="Abonnement introuvable"
        description="Ce lien ne correspond à aucun abonnement. Ouvre-le depuis la fiche client, la file des suivis ou une demande convertie."
        action={
          <Button asChild variant="secondary">
            <NavLink to="/admin/clients">Voir les clients</NavLink>
          </Button>
        }
      />
    </AdminPage>
  );
}

/**
 * /admin/abonnements/:id[/preparation] - a subscription now lives on its client's profile (board 03, UX-4).
 * Resolves the client and redirects, keeping existing links (follow-up queue, converted requests, renewals) working.
 */
function SubscriptionRedirect({ tab }: { tab: "apercu" | "preparation" }) {
  const { id = "" } = useParams();
  const valid = uuidPattern.test(id);
  // Same key as the lifecycle panel, so the profile reuses this response.
  const query = useQuery({
    queryKey: ["subscription-lifecycle", id],
    queryFn: () => subscriptionsApi.get(id),
    enabled: valid,
    retry: false,
  });

  if (!valid || query.isError) return <InvalidSubscription />;
  if (query.isPending) {
    return (
      <AdminPage title="Abonnement">
        <p role="status" className="text-sm text-muted-foreground">
          Ouverture de la fiche client…
        </p>
      </AdminPage>
    );
  }
  const { customerId } = query.data.subscription;
  return (
    <Navigate
      replace
      to={`/admin/clients/${customerId}?abonnement=${id}&onglet=${tab}`}
    />
  );
}

export function SubscriptionRoute() {
  return <SubscriptionRedirect tab="apercu" />;
}

export function SubscriptionPreparationRoute() {
  return <SubscriptionRedirect tab="preparation" />;
}

/** Old links (/admin/subscription/:id, /admin/onboarding/:id) keep working. */
export function LegacySubscriptionRedirect({
  section,
}: {
  section: "lifecycle" | "preparation";
}) {
  const { id = "" } = useParams();
  return (
    <Navigate
      replace
      to={
        section === "preparation"
          ? `/admin/abonnements/${id}/preparation`
          : `/admin/abonnements/${id}`
      }
    />
  );
}
