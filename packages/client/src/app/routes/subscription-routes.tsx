import { NavLink, Navigate, useParams } from "react-router";
import { cn } from "../../lib/utils.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { Button } from "../../components/ui/button.js";
import { SubscriptionLifecyclePanel } from "../../subscriptions/components/AdminSubscriptionPage.js";
import { OnboardingPanel } from "../../onboarding/components/AdminOnboardingPage.js";
import { AdminPage } from "../layout/AdminPage.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function SubscriptionTabs({ id }: { id: string }) {
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn(
      "-mb-px inline-flex h-11 items-center border-b-2 px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      isActive ? "border-primary font-bold text-foreground" : "border-transparent font-semibold text-muted-foreground hover:text-foreground",
    );
  return (
    <nav aria-label="Sections de l'abonnement" className="flex flex-wrap gap-1 border-b border-border">
      <NavLink end to={`/admin/abonnements/${id}`} className={tab}>
        Cycle de vie
      </NavLink>
      <NavLink to={`/admin/abonnements/${id}/preparation`} className={tab}>
        Préparation
      </NavLink>
    </nav>
  );
}

function InvalidSubscription() {
  return (
    <AdminPage title="Abonnement">
      <EmptyState
        title="Abonnement introuvable"
        description="Ce lien ne correspond à aucun abonnement. Ouvre-le depuis la file des suivis ou depuis une demande convertie."
        action={
          <Button asChild variant="secondary">
            <NavLink to="/admin/suivis">Voir les suivis</NavLink>
          </Button>
        }
      />
    </AdminPage>
  );
}

/** /admin/abonnements/:id — replaces the former « coller un identifiant » field. Becomes the client profile in UX-4. */
export function SubscriptionRoute() {
  const { id = "" } = useParams();
  if (!uuidPattern.test(id)) return <InvalidSubscription />;
  return (
    <AdminPage title="Abonnement" description="Dates, prestations, rendez-vous et décisions du cycle de vie." toolbar={<SubscriptionTabs id={id} />} legacy>
      <SubscriptionLifecyclePanel key={id} id={id} />
    </AdminPage>
  );
}

export function SubscriptionPreparationRoute() {
  const { id = "" } = useParams();
  if (!uuidPattern.test(id)) return <InvalidSubscription />;
  return (
    <AdminPage title="Préparation de l'abonnement" description="Exigences, capacité, consentements et questionnaire avant le démarrage." toolbar={<SubscriptionTabs id={id} />} legacy>
      <OnboardingPanel key={id} subscriptionId={id} />
    </AdminPage>
  );
}

/** Old links (/admin/subscription/:id, /admin/onboarding/:id) keep working. */
export function LegacySubscriptionRedirect({ section }: { section: "lifecycle" | "preparation" }) {
  const { id = "" } = useParams();
  return <Navigate replace to={section === "preparation" ? `/admin/abonnements/${id}/preparation` : `/admin/abonnements/${id}`} />;
}
