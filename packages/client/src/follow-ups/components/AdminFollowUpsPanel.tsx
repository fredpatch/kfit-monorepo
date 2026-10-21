import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { followUpTypes, type FollowUpResponse, type FollowUpType } from "@kfit/shared";
import { followUpsApi, followUpErrorMessage } from "../api/follow-ups-api.js";
import { activityTypes, cadenceSources, cadenceStates, followUpDate, followUpStatuses, followUpTypeLabels } from "./follow-up-labels.js";
const iso = (value: string) => { const date = new Date(value); if (!value || !Number.isFinite(date.getTime())) throw new Error("invalid date"); return date.toISOString(); };
export function AdminFollowUpsPanel({ subscriptionId }: { subscriptionId: string }) {
  const client = useQueryClient(), key = ["follow-ups", subscriptionId] as const;
  const query = useQuery({ queryKey: key, queryFn: () => followUpsApi.list(subscriptionId), refetchInterval: 30000 });
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), inFlight = useRef(false);
  const [type, setType] = useState<FollowUpType>("check_in"), [occurred, setOccurred] = useState(""), [note, setNote] = useState(""), [hasAction, setHasAction] = useState(false), [action, setAction] = useState(""), [actionAt, setActionAt] = useState("");
  const [frequency, setFrequency] = useState(""), [cancelId, setCancelId] = useState<string | null>(null), [reason, setReason] = useState("");
  async function change(operation: () => Promise<FollowUpResponse>, message: string) {
    if (inFlight.current) return false; inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try { const result = await operation(); client.setQueryData(key, result); await client.invalidateQueries({ queryKey: ["follow-up-queue"] }); setNotice(message); return true; }
    catch (failure) { setError(followUpErrorMessage(failure)); await query.refetch(); return false; }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (query.isPending) return <section className="customers-panel follow-up-panel"><h3>Suivis</h3><p role="status">Chargement des suivis…</p></section>;
  if (query.isError || !query.data) return <section className="customers-panel follow-up-panel"><h3>Suivis</h3><p className="error" role="alert">{followUpErrorMessage(query.error)}</p><button type="button" onClick={() => void query.refetch()}>Réessayer</button></section>;
  const view = query.data.detail, cadence = view.cadence, editableCadence = view.subscriptionStatus === "active" || view.subscriptionStatus === "paused";
  return <section className="customers-panel follow-up-panel" id="follow-ups"><h3>Suivis</h3>
    <div className="onboarding-actions"><a href="/admin/follow-up-queue">Ouvrir la file des suivis</a><button type="button" disabled={busy || query.isFetching} onClick={() => void query.refetch()}>Actualiser les suivis</button></div>
    <p><strong>{cadence.monitoringDisabled ? "Cadence désactivée" : cadence.clockFrozen ? "Horloge de cadence suspendue" : cadence.cadenceState ? cadenceStates[cadence.cadenceState] : "Cadence non applicable dans cet état"}</strong></p>
    <p>Cadence effective : {cadence.effectiveCadenceDays === null ? "Non configurée" : `tous les ${cadence.effectiveCadenceDays} jours`} · {cadenceSources[cadence.cadenceSource]}</p>
    <p>Dernière activité significative : {followUpDate(cadence.latestMeaningfulActivityAt)}{cadence.latestActivityType ? ` · ${activityTypes[cadence.latestActivityType]}` : ""}</p>
    <p>Prochain suivi calculé : {followUpDate(cadence.nextFollowUpDueAt)}</p>
    {cadence.overdueByDays !== null && <p className="error">Retard en temps actif : {cadence.overdueByDays === 0 ? "moins d’un jour" : `${cadence.overdueByDays} jour(s)`}.</p>}
    {cadence.clockFrozen && <p className="muted">La pause ne consomme pas le délai de cadence. L’échéance affichée tient compte de la pause jusqu’au calcul actuel. Les prochaines actions conservent leurs propres échéances.</p>}
    <p className="muted">Calcul au {followUpDate(view.asOf)}. Les rendez-vous terminés et les suivis structurés alimentent cette cadence.</p>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="status" role="status">{notice}</p>}
    {editableCadence && <details><summary>Modifier la cadence</summary><form className="qualification-review-form" onSubmit={event => { event.preventDefault(); const days = Number(frequency); if (!Number.isInteger(days) || days <= 0) { setError("Saisis un nombre entier positif de jours."); return; } void change(() => followUpsApi.cadence(subscriptionId, days), "Cadence personnalisée enregistrée."); }}>
      <label>Cadence personnalisée, en jours<input type="number" min={1} step={1} max={2147483647} required disabled={busy} value={frequency} onChange={event => setFrequency(event.target.value)} /></label><p>Valeur actuelle : {view.frequencyDaysOverride ?? "aucune personnalisation"}. Une nouvelle cadence recalcule l’échéance à partir de l’activité existante.</p><button type="submit" disabled={busy}>Modifier la cadence</button>
      <button type="button" disabled={busy || view.frequencyDaysOverride === null} onClick={() => void change(() => followUpsApi.cadence(subscriptionId, null), "Cadence personnalisée réinitialisée ; les règles du service s’appliquent.")}>Réinitialiser la cadence personnalisée</button>
    </form></details>}
    {view.subscriptionStatus === "active" && <details><summary>Enregistrer un suivi</summary><form className="qualification-review-form" onSubmit={event => { event.preventDefault(); let occurredAt: string, nextActionAt: string | undefined; try { occurredAt = iso(occurred); if (hasAction) nextActionAt = iso(actionAt); } catch { setError("Choisis des dates valides."); return; }
      void change(() => followUpsApi.create(subscriptionId, { followUpType: type, occurredAt, ...(note.trim() ? { note: note.trim() } : {}), ...(hasAction && nextActionAt ? { nextAction: action.trim(), nextActionAt } : {}) }), "Suivi enregistré.").then(ok => { if (ok) { setOccurred(""); setNote(""); setAction(""); setActionAt(""); setHasAction(false); } }); }}>
      <label>Type de suivi<select value={type} disabled={busy} onChange={event => { const selected = followUpTypes.find(t => t === event.target.value); if (selected) setType(selected); }}>{followUpTypes.map(t => <option key={t} value={t}>{followUpTypeLabels[t]}</option>)}</select></label>
      <label>Date de l’interaction<input type="datetime-local" required disabled={busy} value={occurred} onChange={event => setOccurred(event.target.value)} /></label><label>Note (facultative)<textarea rows={3} maxLength={4000} disabled={busy} value={note} onChange={event => setNote(event.target.value)} /></label>
      <label className="follow-up-check"><input type="checkbox" checked={hasAction} disabled={busy} onChange={event => setHasAction(event.target.checked)} /> Prévoir une prochaine action</label>
      {hasAction && <><label>Prochaine action<textarea required rows={2} maxLength={2000} disabled={busy} value={action} onChange={event => setAction(event.target.value)} /></label><label>Date de la prochaine action<input type="datetime-local" required disabled={busy} value={actionAt} onChange={event => setActionAt(event.target.value)} /></label></>}
      <p className="muted">Sans prochaine action, le suivi est enregistré comme terminé à la date de l’interaction. Les dates utilisent le fuseau {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p><button type="submit" disabled={busy || hasAction && !action.trim()}>Enregistrer un suivi</button>
    </form></details>}
    <h4>Historique des suivis</h4>{view.followUps.length === 0 ? <p>Aucun suivi enregistré.</p> : <ol className="onboarding-items">{view.followUps.map(row => <li key={row.id}><strong>{followUpTypeLabels[row.followUpType]}</strong><p>{followUpDate(row.occurredAt)} · {followUpStatuses[row.effectiveStatus]}</p>
      {row.note && <p className="follow-up-text">{row.note}</p>}{row.nextAction && <p className="follow-up-text">Prochaine action : {row.nextAction}<br />Échéance : {followUpDate(row.nextActionAt)}</p>}
      {row.completedAt && <p>Terminé le {followUpDate(row.completedAt)}</p>}{row.cancelledAt && <p>Annulé le {followUpDate(row.cancelledAt)}</p>}
      {row.status === "open" && <div className="onboarding-actions"><button type="button" disabled={busy} onClick={() => void change(() => followUpsApi.complete(row.id), "Action de suivi terminée.")}>Terminer l’action</button><button type="button" disabled={busy} onClick={() => { setCancelId(row.id); setReason(""); }}>Annuler l’action</button></div>}
      {cancelId === row.id && row.status === "open" && <form className="qualification-review-form" onSubmit={event => { event.preventDefault(); void change(() => followUpsApi.cancel(row.id, reason.trim()), "Action de suivi annulée.").then(ok => { if (ok) setCancelId(null); }); }}><label>Motif d’annulation<textarea required rows={2} maxLength={2000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label><div className="onboarding-actions"><button type="submit" disabled={busy || !reason.trim()}>Confirmer l’annulation</button><button type="button" disabled={busy} onClick={() => setCancelId(null)}>Fermer</button></div></form>}
      <details><summary>Décisions enregistrées</summary><ol>{row.events.map(e => <li key={e.id}>{followUpDate(e.createdAt)} · {e.eventType === "follow_up.recorded" ? "Suivi enregistré" : e.eventType === "follow_up.completed" ? "Action terminée" : "Action annulée"}{e.reason && <p className="follow-up-text">{e.reason}</p>}</li>)}</ol></details>
    </li>)}</ol>}
  </section>;
}
