import { useState, type FormEvent } from "react";
import { useAuth } from "../state/auth-context.js";

export function LoginForm() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await auth.login({ email, password });
    } catch {
      setError("Identifiants invalides ou compte indisponible.");
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
      </label>
      <label>
        Mot de passe
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button type="submit">Se connecter</button>
    </form>
  );
}
