import { useState, type FormEvent } from "react";
import { useAuth } from "../state/auth-context.js";

export function BootstrapForm() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await auth.bootstrap({ email, password });
      setCreated(true);
    } catch {
      setError("Impossible de créer le compte initial. Vérifie le mot de passe et réessaie.");
    }
  }

  if (created) {
    return <p className="status">Compte initial créé. Tu peux maintenant te connecter.</p>;
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <h2>Initialisation requise</h2>
      <p className="muted">Crée le premier compte coach/admin. Aucun identifiant par défaut n'est fourni.</p>
      <label>
        Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
      </label>
      <label>
        Mot de passe
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button type="submit">Créer le compte initial</button>
    </form>
  );
}
