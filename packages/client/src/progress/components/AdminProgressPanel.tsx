import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { goalMetricKeys, goalOutcomes, progressMetrics, type CoachingGoal, type CreateGoalInput, type CreateMeasurementInput, type GoalAction,
  type GoalMetricKey, type GoalOutcome, type GoalStatus, type ProgressMetric } from "@kfit/shared";
import { progressApi, progressErrorMessage } from "../api/progress-api.js";

const labels: Record<ProgressMetric, string> = { weightKg: "Poids (kg)", waistCm: "Tour de taille (cm)", hipsCm: "Tour de hanches (cm)", chestCm: "Tour de poitrine (cm)", bodyFatEstimate: "Masse grasse estimée (%)" };
const mapping: Record<GoalMetricKey, ProgressMetric> = { weight_kg: "weightKg", waist_cm: "waistCm", hips_cm: "hipsCm", chest_cm: "chestCm", body_fat_estimate: "bodyFatEstimate" };
const units: Record<GoalMetricKey, string> = { weight_kg: "kg", waist_cm: "cm", hips_cm: "cm", chest_cm: "cm", body_fat_estimate: "%" };
const statuses: Record<GoalStatus, string> = { active: "Actif", paused: "En pause", achieved: "Atteint", partially_achieved: "Partiellement atteint", not_achieved: "Non atteint", cancelled: "Annulé" };
const actions: Record<GoalAction, string> = { pause: "Mettre l’objectif en pause", resume: "Reprendre l’objectif", cancel: "Annuler l’objectif", "confirm-outcome": "Confirmer le résultat" };
const events: Record<string, string> = { "goal.created": "Objectif créé", "goal.paused": "Objectif mis en pause", "goal.resumed": "Objectif repris", "goal.cancelled": "Objectif annulé", "goal.outcome_confirmed": "Résultat confirmé par le coach" };
const date = (value: string | null) => value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "Non définie";
const number = (value: number | null) => value === null ? "—" : value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
function iso(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value || !Number.isFinite(new Date(value).getTime())) throw new Error("Date invalide");
  return new Date(value).toISOString();
}
export function AdminProgressPanel({ subscriptionId }: { subscriptionId: string }) {
  const client = useQueryClient(), progressKey = ["progress", subscriptionId] as const, goalsKey = ["goals", subscriptionId] as const;
  const measurements = useQuery({ queryKey: progressKey, queryFn: () => progressApi.progress(subscriptionId), refetchInterval: 30000 });
  const goals = useQuery({ queryKey: goalsKey, queryFn: () => progressApi.goals(subscriptionId), refetchInterval: 30000 });
  const [busy, setBusy] = useState(false), inFlight = useRef(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [metric, setMetric] = useState<GoalMetricKey | "">(""), [decision, setDecision] = useState<{ id: string; action: GoalAction } | null>(null);
  const [outcome, setOutcome] = useState<GoalOutcome>("achieved"), [reason, setReason] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null), decisionOpener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!decision) return;
    dialogRef.current?.querySelector<HTMLSelectElement | HTMLTextAreaElement>("select, textarea")?.focus();
    return () => { if (decisionOpener.current?.isConnected) decisionOpener.current.focus(); };
  }, [decision]);
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: progressKey }), client.invalidateQueries({ queryKey: goalsKey })]); };
  async function change(operation: () => Promise<unknown>, message: string) {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try { await operation(); await refresh(); setNotice(message); return true; }
    catch (failure) { setError(progressErrorMessage(failure)); await refresh(); return false; }
    finally { inFlight.current = false; setBusy(false); }
  }
  function addMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
    let input: CreateMeasurementInput;
    try { input = { measuredAt: iso(data.get("measuredAt")), feelingNote: String(data.get("feelingNote") ?? "").trim() || null }; }
    catch { setError("Choisis une date de mesure valide."); return; }
    for (const key of progressMetrics) { const value = data.get(key); if (typeof value === "string" && value.trim()) input[key] = Number(value); }
    if (!progressMetrics.some(key => input[key] !== undefined)) { setError("Renseigne au moins une mesure."); return; }
    void change(() => progressApi.measure(subscriptionId, input), "Mesure enregistrée.").then(ok => { if (ok) form.reset(); });
  }
  function addGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
    const input: CreateGoalInput = { category: String(data.get("category") ?? "").trim(), label: String(data.get("label") ?? "").trim(), metricKey: metric || null };
    if (metric) { input.baselineValue = Number(data.get("baselineValue")); input.targetValue = Number(data.get("targetValue")); input.unit = units[metric]; }
    try { if (data.get("targetDate")) input.targetDate = iso(data.get("targetDate")); }
    catch { setError("Choisis une échéance valide."); return; }
    void change(() => progressApi.createGoal(subscriptionId, input), "Objectif créé.").then(ok => { if (ok) { form.reset(); setMetric(""); } });
  }
  if (measurements.isPending || goals.isPending) return <section className="customers-panel"><h3>Progression</h3><p role="status">Chargement de la progression…</p></section>;
  if (!measurements.data || !goals.data || measurements.isError || goals.isError) return <section className="customers-panel"><h3>Progression</h3><p role="alert" className="error">{progressErrorMessage(measurements.error ?? goals.error)}</p><button type="button" onClick={() => void refresh()}>Réessayer</button></section>;
  const view = measurements.data.progress, goalView = goals.data.goals;
  const selected: CoachingGoal | undefined = goalView.goals.find(goal => goal.id === decision?.id && goal.availableCommands.includes(decision.action));
  const needsReason = decision?.action === "cancel" || decision?.action === "confirm-outcome" && outcome !== selected?.suggestedStatus;
  return <section className="customers-panel progress-panel" id="progression"><h3>Progression</h3>
    <button type="button" disabled={busy || measurements.isFetching || goals.isFetching} onClick={() => void refresh()}>Actualiser la progression</button>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="status" role="status">{notice}</p>}
    <h4>Mesures</h4><p className="muted">Les mesures enregistrées sont conservées dans l’historique. Dates affichées dans le fuseau {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
    <div className="progress-metrics">{progressMetrics.map(key => { const summary = view.metrics[key]; return <dl key={key}><dt>{labels[key]}</dt><dd><strong>{number(summary.latest?.value ?? null)}</strong></dd>
      <dd>Dernière mesure : {date(summary.latest?.measuredAt ?? null)}</dd><dd>Précédente : {number(summary.previous?.value ?? null)} · {date(summary.previous?.measuredAt ?? null)}</dd>
      <dd>Écart : {summary.delta === null ? "—" : `${summary.delta > 0 ? "+" : ""}${number(summary.delta)}`}</dd></dl>; })}</div>
    {view.canRecord ? <details><summary>Ajouter une mesure</summary><form className="qualification-review-form" onSubmit={addMeasurement}><fieldset disabled={busy}><legend>Nouvelle mesure</legend>
      <label>Date de la mesure<input name="measuredAt" type="datetime-local" required /></label>
      <div className="progress-form-grid">{progressMetrics.map(key => <label key={key}>{labels[key]}<input name={key} type="number" min="0.01" step="0.01" max={key === "bodyFatEstimate" ? 100 : 1000} /></label>)}</div>
      <label>Ressenti (facultatif)<textarea name="feelingNote" rows={2} maxLength={4000} /></label><button type="submit">Enregistrer la mesure</button>
    </fieldset></form></details> : <p>Ajout de mesures indisponible : l’abonnement doit être actif ou en pause, avec le consentement actuel aux données de santé accordé. L’historique reste consultable.</p>}
    {view.measurements.length === 0 ? <p>Aucune mesure enregistrée.</p> : <div className="progress-table-wrap"><table className="progress-table"><caption>Historique chronologique des mesures</caption><thead><tr><th scope="col">Date</th>{progressMetrics.map(key => <th scope="col" key={key}>{labels[key]}</th>)}<th scope="col">Ressenti</th></tr></thead>
      <tbody>{view.measurements.map(row => <tr key={row.id}><th scope="row"><time dateTime={row.measuredAt}>{date(row.measuredAt)}</time>{row.id === view.latestMeasurement?.id && <span className="muted"> · Dernière</span>}</th>{progressMetrics.map(key => <td key={key}>{number(row[key])}</td>)}<td className="progress-private-text">{row.feelingNote ?? "—"}</td></tr>)}</tbody></table></div>}
    <h4>Objectifs</h4>
    {goalView.canCreate && <details><summary>Créer un objectif</summary><form className="qualification-review-form" onSubmit={addGoal}><fieldset disabled={busy}><legend>Nouvel objectif</legend>
      <label>Catégorie<input name="category" required maxLength={100} /></label><label>Intitulé<input name="label" required maxLength={500} /></label>
      <label>Mesure associée<select value={metric} onChange={event => setMetric(goalMetricKeys.find(key => key === event.target.value) ?? "")}><option value="">Objectif qualitatif, sans suggestion automatique</option>{goalMetricKeys.map(key => <option key={key} value={key}>{labels[mapping[key]]}</option>)}</select></label>
      {metric && <div className="progress-form-grid"><label>Valeur de départ ({units[metric]})<input name="baselineValue" type="number" min="0.01" step="0.01" max={metric === "body_fat_estimate" ? 100 : 1000} required /></label><label>Cible ({units[metric]})<input name="targetValue" type="number" min="0.01" step="0.01" max={metric === "body_fat_estimate" ? 100 : 1000} required /></label></div>}
      <label>Échéance future (facultative)<input name="targetDate" type="datetime-local" /></label><button type="submit">Créer l’objectif</button>
    </fieldset></form></details>}
    {goalView.goals.length === 0 ? <p>Aucun objectif enregistré.</p> : <ol className="onboarding-items">{goalView.goals.map(goal => <li key={goal.id}><p className="muted">{goal.category}</p><h5>{goal.label}</h5>
      <div className="progress-goal-states"><p><span>Statut actuel</span><strong>{statuses[goal.status]}</strong></p><p className="progress-suggestion"><span>Suggestion système · à confirmer</span><strong>{goal.suggestedStatus ? statuses[goal.suggestedStatus] : "Aucune suggestion"}</strong></p></div>
      {goal.baselineValue !== null && <p>Départ : {number(goal.baselineValue)} {goal.unit} · Cible : {number(goal.targetValue)} {goal.unit}</p>}
      {goal.metricKey && <p>Dernière valeur : {number(goal.latestMatchingMetric?.value ?? null)} {goal.unit} · {date(goal.latestMatchingMetric?.measuredAt ?? null)}</p>}
      <p>Échéance : {date(goal.targetDate)}</p>{goal.coachConfirmedAt && <p>Résultat confirmé le {date(goal.coachConfirmedAt)}</p>}
      <div className="onboarding-actions">{goal.availableCommands.map(action => <button key={action} type="button" disabled={busy} onClick={event => { decisionOpener.current = event.currentTarget; setDecision({ id: goal.id, action }); setReason(""); setOutcome(goal.suggestedStatus ?? "achieved"); }}>{actions[action]}</button>)}</div>
      <details><summary>Historique des décisions</summary><ol>{goal.events.map(event => <li key={event.id}><time dateTime={event.createdAt}>{date(event.createdAt)}</time> · {events[event.eventType] ?? "Décision enregistrée"}{event.toStatus && <p>Statut : {statuses[event.toStatus]}</p>}{event.eventType === "goal.outcome_confirmed" && <p>Suggestion au moment de la décision : {event.suggestedStatusSnapshot ? statuses[event.suggestedStatusSnapshot] : "Aucune suggestion"}</p>}{event.reason && <p className="progress-private-text">{event.reason}</p>}</li>)}</ol></details>
    </li>)}</ol>}
    {decision && selected && <div ref={dialogRef} role="dialog" aria-modal="false" aria-label={actions[decision.action]} className="progress-decision" onKeyDown={event => { if (event.key === "Escape" && !busy) { event.preventDefault(); setDecision(null); } }}><h4>{actions[decision.action]}</h4><p>{selected.label}</p>
      <form className="qualification-review-form" onSubmit={event => { event.preventDefault(); if (needsReason && !reason.trim()) return; void change(() => progressApi.command(selected.id, decision.action, decision.action === "confirm-outcome" ? { outcome, reason: reason.trim() || null } : { reason: reason.trim() || null }), "Décision enregistrée.").then(ok => { if (ok) setDecision(null); }); }}>
        {decision.action === "confirm-outcome" && <><p className="progress-suggestion"><strong>Suggestion actuelle : {selected.suggestedStatus ? statuses[selected.suggestedStatus] : "Aucune suggestion"}</strong></p>
          <label>Résultat confirmé par le coach<select value={outcome} disabled={busy} onChange={event => { const value = goalOutcomes.find(value => value === event.target.value); if (value) setOutcome(value); }}>{goalOutcomes.map(value => <option key={value} value={value}>{statuses[value]}</option>)}</select></label></>}
        <label>Motif{needsReason ? " obligatoire" : " (facultatif)"}<textarea required={needsReason} disabled={busy} rows={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <div className="onboarding-actions"><button type="submit" disabled={busy || needsReason && !reason.trim()}>Confirmer la décision</button><button type="button" disabled={busy} onClick={() => setDecision(null)}>Fermer</button></div>
      </form></div>}
  </section>;
}
