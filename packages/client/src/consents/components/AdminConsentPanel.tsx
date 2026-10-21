import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { requiredConsentTypes, type ConsentType } from "@kfit/shared";
import { consentApi, consentErrorMessage } from "../api/consent-api.js";
import { ConsentDecisionsForm } from "./ConsentDecisionsForm.js";
const labels: Record<ConsentType, string> = { service_terms: "Conditions de service", privacy_notice: "Confidentialité", health_data: "Données de santé", progress_photo_storage: "Conservation des photos de suivi", marketing: "Communication commerciale", publication: "Publication" };
const decisions = { granted: "Accord", refused: "Refus", revoked: "Retiré" };
const states = { available: "Disponible", expired: "Expiré", revoked: "Révoqué", consumed: "Utilisé", stale: "Versions remplacées" };
export function AdminConsentPanel({ subscriptionId, editable }: { subscriptionId: string; editable: boolean }) {
  const query = useQuery({ queryKey: ["consents", subscriptionId], queryFn: () => consentApi.get(subscriptionId), refetchInterval: 30_000 });
  const client = useQueryClient(); const [until, setUntil] = useState(""); const [link, setLink] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const inFlight = useRef(false);
  async function change(operation: () => Promise<unknown>, message: string) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try { await operation(); setNotice(message); }
    catch (failure) { setError(consentErrorMessage(failure)); }
    finally { await Promise.all([query.refetch(), client.invalidateQueries({ queryKey: ["onboarding", subscriptionId] })]); inFlight.current = false; setBusy(false); }
  }
  if (query.isPending) return <section className="customers-panel" role="status">Chargement des consentements…</section>;
  if (query.isError || !query.data) return <section className="customers-panel" role="alert"><p className="error">{consentErrorMessage(query.error)}</p><button type="button" onClick={() => void query.refetch()}>Réessayer</button></section>;
  const view = query.data.consents;
  const definitions = requiredConsentTypes.flatMap(type => view.definitions.filter(d => d.consentType === type && d.status === "published").sort((a,b) => BigInt(a.version) > BigInt(b.version) ? -1 : 1).slice(0,1));
  return <section className="customers-panel consent-panel"><h3>Conditions et consentements</h3>
    <p className={view.requiredBundle.satisfied ? "status" : "muted"}>{view.requiredBundle.satisfied ? "Conditions et confidentialité acceptées dans leurs versions actuelles." : "L’accord aux deux documents actuels est nécessaire pour lever ce blocage."}</p>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="status" role="status">{notice}</p>}
    {view.requiredBundle.missingDefinitions.length > 0 && <p className="error" role="alert">Documents publiés manquants : {view.requiredBundle.missingDefinitions.map(type => labels[type]).join(", ")}. Aucun lien ni recueil ne peut être créé.</p>}
    {editable && definitions.length === 2 && <>
      <form className="qualification-review-form" onSubmit={event => { event.preventDefault(); const expiry = new Date(until); if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) { setError("Choisis une expiration future."); return; }
        setLink(null); void change(async () => { const response = await consentApi.issue(subscriptionId, expiry.toISOString()); setLink(`${window.location.origin}/consent#${response.token}`); }, "Lien créé. Copie-le avant de quitter cette page."); }}>
        <label>Expiration du lien<input type="datetime-local" required value={until} disabled={busy} onChange={event => setUntil(event.target.value)} /></label><button type="submit" disabled={busy}>Créer un lien d’acceptation</button>
      </form>
      {link && <div className="consent-link"><label>Lien à transmettre au client<input readOnly value={link} onFocus={event => event.target.select()} /></label><p className="muted">Ce lien donne accès aux deux documents. Le secret ne sera pas réaffiché après fermeture de cette page.</p></div>}
      <details><summary>Recueillir les décisions avec le client</summary><p>Lis et présente séparément chaque document au client avant d’enregistrer ses choix.</p>
        <ConsentDecisionsForm key={definitions.map(d => d.id).join(":")} definitions={definitions} disabled={busy} coach onSubmit={values => change(() => consentApi.capture(subscriptionId, values, definitions.map(d => d.id)), "Décisions et provenance enregistrées.")} />
      </details>
    </>}
    <h4>Liens émis</h4>{view.links.length === 0 ? <p>Aucun lien émis.</p> : <ul className="onboarding-items">{view.links.map(item => <li key={item.id}>{states[item.state]} · Expiration : {new Date(item.expiresAt).toLocaleString("fr-FR")}
      {item.state === "available" && <button type="button" disabled={busy} onClick={() => { setLink(null); void change(() => consentApi.revokeLink(subscriptionId, item.id), "Lien révoqué."); }}>Révoquer ce lien</button>}</li>)}</ul>}
    <h4>Décisions actuelles</h4>{view.current.length === 0 ? <p>Aucune décision enregistrée.</p> : <ul className="onboarding-items">{view.current.map(record => <li key={record.id}>{labels[record.consentType]} · version {record.definitionVersion} · {decisions[record.decision]}
      {!requiredConsentTypes.some(type => type === record.consentType) && record.decision === "granted" && <button type="button" disabled={busy} onClick={() => void change(() => consentApi.revoke(subscriptionId, record.consentType), "Retrait enregistré dans l’historique.")}>Retirer ce consentement</button>}</li>)}</ul>}
    <details><summary>Historique et provenance ({view.history.length})</summary><ul className="onboarding-items">{view.history.map(record => <li key={record.id}>{labels[record.consentType]} · version {record.definitionVersion} · {decisions[record.decision]}<p>{new Date(record.capturedAt).toLocaleString("fr-FR")} · {record.capturedVia === "public_link" ? "Lien client" : "Recueil par le coach"}</p></li>)}</ul></details>
  </section>;
}
