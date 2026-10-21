import { useState } from "react";
import { AdminSubscriptionPage } from "../subscriptions/components/AdminSubscriptionPage.js";
import { BootstrapForm } from "../auth/components/BootstrapForm.js";
import { LoginForm } from "../auth/components/LoginForm.js";
import { SessionPanel } from "../auth/components/SessionPanel.js";
import { AuthProvider, useAuth } from "../auth/state/auth-context.js";
import { AdminCatalogueCapacityPage } from "../catalogue/components/AdminCatalogueCapacityPage.js";
import { PublicCataloguePage } from "../catalogue/components/PublicCataloguePage.js";
import { AdminRequestsQueuePage } from "../requests/components/AdminRequestsQueuePage.js";
import { AdminCustomersPage } from "../customers/components/AdminCustomersPage.js";
import { AdminOnboardingPage } from "../onboarding/components/AdminOnboardingPage.js";
import { PublicConsentPage } from "../consents/components/PublicConsentPage.js";
import { PublicQuestionnairePage } from "../questionnaires/components/PublicQuestionnairePage.js";
import { AdminQuestionnaireTemplatesPage } from "../questionnaires/components/AdminQuestionnaireTemplatesPage.js";

type AdminTab = "catalogue" | "requests" | "customers" | "onboarding" | "questionnaires" | "subscriptions";

function AdminApp() {
  const auth = useAuth();
  const onboardingId = /^\/admin\/onboarding\/([0-9a-f-]{36})$/i.exec(window.location.pathname)?.[1] ?? "";
  const subscriptionId = /^\/admin\/subscription\/([0-9a-f-]{36})$/i.exec(window.location.pathname)?.[1] ?? "";
  const [activeTab, setActiveTab] = useState<AdminTab>(subscriptionId ? "subscriptions" : onboardingId ? "onboarding" : "catalogue");

  if (auth.isLoading) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">K'FIT Admin</p>
          <h1>Accès sécurisé</h1>
          <p className="status">Vérification de la session...</p>
        </section>
      </main>
    );
  }

  if (auth.bootstrapStatusError) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">K'FIT Admin</p>
          <h1>API locale indisponible</h1>
          <p className="error">
            Impossible de vérifier si l’initialisation K'FIT est requise. Vérifie que l’API locale et PostgreSQL sont démarrés.
          </p>
          <button type="button" onClick={() => void auth.retryBootstrapStatus()}>
            Réessayer
          </button>
        </section>
      </main>
    );
  }

  if (auth.bootstrapRequired) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">K'FIT Admin</p>
          <h1>Initialisation sécurisée</h1>
          <BootstrapForm />
        </section>
      </main>
    );
  }

  if (!auth.session) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">K'FIT Admin</p>
          <h1>Accès sécurisé</h1>
          <p className="muted">
            Connecte-toi pour gérer les abonnements, clients et opérations K'FIT.
          </p>
          <LoginForm />
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">K'FIT Admin</p>
          <h1>{activeTab === "subscriptions" ? "Cycle de vie des abonnements" : activeTab === "catalogue" ? "Gestion du catalogue" : activeTab === "customers" ? "Gestion des clients" : activeTab === "onboarding" ? "Préparation des abonnements" : activeTab === "questionnaires" ? "Modèles de questionnaires" : "Demandes et contacts"}</h1>
          <p className="muted">
            {activeTab === "subscriptions" ? "Consulte les dates et prestations, puis enregistre chaque décision du cycle de vie." : activeTab === "catalogue"
              ? "Pilote la disponibilité des offres publiques depuis un espace authentifié."
              : activeTab === "customers" ? "Retrouve un client par WhatsApp ou crée sa fiche." : activeTab === "onboarding" ? "Vérifie les exigences et la capacité avant le démarrage." : activeTab === "questionnaires" ? "Prépare et publie les versions des questionnaires d’évaluation et de santé." : "Suis les demandes reçues et enregistre les tentatives de contact."}
          </p>
        </div>
        <SessionPanel />
      </header>

      <nav className="admin-tabs">
        <button type="button" className={activeTab === "subscriptions" ? "admin-tabs__tab admin-tabs__tab--active" : "admin-tabs__tab"} onClick={() => setActiveTab("subscriptions")}>Abonnements</button>
        <button
          type="button"
          className={activeTab === "catalogue" ? "admin-tabs__tab admin-tabs__tab--active" : "admin-tabs__tab"}
          onClick={() => setActiveTab("catalogue")}
        >
          Catalogue
        </button>
        <button
          type="button"
          className={activeTab === "requests" ? "admin-tabs__tab admin-tabs__tab--active" : "admin-tabs__tab"}
          onClick={() => setActiveTab("requests")}
        >
          Demandes
        </button>
        <button type="button" className={activeTab === "customers" ? "admin-tabs__tab admin-tabs__tab--active" : "admin-tabs__tab"} onClick={() => setActiveTab("customers")}>
          Clients
        </button>
        <button type="button" className={activeTab === "onboarding" ? "admin-tabs__tab admin-tabs__tab--active" : "admin-tabs__tab"} onClick={() => setActiveTab("onboarding")}>Onboarding</button>
        <button type="button" className={activeTab === "questionnaires" ? "admin-tabs__tab admin-tabs__tab--active" : "admin-tabs__tab"} onClick={() => setActiveTab("questionnaires")}>Questionnaires</button>
      </nav>

      {activeTab === "subscriptions" ? <AdminSubscriptionPage initialSubscriptionId={subscriptionId} /> : activeTab === "catalogue" ? <AdminCatalogueCapacityPage /> : activeTab === "customers" ? <AdminCustomersPage /> : activeTab === "onboarding" ? <AdminOnboardingPage initialSubscriptionId={onboardingId} /> : activeTab === "questionnaires" ? <AdminQuestionnaireTemplatesPage /> : <AdminRequestsQueuePage />}
    </main>
  );
}

export function App() {
  if (window.location.pathname === "/consent") return <PublicConsentPage />;
  if (window.location.pathname === "/questionnaire") return <PublicQuestionnairePage />;
  if (window.location.pathname.startsWith("/admin")) {
    return (
      <AuthProvider>
        <AdminApp />
      </AuthProvider>
    );
  }

  return <PublicCataloguePage />;
}
