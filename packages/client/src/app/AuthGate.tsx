import { useState, type ReactNode } from "react";
import { Button } from "../components/ui/button.js";
import { AuthHeading, AuthShell } from "../auth/components/AuthShell.js";
import { BootstrapForm } from "../auth/components/BootstrapForm.js";
import { LoginForm } from "../auth/components/LoginForm.js";
import { RecoveryFlow } from "../auth/components/RecoveryFlow.js";
import { useAuth } from "../auth/state/auth-context.js";

/**
 * Shows the right auth step (board 09); renders the admin app only with an active session.
 * New-device OTP + « Faire confiance à cet appareil » are deferred to a server slice (pre-prod blocker, TASKS.md).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [view, setView] = useState<{ name: "login" } | { name: "recovery"; email: string }>({ name: "login" });

  if (auth.isCheckingSession) {
    return (
      <AuthShell>
        <p role="status" className="text-sm text-muted-foreground">Vérification de la session…</p>
      </AuthShell>
    );
  }

  if (auth.bootstrapStatusError) {
    return (
      <AuthShell>
        <AuthHeading title="Serveur indisponible" description="Impossible de vérifier l'état du compte. Vérifie que l'API et PostgreSQL sont démarrés, puis réessaie." />
        <Button type="button" size="lg" onClick={() => void auth.retryBootstrapStatus()}>
          Réessayer
        </Button>
      </AuthShell>
    );
  }

  if (auth.bootstrapRequired) {
    return (
      <AuthShell>
        <BootstrapForm />
      </AuthShell>
    );
  }

  if (!auth.session) {
    return (
      <AuthShell>
        {view.name === "recovery" ? (
          <RecoveryFlow initialEmail={view.email} onDone={() => setView({ name: "login" })} onCancel={() => setView({ name: "login" })} />
        ) : (
          <LoginForm onForgotPassword={(email) => setView({ name: "recovery", email })} />
        )}
      </AuthShell>
    );
  }

  return <>{children}</>;
}
