import type { ReactNode } from "react";
import { BootstrapForm } from "../auth/components/BootstrapForm.js";
import { LoginForm } from "../auth/components/LoginForm.js";
import { useAuth } from "../auth/state/auth-context.js";

/* Auth screens keep their current look (legacy) until UX-10 rebuilds them. */
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="legacy">
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">K'FIT Admin</p>
          {children}
        </section>
      </main>
    </div>
  );
}

/** Shows the right auth step; renders the admin app only with an active session. */
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <AuthShell>
        <h1>Accès sécurisé</h1>
        <p className="status">Vérification de la session...</p>
      </AuthShell>
    );
  }

  if (auth.bootstrapStatusError) {
    return (
      <AuthShell>
        <h1>API locale indisponible</h1>
        <p className="error">
          Impossible de vérifier si l’initialisation K'FIT est requise. Vérifie que l’API locale et PostgreSQL sont démarrés.
        </p>
        <button type="button" onClick={() => void auth.retryBootstrapStatus()}>
          Réessayer
        </button>
      </AuthShell>
    );
  }

  if (auth.bootstrapRequired) {
    return (
      <AuthShell>
        <h1>Initialisation sécurisée</h1>
        <BootstrapForm />
      </AuthShell>
    );
  }

  if (!auth.session) {
    return (
      <AuthShell>
        <h1>Accès sécurisé</h1>
        <p className="muted">Connecte-toi pour gérer les abonnements, clients et opérations K'FIT.</p>
        <LoginForm />
      </AuthShell>
    );
  }

  return <>{children}</>;
}
