import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { PublicLoading, PublicShell, PublicUnavailable } from "../../components/public/PublicShell.js";
import { questionnaireApi, questionnaireErrorMessage } from "../api/questionnaire-api.js";
import { PublicQuestionnaireSteps } from "./PublicQuestionnaireSteps.js";

/** Token in the URL hash; a new hash = a fresh page. */
export function PublicQuestionnairePage() {
  const [link, setLink] = useState(() => ({ token: window.location.hash.slice(1), key: crypto.randomUUID() }));
  useEffect(() => {
    const changed = () => setLink({ token: window.location.hash.slice(1), key: crypto.randomUUID() });
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  return <QuestionnaireContent key={link.key} token={link.token} queryId={link.key} />;
}

/** Questionnaire link (board 11b). Submission and outcomes unchanged from S4/S5; the coach form (admin) is untouched. */
function QuestionnaireContent({ token, queryId }: { token: string; queryId: string }) {
  const [outcome, setOutcome] = useState<"submitted" | "health_consent_refused" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const query = useQuery({ queryKey: ["public-questionnaire", queryId], queryFn: () => questionnaireApi.publicGet(token), enabled: !!token && outcome === null, retry: false, refetchOnWindowFocus: false, gcTime: 0 });

  const tag = "Questionnaire";
  if (!token) return <PublicUnavailable title="Lien incomplet" message="Ce lien est incomplet. Demande un nouveau lien à ton coach." tag={tag} />;
  if (outcome) {
    const submitted = outcome === "submitted";
    return (
      <PublicShell tag={tag} className="items-center justify-center gap-4 py-10 text-center">
        <span aria-hidden="true" className="flex size-[72px] items-center justify-center rounded-full bg-success-soft text-success"><Check className="size-9" /></span>
        <h1 className="text-[26px] font-extrabold tracking-tight">{submitted ? "Merci !" : "Refus enregistré"}</h1>
        <p role="status" className="text-[15px] leading-relaxed text-muted-foreground">
          {submitted ? "Tes réponses sont envoyées à ton coach, avec la version du questionnaire que tu as vue." : "Ton refus est conservé. Aucune réponse au questionnaire n'a été enregistrée. Ton coach te recontactera."}
        </p>
        <p className="text-[13px] text-muted-foreground">Ce lien a été utilisé. Tu peux fermer cette page.</p>
      </PublicShell>
    );
  }
  if (query.isPending) return <PublicLoading label="Chargement du questionnaire…" tag={tag} />;
  if (query.isError || !query.data) return <PublicUnavailable title="Questionnaire indisponible" message={questionnaireErrorMessage(query.error)} tag={tag} />;

  return (
    <PublicQuestionnaireSteps
      document={query.data.document}
      disabled={busy}
      error={error}
      onSubmit={async (answers, healthDataDecision) => {
        if (inFlight.current) return;
        inFlight.current = true; setBusy(true); setError(null);
        try { const response = await questionnaireApi.publicSubmit(token, { answers, ...(healthDataDecision ? { healthDataDecision } : {}) }); setOutcome(response.result.outcome); }
        catch (failure) { setError(questionnaireErrorMessage(failure)); await query.refetch(); }
        finally { inFlight.current = false; setBusy(false); }
      }}
    />
  );
}
