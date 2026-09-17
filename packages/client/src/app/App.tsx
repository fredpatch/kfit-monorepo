import { BootstrapForm } from "../auth/components/BootstrapForm.js";
import { LoginForm } from "../auth/components/LoginForm.js";
import { SessionPanel } from "../auth/components/SessionPanel.js";
import { AuthProvider, useAuth } from "../auth/state/auth-context.js";
import { AdminCatalogueCapacityPage } from "../catalogue/components/AdminCatalogueCapacityPage.js";
import { PublicCataloguePage } from "../catalogue/components/PublicCataloguePage.js";

function AdminApp() {
  const auth = useAuth();

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
          <h1>Gestion du catalogue</h1>
          <p className="muted">Pilote la disponibilité des offres publiques depuis un espace authentifié.</p>
        </div>
        <SessionPanel />
      </header>
      <AdminCatalogueCapacityPage />
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
