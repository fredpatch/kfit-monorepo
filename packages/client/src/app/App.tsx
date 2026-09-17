import { useState } from "react";
import { BootstrapForm } from "../auth/components/BootstrapForm.js";
import { LoginForm } from "../auth/components/LoginForm.js";
import { SessionPanel } from "../auth/components/SessionPanel.js";
import { AuthProvider, useAuth } from "../auth/state/auth-context.js";
import { AdminCatalogueCapacityPage } from "../catalogue/components/AdminCatalogueCapacityPage.js";
import { PublicCataloguePage } from "../catalogue/components/PublicCataloguePage.js";
import { AdminRequestsQueuePage } from "../requests/components/AdminRequestsQueuePage.js";

type AdminTab = "catalogue" | "requests";

function AdminApp() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("catalogue");

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
          <h1>{activeTab === "catalogue" ? "Gestion du catalogue" : "Demandes et contacts"}</h1>
          <p className="muted">
            {activeTab === "catalogue"
              ? "Pilote la disponibilité des offres publiques depuis un espace authentifié."
              : "Suis les demandes reçues et enregistre les tentatives de contact."}
          </p>
        </div>
        <SessionPanel />
      </header>

      <nav className="admin-tabs">
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
      </nav>

      {activeTab === "catalogue" ? <AdminCatalogueCapacityPage /> : <AdminRequestsQueuePage />}
    </main>
  );
}

export function App() {
  if (window.location.pathname.startsWith("/admin")) {
    return (
      <AuthProvider>
        <AdminApp />
      </AuthProvider>
    );
  }

  return <PublicCataloguePage />;
}
