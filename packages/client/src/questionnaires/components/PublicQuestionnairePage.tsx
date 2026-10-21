import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { questionnaireApi, questionnaireErrorMessage } from "../api/questionnaire-api.js";
import { DynamicQuestionnaireForm } from "./DynamicQuestionnaireForm.js";
export function PublicQuestionnairePage() {
  const [link, setLink] = useState(() => ({ token: window.location.hash.slice(1), key: crypto.randomUUID() }));
  useEffect(() => { const changed = () => setLink({ token: window.location.hash.slice(1), key: crypto.randomUUID() }); window.addEventListener("hashchange", changed); return () => window.removeEventListener("hashchange", changed); }, []);
  return <QuestionnaireContent key={link.key} token={link.token} queryId={link.key} />;
}
function QuestionnaireContent({ token, queryId }: { token: string; queryId: string }) {
  const [outcome, setOutcome] = useState<"submitted" | "health_consent_refused" | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const inFlight = useRef(false);
  const query = useQuery({ queryKey: ["public-questionnaire", queryId], queryFn: () => questionnaireApi.publicGet(token), enabled: !!token && outcome === null, retry: false, refetchOnWindowFocus: false, gcTime: 0 });
  return <main className="consent-shell"><section className="customers-panel"><p className="eyebrow">K’FIT</p><h1>Questionnaire de préparation</h1>
    {!token ? <p className="error" role="alert">Ce lien est incomplet. Demande un nouveau lien au coach.</p> : outcome ? <div role="status"><h2>{outcome === "submitted" ? "Réponses enregistrées" : "Refus enregistré"}</h2><p>{outcome === "submitted" ? "Tes réponses ont été conservées avec la version présentée." : "Ton refus a été conservé séparément. Aucune réponse au questionnaire n’a été enregistrée."}</p><p>Ce lien a été utilisé. Contacte le coach pour un nouvel envoi.</p></div>
      : query.isPending ? <p role="status">Chargement du questionnaire…</p> : query.isError || !query.data ? <p className="error" role="alert">{questionnaireErrorMessage(query.error)}</p> : <>
        <p>Abonnement : {query.data.document.subscriptionReference}</p>{error && <p className="error" role="alert">{error}</p>}
        <DynamicQuestionnaireForm document={query.data.document} disabled={busy} onSubmit={async (answers, healthDataDecision) => {
          if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(null);
          try { const response = await questionnaireApi.publicSubmit(token, { answers, ...(healthDataDecision ? { healthDataDecision } : {}) }); setOutcome(response.result.outcome); }
          catch (failure) { setError(questionnaireErrorMessage(failure)); await query.refetch(); }
          finally { inFlight.current = false; setBusy(false); }
        }} />
      </>}
  </section></main>;
}
