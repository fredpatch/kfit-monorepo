import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { requiredConsentTypes, type ConsentDefinition, type ConsentDecisions, type RequiredConsentType } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { PublicChoice, PublicLoading, PublicNote, PublicShell, PublicTitle, PublicUnavailable, publicPrimaryClass } from "../../components/public/PublicShell.js";
import { cn } from "../../lib/utils.js";
import { consentApi, consentErrorMessage } from "../api/consent-api.js";

/** Token in the URL hash; a new hash = a fresh page. */
export function PublicConsentPage() {
  const [link, setLink] = useState(() => ({ token: window.location.hash.slice(1), key: crypto.randomUUID() }));
  useEffect(() => {
    const changed = () => setLink({ token: window.location.hash.slice(1), key: crypto.randomUUID() });
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  return <PublicConsentContent key={link.key} token={link.token} queryId={link.key} />;
}

type Choice = "granted" | "refused" | "";

/**
 * Service terms + privacy notice (board 11c). Customer-only form: nothing preselected, each document answered
 * separately, both required before sending (S4 consent rules). The coach capture form (admin) is unchanged.
 */
function PublicConsentContent({ token, queryId }: { token: string; queryId: string }) {
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<RequiredConsentType, Choice>>({ service_terms: "", privacy_notice: "" });
  const inFlight = useRef(false);
  const query = useQuery({ queryKey: ["public-consent", queryId], queryFn: () => consentApi.publicGet(token), retry: false, refetchOnWindowFocus: false, enabled: !!token && !submitted });

  async function submit() {
    const { service_terms, privacy_notice } = choices;
    if (!service_terms || !privacy_notice || inFlight.current) return;
    const decisions: ConsentDecisions = { service_terms, privacy_notice };
    inFlight.current = true; setBusy(true); setError(null);
    try { await consentApi.publicSubmit(token, decisions); setSubmitted(true); }
    catch (failure) { setError(consentErrorMessage(failure)); await query.refetch(); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const tag = "Conditions";
  if (!token) return <PublicUnavailable title="Lien incomplet" message="Ce lien est incomplet. Demande un nouveau lien à ton coach." tag={tag} />;
  if (submitted) {
    return (
      <PublicShell tag={tag} className="items-center justify-center gap-4 py-10 text-center">
        <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-[20px] bg-success-soft text-success"><Check className="size-8" /></span>
        <h1 className="text-2xl font-extrabold tracking-tight">Choix enregistrés</h1>
        <p role="status" className="text-[15px] leading-relaxed text-muted-foreground">Chaque réponse est conservée avec la version que tu as lue. Si tu as refusé un document, ton coach pourra t'accompagner pour la suite.</p>
        <p className="text-[13px] text-muted-foreground">Ce lien a été utilisé. Tu peux fermer cette page.</p>
      </PublicShell>
    );
  }
  if (query.isPending) return <PublicLoading label="Chargement des documents…" tag={tag} />;
  if (query.isError || !query.data) return <PublicUnavailable title="Documents indisponibles" message={consentErrorMessage(query.error)} tag={tag} />;

  const definitions = requiredConsentTypes
    .map((type) => query.data.document.definitions.find((d) => d.consentType === type))
    .filter((d): d is ConsentDefinition => Boolean(d));
  const answered = definitions.filter((d) => choices[d.consentType as RequiredConsentType]).length;
  const complete = answered === definitions.length && definitions.length > 0;

  return (
    <PublicShell
      tag={tag}
      actions={
        <>
          <p className="text-center text-xs text-muted-foreground" aria-live="polite">{answered} réponse{answered > 1 ? "s" : ""} sur {definitions.length}</p>
          <Button className={publicPrimaryClass} disabled={busy || !complete} onClick={() => void submit()}>{busy ? "Enregistrement…" : "Envoyer mes réponses"}</Button>
        </>
      }
    >
      <PublicTitle>Avant de commencer</PublicTitle>
      <p className="text-[15px] leading-relaxed text-muted-foreground">Lis et réponds à ces deux documents. Les deux sont nécessaires pour démarrer ton accompagnement.</p>
      {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}

      {definitions.map((definition) => {
        const type = definition.consentType as RequiredConsentType;
        const value = choices[type];
        const set = (next: Choice) => setChoices((current) => ({ ...current, [type]: next }));
        return (
          <fieldset key={definition.id} disabled={busy} className={cn("flex flex-col gap-3 rounded-[18px] border bg-card p-4", value ? "border-primary/40" : "border-border")}>
            <legend className="sr-only">{definition.title}</legend>
            <div className="flex items-start gap-2.5">
              <div className="flex flex-1 flex-col gap-0.5">
                <h2 className="text-[17px] font-extrabold">{definition.title}</h2>
                <span className="text-xs text-muted-foreground">Version {definition.version} · obligatoire</span>
              </div>
              {value ? <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-bold text-success">Répondu</span> : null}
            </div>
            <details className="group">
              <summary className="cursor-pointer text-sm font-bold text-primary">Lire le texte complet</summary>
              <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{definition.content}</p>
            </details>
            <div className="grid grid-cols-2 gap-2">
              <PublicChoice name={type} checked={value === "granted"} onChange={() => set("granted")} label="J'accepte" />
              <PublicChoice name={type} checked={value === "refused"} onChange={() => set("refused")} label="Je refuse" />
            </div>
          </fieldset>
        );
      })}

      <PublicNote>Aucune case n'est cochée d'avance. Tu pourras retirer ton accord plus tard en écrivant à ton coach.</PublicNote>
    </PublicShell>
  );
}
