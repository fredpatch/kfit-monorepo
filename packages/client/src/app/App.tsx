import { Suspense, lazy, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider } from "../auth/state/auth-context.js";
import { PublicAppointmentPage } from "../appointments/components/PublicAppointmentPage.js";
import { AdminCatalogueCapacityPage } from "../catalogue/components/AdminCatalogueCapacityPage.js";
import { PublicCataloguePage } from "../catalogue/components/PublicCataloguePage.js";
import { PublicConsentPage } from "../consents/components/PublicConsentPage.js";
import { AdminCustomersPage } from "../customers/components/AdminCustomersPage.js";
import { AdminFollowUpQueuePage } from "../follow-ups/components/AdminFollowUpQueuePage.js";
import { AdminQuestionnaireTemplatesPage } from "../questionnaires/components/AdminQuestionnaireTemplatesPage.js";
import { PublicQuestionnairePage } from "../questionnaires/components/PublicQuestionnairePage.js";
import { AdminRequestsQueuePage } from "../requests/components/AdminRequestsQueuePage.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { AuthGate } from "./AuthGate.js";
import { AdminLayout } from "./layout/AdminLayout.js";
import { AdminPage } from "./layout/AdminPage.js";
import { LegacySubscriptionRedirect, SubscriptionPreparationRoute, SubscriptionRoute } from "./routes/subscription-routes.js";

// DEV-only component gallery (UX-1). The condition is static in production builds, so the module is dropped.
const UiGallery = import.meta.env.DEV ? lazy(() => import("../dev/UiGallery.js").then((m) => ({ default: m.UiGallery }))) : null;

/** Public pages keep their current look until UX-11 / UX-12. */
function Legacy({ children }: { children: ReactNode }) {
  return <div className="legacy">{children}</div>;
}

function AdminRoot() {
  return (
    <AuthProvider>
      <AuthGate>
        <AdminLayout />
      </AuthGate>
    </AuthProvider>
  );
}

function AdminNotFound() {
  return (
    <AdminPage title="Page introuvable">
      <EmptyState title="Cette page n'existe pas" description="Utilise le menu pour revenir à un écran de l'espace coach." />
    </AdminPage>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Legacy><PublicCataloguePage /></Legacy>} />
        <Route path="/appointment" element={<Legacy><PublicAppointmentPage /></Legacy>} />
        <Route path="/consent" element={<Legacy><PublicConsentPage /></Legacy>} />
        <Route path="/questionnaire" element={<Legacy><PublicQuestionnairePage /></Legacy>} />

        {UiGallery ? (
          <Route
            path="/__ui"
            element={
              <Suspense fallback={null}>
                <UiGallery />
              </Suspense>
            }
          />
        ) : null}

        {/*
          Admin screen URLs must never start with an API prefix proxied in vite.config.ts
          (/admin/catalogue, /admin/requests, /admin/customers, /admin/subscriptions…): a reload would hit the API.
        */}
        <Route path="/admin" element={<AdminRoot />}>
          {/* « Aujourd'hui » replaces this redirect in UX-9. */}
          <Route index element={<Navigate replace to="suivis" />} />
          <Route
            path="suivis"
            element={
              <AdminPage title="Suivis" description="Priorise les suivis selon la cadence active et les prochaines actions." legacy>
                <AdminFollowUpQueuePage />
              </AdminPage>
            }
          />
          <Route
            path="demandes"
            element={
              <AdminPage title="Demandes" description="Suis les demandes reçues, enregistre les tentatives de contact et fais progresser leur statut." legacy>
                <AdminRequestsQueuePage />
              </AdminPage>
            }
          />
          <Route
            path="clients"
            element={
              <AdminPage title="Clients" description="Retrouve un client par WhatsApp ou crée sa fiche." legacy>
                <AdminCustomersPage />
              </AdminPage>
            }
          />
          <Route path="abonnements/:id" element={<SubscriptionRoute />} />
          <Route path="abonnements/:id/preparation" element={<SubscriptionPreparationRoute />} />
          <Route
            path="offres"
            element={
              <AdminPage title="Catalogue" description="Pilote la disponibilité des offres publiques." legacy>
                <AdminCatalogueCapacityPage />
              </AdminPage>
            }
          />
          <Route
            path="questionnaires"
            element={
              <AdminPage title="Questionnaires" description="Prépare et publie les versions des questionnaires d’évaluation et de santé." legacy>
                <AdminQuestionnaireTemplatesPage />
              </AdminPage>
            }
          />

          {/* Former URLs, still used in e-mails or bookmarks. */}
          <Route path="follow-up-queue" element={<Navigate replace to="/admin/suivis" />} />
          <Route path="subscription/:id" element={<LegacySubscriptionRedirect section="lifecycle" />} />
          <Route path="onboarding/:id" element={<LegacySubscriptionRedirect section="preparation" />} />

          <Route path="*" element={<AdminNotFound />} />
        </Route>

        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
