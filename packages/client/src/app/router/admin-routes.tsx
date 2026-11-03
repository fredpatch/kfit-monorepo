import { lazy } from "react";
import { Route } from "react-router";
import { hasRole } from "@kfit/shared";
import { AuthProvider, useAuth } from "../../auth/state/auth-context.js";
import { AuthGate } from "../AuthGate.js";
import { AdminLayout } from "../layout/AdminLayout.js";
import { AdminNotFound } from "../layout/AdminNotFound.js";
import { AdminPage } from "../layout/AdminPage.js";
import {
  SubscriptionPreparationRoute,
  SubscriptionRoute,
} from "../routes/subscription-routes.js";
import { legacyRoutes } from "./legacy-routes.js";

/* Screens load on demand: keeps the first load small (charts, tables, public pages). */
const SupervisionPage = lazy(() =>
  import("../../supervision/components/SupervisionPage.js").then((m) => ({
    default: m.SupervisionPage,
  })),
);
const NotificationSettingsPage = lazy(() =>
  import("../../notifications/components/NotificationSettingsPage.js").then(
    (m) => ({ default: m.NotificationSettingsPage }),
  ),
);
const CataloguePage = lazy(() =>
  import("../../pages/admin/catalogue/CataloguePage.js").then((m) => ({
    default: m.CataloguePage,
  })),
);
const ClientsPage = lazy(() =>
  import("../../customers/components/ClientsPage.js").then((m) => ({
    default: m.ClientsPage,
  })),
);
const AdminFollowUpQueuePage = lazy(() =>
  import("../../follow-ups/components/AdminFollowUpQueuePage.js").then((m) => ({
    default: m.AdminFollowUpQueuePage,
  })),
);
const TodayPage = lazy(() =>
  import("../../dashboard/components/TodayPage.js").then((m) => ({
    default: m.TodayPage,
  })),
);
const QuestionnairesPage = lazy(() =>
  import("../../questionnaires/components/QuestionnairesPage.js").then((m) => ({
    default: m.QuestionnairesPage,
  })),
);
const ConsentTextsPage = lazy(() =>
  import("../../consents/components/ConsentTextsPage.js").then((m) => ({
    default: m.ConsentTextsPage,
  })),
);
const RequestsPage = lazy(() =>
  import("../../pages/admin/requests/RequestsPage.js").then((m) => ({
    default: m.RequestsPage,
  })),
);
const ClientProfilePage = lazy(() =>
  import("../routes/client-profile.js").then((m) => ({
    default: m.ClientProfilePage,
  })),
);

function AdminRoot() {
  return (
    <AuthProvider>
      <AuthGate>
        <AdminLayout />
      </AuthGate>
    </AuthProvider>
  );
}

/** ROLE-01 R6 / OPS-01b S1: superadmin only (the server refuses the API to others). */
function SupervisionRoute() {
  const user = useAuth().session?.user ?? null;
  if (!hasRole(user, "superadmin")) return <AdminNotFound />;
  return <SupervisionPage />;
}

export function adminRoutes() {
  return (
    <>
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
            <AdminPage
              title="Suivis"
              description="Les clientes à recontacter selon leur rythme de suivi, en retard d'abord."
            >
              <AdminFollowUpQueuePage />
            </AdminPage>
          }
        />
        <Route path="demandes" element={<RequestsPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="clients/:id" element={<ClientProfilePage />} />
        <Route path="abonnements/:id" element={<SubscriptionRoute />} />
        <Route
          path="abonnements/:id/preparation"
          element={<SubscriptionPreparationRoute />}
        />
        <Route path="offres" element={<CataloguePage />} />
        <Route path="questionnaires" element={<QuestionnairesPage />} />
        <Route path="consentements" element={<ConsentTextsPage />} />
        <Route path="reglages" element={<NotificationSettingsPage />} />
        <Route path="supervision" element={<SupervisionRoute />} />

        {legacyRoutes()}

        <Route path="*" element={<AdminNotFound />} />
      </Route>
    </>
  );
}
