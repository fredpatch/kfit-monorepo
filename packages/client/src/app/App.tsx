import { BootstrapForm } from "../auth/components/BootstrapForm.js";
import { LoginForm } from "../auth/components/LoginForm.js";
import { SessionPanel } from "../auth/components/SessionPanel.js";
import { useAuth } from "../auth/state/auth-context.js";

export function App() {
  const auth = useAuth();

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">K'FIT Admin</p>
        <h1>Accès sécurisé</h1>
        <p className="muted">
          Connecte-toi pour gérer les abonnements, clients et opérations K'FIT.
        </p>

        {auth.isLoading ? <p className="status">Vérification de la session...</p> : null}
        {auth.bootstrapRequired ? <BootstrapForm /> : null}
        {!auth.bootstrapRequired && auth.session ? <SessionPanel /> : null}
        {!auth.bootstrapRequired && !auth.session && !auth.isLoading ? <LoginForm /> : null}
      </section>
    </main>
  );
}
