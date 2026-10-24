import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider } from "../auth/state/auth-context.js";
import { PublicCataloguePage } from "../catalogue/components/PublicCataloguePage.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { AuthGate } from "./AuthGate.js";
import { AdminLayout } from "./layout/AdminLayout.js";
import { AdminPage } from "./layout/AdminPage.js";
import { LegacySubscriptionRedirect, SubscriptionPreparationRoute, SubscriptionRoute } from "./routes/subscription-routes.js";

/* Screens load on demand: keeps the first load small (charts, tables, public pages). */
const PublicAppointmentPage = lazy(() => import("../appointments/components/PublicAppointmentPage.js").then((m) => ({ default: m.PublicAppointmentPage })));
const PublicDocumentPage = lazy(() => import("../documents/components/PublicDocumentPage.js").then((m) => ({ default: m.PublicDocumentPage })));
const PublicQuotePage = lazy(() => import("../quotes/components/PublicQuotePage.js").then((m) => ({ default: m.PublicQuotePage })));
const PublicReceiptPage = lazy(() => import("../receipts/components/PublicReceiptPage.js").then((m) => ({ default: m.PublicReceiptPage })));
const PublicPaymentProofPage = lazy(() => import("../payment-proofs/components/PublicPaymentProofPage.js").then((m) => ({ default: m.PublicPaymentProofPage })));
const CataloguePage = lazy(() => import("../catalogue/components/CataloguePage.js").then((m) => ({ default: m.CataloguePage })));
const PublicConsentPage = lazy(() => import("../consents/components/PublicConsentPage.js").then((m) => ({ default: m.PublicConsentPage })));
const ClientsPage = lazy(() => import("../customers/components/ClientsPage.js").then((m) => ({ default: m.ClientsPage })));
const AdminFollowUpQueuePage = lazy(() => import("../follow-ups/components/AdminFollowUpQueuePage.js").then((m) => ({ default: m.AdminFollowUpQueuePage })));
const TodayPage = lazy(() => import("../dashboard/components/TodayPage.js").then((m) => ({ default: m.TodayPage })));
const QuestionnairesPage = lazy(() => import("../questionnaires/components/QuestionnairesPage.js").then((m) => ({ default: m.QuestionnairesPage })));
const PublicRequestPage = lazy(() => import("../requests/components/PublicRequestForm.js").then((m) => ({ default: m.PublicRequestPage })));
const PublicQuestionnairePage = lazy(() => import("../questionnaires/components/PublicQuestionnairePage.js").then((m) => ({ default: m.PublicQuestionnairePage })));
const RequestsPage = lazy(() => import("../requests/components/RequestsPage.js").then((m) => ({ default: m.RequestsPage })));
const ClientProfilePage = lazy(() => import("./routes/client-profile.js").then((m) => ({ default: m.ClientProfilePage })));

// DEV-only component gallery (UX-1). The condition is static in production builds, so the module is dropped.
const UiGallery = import.meta.env.DEV ? lazy(() => import("../dev/UiGallery.js").then((m) => ({ default: m.UiGallery }))) : null;

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
        <Route path="/" element={<PublicCataloguePage />} />
        <Route path="/demande/:offre" element={<Suspense fallback={null}><PublicRequestPage /></Suspense>} />
        <Route path="/appointment" element={<Suspense fallback={null}><PublicAppointmentPage /></Suspense>} />
        <Route path="/document/:token" element={<Suspense fallback={null}><PublicDocumentPage /></Suspense>} />
        <Route path="/devis/:token" element={<Suspense fallback={null}><PublicQuotePage /></Suspense>} />
        <Route path="/recu/:token" element={<Suspense fallback={null}><PublicReceiptPage /></Suspense>} />
        <Route path="/justificatif/:token" element={<Suspense fallback={null}><PublicPaymentProofPage /></Suspense>} />
        <Route path="/consent" element={<Suspense fallback={null}><PublicConsentPage /></Suspense>} />
        <Route path="/questionnaire" element={<Suspense fallback={null}><PublicQuestionnairePage /></Suspense>} />

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
              <AdminPage title="Suivis" description="Les clientes à recontacter selon leur rythme de suivi, en retard d'abord.">
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
