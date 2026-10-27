import { useState, type ReactNode } from "react";
import { Button } from "../components/ui/button.js";
import { AuthHeading, AuthShell } from "../auth/components/AuthShell.js";
import { BootstrapForm } from "../auth/components/BootstrapForm.js";
import { DeviceCodeStep, type LoginChallenge } from "../auth/components/DeviceCodeStep.js";
import { LoginForm } from "../auth/components/LoginForm.js";
import { RecoveryFlow } from "../auth/components/RecoveryFlow.js";
import { useAuth } from "../auth/state/auth-context.js";

/**
 * Shows the right auth step (board 09); renders the admin app only with an active session.
 * SEC-02b: an untrusted device goes through « Nouvel appareil » (e-mailed code) before the session exists.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [view, setView] = useState<{ name: "login"; notice: string | null } | { name: "recovery"; email: string } | { name: "device"; challenge: LoginChallenge }>({ name: "login", notice: null });
  const toLogin = (notice: string | null = null) => setView({ name: "login", notice });

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
          <RecoveryFlow initialEmail={view.email} onDone={() => toLogin()} onCancel={() => toLogin()} />
        ) : view.name === "device" ? (
          <DeviceCodeStep challenge={view.challenge} onRestart={toLogin} />
        ) : (
          <LoginForm
            key={view.notice ?? ""}
            notice={view.notice}
            onForgotPassword={(email) => setView({ name: "recovery", email })}
            onOtpRequired={(challenge) => setView({ name: "device", challenge })}
          />
        )}
      </AuthShell>
    );
  }

  return <>{children}</>;
}
