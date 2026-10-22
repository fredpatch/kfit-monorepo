import { Suspense, lazy, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider } from "../auth/state/auth-context.js";
import { PublicCataloguePage } from "../catalogue/components/PublicCataloguePage.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { AuthGate } from "./AuthGate.js";
import { AdminLayout } from "./layout/AdminLayout.js";
import { AdminPage } from "./layout/AdminPage.js";
import { LegacySubscriptionRedirect, SubscriptionPreparationRoute, SubscriptionRoute } from "./routes/subscription-routes.js";

/* Screens load on demand: keeps the first load small (charts, tables, legacy screens). */
const PublicAppointmentPage = lazy(() => import("../appointments/components/PublicAppointmentPage.js").then((m) => ({ default: m.PublicAppointmentPage })));
const PublicDocumentPage = lazy(() => import("../documents/components/PublicDocumentPage.js").then((m) => ({ default: m.PublicDocumentPage })));
const CataloguePage = lazy(() => import("../catalogue/components/CataloguePage.js").then((m) => ({ default: m.CataloguePage })));
const PublicConsentPage = lazy(() => import("../consents/components/PublicConsentPage.js").then((m) => ({ default: m.PublicConsentPage })));
const ClientsPage = lazy(() => import("../customers/components/ClientsPage.js").then((m) => ({ default: m.ClientsPage })));
const AdminFollowUpQueuePage = lazy(() => import("../follow-ups/components/AdminFollowUpQueuePage.js").then((m) => ({ default: m.AdminFollowUpQueuePage })));
const TodayPage = lazy(() => import("../dashboard/components/TodayPage.js").then((m) => ({ default: m.TodayPage })));
const QuestionnairesPage = lazy(() => import("../questionnaires/components/QuestionnairesPage.js").then((m) => ({ default: m.QuestionnairesPage })));
const PublicQuestionnairePage = lazy(() => import("../questionnaires/components/PublicQuestionnairePage.js").then((m) => ({ default: m.PublicQuestionnairePage })));
const RequestsPage = lazy(() => import("../requests/components/RequestsPage.js").then((m) => ({ default: m.RequestsPage })));
const ClientProfilePage = lazy(() => import("./routes/client-profile.js").then((m) => ({ default: m.ClientProfilePage })));

// DEV-only component gallery (UX-1). The condition is static in production builds, so the module is dropped.
const UiGallery = import.meta.env.DEV ? lazy(() => import("../dev/UiGallery.js").then((m) => ({ default: m.UiGallery }))) : null;

/** Public pages keep their current look until UX-11 / UX-12. */
function Legacy({ children }: { children: ReactNode }) {
  return (
    <div className="legacy">
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
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
        <Route path="/document/:token" element={<Suspense fallback={null}><PublicDocumentPage /></Suspense>} />
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
          <Route index element={<TodayPage />} />
          <Route
            path="suivis"
            element={
              <AdminPage title="Suivis" description="Priorise les suivis selon la cadence active et les prochaines actions." legacy>
                <AdminFollowUpQueuePage />
              </AdminPage>
            }
          />
          <Route path="demandes" element={<RequestsPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:id" element={<ClientProfilePage />} />
          <Route path="abonnements/:id" element={<SubscriptionRoute />} />
          <Route path="abonnements/:id/preparation" element={<SubscriptionPreparationRoute />} />
          <Route path="offres" element={<CataloguePage />} />
          <Route path="questionnaires" element={<QuestionnairesPage />} />

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
