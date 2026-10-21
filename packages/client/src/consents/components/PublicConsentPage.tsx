import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { consentApi, consentErrorMessage } from "../api/consent-api.js";
import { ConsentDecisionsForm } from "./ConsentDecisionsForm.js";
export function PublicConsentPage() {
  const [link, setLink] = useState(() => ({ token: window.location.hash.slice(1), key: crypto.randomUUID() }));
  useEffect(() => {
    const changed = () => setLink({ token: window.location.hash.slice(1), key: crypto.randomUUID() });
    window.addEventListener("hashchange", changed); return () => window.removeEventListener("hashchange", changed);
  }, []);
  return <PublicConsentContent key={link.key} token={link.token} queryId={link.key} />;
}
function PublicConsentContent({ token, queryId }: { token: string; queryId: string }) {
  const [submitted, setSubmitted] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const inFlight = useRef(false);
  const query = useQuery({ queryKey: ["public-consent", queryId], queryFn: () => consentApi.publicGet(token), retry: false, refetchOnWindowFocus: false, enabled: !!token && !submitted });
  return <main className="consent-shell"><section className="customers-panel"><p className="eyebrow">K’FIT</p><h1>Conditions de service et confidentialité</h1>
    {!token ? <p className="error" role="alert">Ce lien est incomplet. Demande un nouveau lien au coach.</p> : submitted ? <div role="status"><h2>Choix enregistrés</h2><p>Chaque décision a été conservée avec la version présentée. Si tu as refusé un document, le coach pourra t’accompagner pour la suite.</p><p>Ce lien a été utilisé et ne permet plus de renvoyer les choix.</p></div>
      : query.isPending ? <p role="status">Chargement des documents…</p> : query.isError || !query.data ? <p className="error" role="alert">{consentErrorMessage(query.error)}</p> : <>
        <p>Abonnement : {query.data.document.subscriptionReference}</p><p>Lis chaque document puis indique ton choix séparément. Aucun choix n’est présélectionné.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <ConsentDecisionsForm definitions={query.data.document.definitions} disabled={busy} onSubmit={async decisions => {
          if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(null);
          try { await consentApi.publicSubmit(token, decisions); setSubmitted(true); }
          catch (failure) { setError(consentErrorMessage(failure)); await query.refetch(); }
          finally { inFlight.current = false; setBusy(false); }
        }} />
      </>}
  </section></main>;
}
