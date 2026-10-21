import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SubscriptionCommand, SubscriptionInput } from "@kfit/shared";
import { subscriptionsApi, subscriptionErrorMessage } from "../api/subscriptions-api.js";

const states: Record<string, string> = { onboarding: "En préparation", ready_to_start: "Prêt à démarrer", active: "Actif", paused: "En pause", completion_due: "Revue de fin", completed: "Terminé", cancelled: "Annulé", awaiting_payment: "En attente de paiement", medical_clearance_required: "Validation médicale requise" };
const actions: Record<SubscriptionCommand, string> = { activate: "Démarrer", pause: "Mettre en pause", resume: "Reprendre", "completion-due": "Ouvrir la revue de fin", "resume-active": "Prolonger / reprendre après revue", complete: "Terminer", cancel: "Annuler l’abonnement", renew: "Renouveler" };
const units: Record<string, string> = { day: "jour(s)", week: "semaine(s)", month: "mois" };
const format = (value: string | null) => value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "Non définie";
function Panel({ id }: { id: string }) {
  const client = useQueryClient(), key = ["subscription-lifecycle", id] as const;
  const query = useQuery({ queryKey: key, queryFn: () => subscriptionsApi.get(id) });
  const [action, setAction] = useState<SubscriptionCommand | null>(null), [reason, setReason] = useState(""), [end, setEnd] = useState(""), [start, setStart] = useState(""), [override, setOverride] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mutation = useMutation({ mutationFn: ({ command, input }: { command: SubscriptionCommand; input: SubscriptionInput }) => subscriptionsApi.command(id, command, input) });
  if (query.isPending) return <p role="status">Chargement de l’abonnement…</p>;
  if (query.isError || !query.data) return <div role="alert"><p className="error">{subscriptionErrorMessage(query.error)}</p><button type="button" onClick={() => void query.refetch()}>Réessayer</button></div>;
  const view = query.data.subscription, pending = mutation.isPending;
  const selected = action && view.availableCommands.includes(action) ? action : null;
  const needsReason = selected === "pause" || selected === "cancel" || selected === "resume-active" || selected === "complete" && override
    || selected === "completion-due" && (!view.plannedEndDate || new Date(view.plannedEndDate).getTime() > Date.now());
  async function submit() {
    if (!selected || inFlight.current) return;
    let input: SubscriptionInput = {};
    if (needsReason && !reason.trim()) { setError("Renseigne un motif non vide."); return; }
    if (selected === "pause" || selected === "cancel" || selected === "completion-due") input = { reason: reason.trim() };
    if (selected === "complete") input = { overrideOutstandingComponents: override, ...(override ? { overrideReason: reason.trim() } : {}) };
    if (selected === "resume" || selected === "resume-active") {
      const chosen = end ? new Date(end) : null;
      if (end && !Number.isFinite(chosen?.getTime())) { setError("Choisis une date de fin valide."); return; }
      input = { ...(chosen ? { revisedEndDate: chosen.toISOString() } : {}), ...(selected === "resume-active" ? { reason: reason.trim() } : {}) };
    }
    if (selected === "renew") {
      const chosen = new Date(start); if (!Number.isFinite(chosen.getTime())) { setError("Choisis une date de début valide."); return; }
      input = { plannedStartDate: chosen.toISOString() };
    }
    inFlight.current = true; setError(null); setNotice(null);
    try {
      const response = await mutation.mutateAsync({ command: selected, input }); client.setQueryData(key, response);
      await client.invalidateQueries({ queryKey: ["onboarding", id] }); setAction(null); setNotice("Décision enregistrée.");
    } catch (failure) { setError(subscriptionErrorMessage(failure)); await query.refetch(); }
    finally { inFlight.current = false; }
  }
  return <div className="onboarding-grid">
    <section className="customers-panel subscription-summary"><p className="eyebrow">{states[view.status] ?? "État à vérifier"}</p><h2>{view.reference}</h2>
      <p>{view.serviceName}{view.variantName ? ` — ${view.variantName}` : ""}</p>
      <p>Durée convenue : {view.durationValueSnapshot === null ? "Sans durée" : `${view.durationValueSnapshot} ${units[view.durationUnitSnapshot ?? ""] ?? view.durationUnitSnapshot}`}</p>
      <dl className="subscription-dates"><div><dt>Début prévu</dt><dd>{format(view.plannedStartDate)}</dd></div><div><dt>Démarrage réel</dt><dd>{format(view.actualStartDate)}</dd></div><div><dt>Fin prévue</dt><dd>{format(view.plannedEndDate)}</dd></div><div><dt>Fin réelle</dt><dd>{format(view.actualEndDate)}</dd></div></dl>
      {view.completedAt && <p>Terminé le {format(view.completedAt)}</p>}{view.cancelledAt && <p>Annulé le {format(view.cancelledAt)}</p>}
      <div className="onboarding-actions"><a href={`/admin/onboarding/${id}`}>Ouvrir l’onboarding</a><button type="button" disabled={pending || query.isFetching} onClick={() => void query.refetch()}>Actualiser</button></div>
      {notice && <p className="status" role="status">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}
    </section>
    <section className="customers-panel"><h3>Décision du coach</h3>
      {view.availableCommands.length === 0 && <p>Aucune action disponible dans cet état.</p>}
      <div className="onboarding-actions">{view.availableCommands.map(command => <button type="button" key={command} disabled={pending} aria-pressed={selected === command} onClick={() => { setAction(command); setReason(""); setEnd(""); setStart(""); setOverride(false); setError(null); setNotice(null); }}>{actions[command]}</button>)}</div>
      {selected && <form className="qualification-review-form" onSubmit={event => { event.preventDefault(); void submit(); }}><h4>{actions[selected]}</h4>
        {selected === "activate" && <p>Le démarrage réel sera enregistré maintenant. La fin prévue sera calculée à partir de la durée convenue.</p>}
        {selected === "cancel" && <p>L’annulation clôture l’abonnement et toute pause ouverte. Confirme cette décision avec un motif.</p>}
        {selected === "complete" && <><p>Vérifie les prestations encore dues avant de clôturer.</p><label><input type="checkbox" checked={override} disabled={pending} onChange={event => setOverride(event.target.checked)} /> Autoriser explicitement la clôture malgré un solde dû</label></>}
        {(needsReason || selected === "completion-due") && <label>Motif{needsReason ? " obligatoire" : " (facultatif)"}<textarea required={needsReason} rows={3} maxLength={2000} value={reason} disabled={pending} onChange={event => setReason(event.target.value)} /></label>}
        {(selected === "resume" || selected === "resume-active") && <><label>Nouvelle fin prévue{selected === "resume" && view.plannedEndDate ? " obligatoire" : " (facultative sans prolongation)"}<input type="datetime-local" required={selected === "resume" && !!view.plannedEndDate} value={end} disabled={pending} onChange={event => setEnd(event.target.value)} /></label><p className="muted">Choisis manuellement la date. La durée de pause n’est pas ajoutée automatiquement. Fin actuelle : {format(view.plannedEndDate)}.</p></>}
        {selected === "renew" && <><label>Début prévu du renouvellement<input type="datetime-local" required value={start} disabled={pending} onChange={event => setStart(event.target.value)} /></label><p>Un nouvel abonnement sera créé en préparation, avec les conditions et prestations convenues de celui-ci.</p></>}
        <div className="onboarding-actions"><button type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Confirmer la décision"}</button><button type="button" disabled={pending} onClick={() => setAction(null)}>Fermer</button></div>
      </form>}
    </section>
    <section className="customers-panel"><h3>Prestations convenues</h3>{view.components.length === 0 ? <p>Aucune prestation enregistrée.</p> : <ul className="onboarding-items">{view.components.map(c => <li key={c.id}><strong>{c.labelSnapshot}</strong><p>{c.quantityEntitled} prévue(s) · {c.quantityConsumed} réalisée(s) · {c.quantityOwedByCoach} due(s) par le coach</p></li>)}</ul>}</section>
    <section className="customers-panel"><h3>Renouvellements</h3>{view.renewedFromSubscriptionId ? <p>Abonnement précédent : <a href={`/admin/subscription/${view.renewedFromSubscriptionId}`}>Ouvrir le précédent</a></p> : <p>Aucun abonnement précédent.</p>}
      {view.renewalChild ? <><p>Renouvellement : <a href={`/admin/subscription/${view.renewalChild.id}`}>{view.renewalChild.reference}</a></p><a href={`/admin/onboarding/${view.renewalChild.id}`}>Préparer le nouvel abonnement</a></> : <p>Aucun renouvellement créé.</p>}
    </section>
    <section className="customers-panel"><h3>Historique des pauses</h3>{view.pauses.length === 0 ? <p>Aucune pause.</p> : <ol className="onboarding-items">{view.pauses.map(p => <li key={p.id}><strong>{format(p.startedAt)} — {p.endedAt ? format(p.endedAt) : "En cours"}</strong><p>{p.reason}</p><p>Fin initiale : {format(p.originalEndDate)} · Fin révisée : {format(p.revisedEndDate)}</p></li>)}</ol>}</section>
    <section className="customers-panel"><h3>Historique des décisions</h3>{view.history.length === 0 ? <p>Aucune décision enregistrée.</p> : <ol className="onboarding-items">{view.history.map(h => <li key={h.id}><time dateTime={h.changedAt}>{format(h.changedAt)}</time><p>{h.fromStatus ? `${states[h.fromStatus] ?? "Autre état"} → ` : "Création → "}<strong>{states[h.toStatus] ?? "Autre état"}</strong></p>{h.reason && <p>{h.reason}</p>}</li>)}</ol>}</section>
  </div>;
}
export function AdminSubscriptionPage({ initialSubscriptionId = "" }: { initialSubscriptionId?: string }) {
  const [input, setInput] = useState(initialSubscriptionId), [selected, setSelected] = useState(initialSubscriptionId), [error, setError] = useState(false);
  return <section aria-label="Cycle de vie des abonnements"><form className="customers-search customers-panel" onSubmit={event => { event.preventDefault(); const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.trim()); setError(!valid); if (valid) setSelected(input.trim()); }}>
    <label htmlFor="lifecycle-subscription-id">Identifiant de l’abonnement</label><div className="customers-search-controls"><input id="lifecycle-subscription-id" required maxLength={36} value={input} onChange={event => setInput(event.target.value)} /><button type="submit">Ouvrir l’abonnement</button></div>{error && <p className="error" role="alert">Saisis un identifiant d’abonnement valide.</p>}
  </form>{selected && <Panel key={selected} id={selected} />}</section>;
}
