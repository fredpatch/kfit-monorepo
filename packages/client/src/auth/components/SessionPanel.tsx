import { useAuth } from "../state/auth-context.js";

export function SessionPanel() {
  const auth = useAuth();

  if (!auth.session) return null;

  return (
    <div className="session-panel">
      <p className="status">Session active</p>
      <dl>
        <div>
          <dt>Rôle</dt>
          <dd>{auth.session.user.role}</dd>
        </div>
        <div>
          <dt>OTP frais</dt>
          <dd>{auth.session.session.freshOtp ? "Oui" : "Non"}</dd>
        </div>
      </dl>
      <button type="button" onClick={() => void auth.logout()}>
        Se déconnecter
      </button>
    </div>
  );
}
