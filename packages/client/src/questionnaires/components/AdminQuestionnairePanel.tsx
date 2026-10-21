import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { questionnaireApi, questionnaireErrorMessage } from "../api/questionnaire-api.js";
import { DynamicQuestionnaireForm } from "./DynamicQuestionnaireForm.js";
const states = { available: "Disponible", consumed: "Utilisé", revoked: "Révoqué", expired: "Expiré", stale: "Remplacé" };
export function AdminQuestionnairePanel({ subscriptionId, editable }: { subscriptionId: string; editable: boolean }) {
  const query = useQuery({ queryKey: ["questionnaire", subscriptionId], queryFn: () => questionnaireApi.get(subscriptionId), refetchInterval: 30000 });
  const client = useQueryClient(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [until, setUntil] = useState(""); const [link, setLink] = useState<string | null>(null); const inFlight = useRef(false);
  async function change(work: () => Promise<unknown>, message: string) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try { await work(); setNotice(message); }
    catch (failure) { setError(questionnaireErrorMessage(failure)); }
    finally { await Promise.all([query.refetch(), client.invalidateQueries({ queryKey: ["onboarding", subscriptionId] }), client.invalidateQueries({ queryKey: ["consents", subscriptionId] })]); setBusy(false); inFlight.current = false; }
  }
  if (query.isPending) return <section className="customers-panel" role="status">Chargement du questionnaire…</section>;
  if (query.isError || !query.data) return <section className="customers-panel" role="alert"><p className="error">{questionnaireErrorMessage(query.error)}</p><button type="button" onClick={() => void query.refetch()}>Réessayer</button></section>;
  const view = query.data.questionnaire; const doc = view.document;
  return <section className="customers-panel"><h3>Questionnaire de préparation</h3>{error && <p className="error" role="alert">{error}</p>}{notice && <p className="status" role="status">{notice}</p>}
    {!doc ? <p>Aucun questionnaire n’est prévu par la configuration de ce service.</p> : <>
      <p>{doc.template.name} · version {doc.template.version} · {doc.template.category === "health" ? "Santé" : "Évaluation"}</p>
      {view.waived && <p className="status">Une dispense du coach reste applicable à ce questionnaire.</p>}
      {editable && <><form className="qualification-review-form" onSubmit={event => { event.preventDefault(); const expiry = new Date(until); if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) { setError("Choisis une expiration future."); return; }
        setLink(null); void change(async () => { const response = await questionnaireApi.issue(subscriptionId, expiry.toISOString()); setLink(`${window.location.origin}/questionnaire#${response.token}`); }, "Lien créé. Copie-le avant de quitter cette page."); }}>
        <label>Expiration du lien questionnaire<input type="datetime-local" required value={until} disabled={busy} onChange={event => setUntil(event.target.value)} /></label><button type="submit" disabled={busy}>Créer un lien questionnaire</button>
      </form>
      {link && <div className="consent-link"><label>Lien à transmettre au client<input readOnly value={link} onFocus={event => event.target.select()} /></label><p className="muted">Le secret ne sera plus affiché après fermeture de cette page.</p></div>}
      <details><summary>{doc.expectedHeadId ? "Saisir une correction avec le client" : "Saisir les réponses avec le client"}</summary>
        <DynamicQuestionnaireForm key={`${doc.template.schemaHash}:${doc.expectedHeadId}:${doc.healthConsent?.definition.id}:${doc.healthConsent?.granted}`} document={doc} coach disabled={busy}
          onSubmit={answers => change(() => questionnaireApi.submit(subscriptionId, { templateId: doc.template.id, templateVersion: doc.template.version, schemaHash: doc.template.schemaHash, expectedHeadId: doc.expectedHeadId, answers }), "Réponses enregistrées dans une nouvelle révision.")} />
      </details></>}
    </>}
    <h4>Liens émis</h4>{view.links.length ? <ul className="onboarding-items">{view.links.map(item => <li key={item.id}>{states[item.state]} · Expiration : {new Date(item.expiresAt).toLocaleString("fr-FR")}
      {item.state === "available" && <button type="button" disabled={busy} onClick={() => { setLink(null); void change(() => questionnaireApi.revoke(subscriptionId, item.id), "Lien révoqué."); }}>Révoquer ce lien</button>}</li>)}</ul> : <p>Aucun lien questionnaire émis.</p>}
    <details><summary>Historique des révisions ({view.history.length})</summary><ul className="onboarding-items">{view.history.map(revision => <li key={revision.id}>Révision {revision.revisionNumber} · Modèle version {revision.templateVersion} · {revision.isCurrent ? "Actuelle" : "Remplacée"}<p>{new Date(revision.submittedAt).toLocaleString("fr-FR")} · {revision.source === "public_link" ? "Lien client" : "Saisie par le coach"}</p></li>)}</ul></details>
  </section>;
}
