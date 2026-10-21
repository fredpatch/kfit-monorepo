import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppointmentAction, AppointmentDetail } from "@kfit/shared";
import { appointmentsApi, appointmentErrorMessage } from "../api/appointments-api.js";
const states: Record<string, string> = { scheduled: "Planifié", confirmed: "Confirmé", reschedule_requested: "Report demandé", rescheduled: "Reporté", completed: "Terminé", cancelled: "Annulé", missed: "Absent" };
const responses: Record<string, string> = { pending: "En attente", confirmed: "Confirmé", declined: "Décliné", reschedule_requested: "Report demandé" };
const labels: Record<AppointmentAction, string> = { confirm: "Confirmer", cancel: "Annuler", reschedule: "Reporter", complete: "Marquer terminé", missed: "Marquer absent", "restore-component": "Restaurer la séance", "response-link": "Générer le lien client" };
const format = (value: string) => new Date(value).toLocaleString("fr-FR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
const date = (value: string) => { const parsed = new Date(value); if (!value || !Number.isFinite(parsed.getTime())) throw new Error("invalid date"); return parsed.toISOString(); };
export function AdminAppointmentsPanel({ subscriptionId }: { subscriptionId: string }) {
  const client = useQueryClient(), key = ["appointments", subscriptionId] as const;
  const query = useQuery({ queryKey: key, queryFn: () => appointmentsApi.list(subscriptionId) });
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), inFlight = useRef(false);
  const [start, setStart] = useState(""), [end, setEnd] = useState(""), [componentId, setComponentId] = useState(""), [location, setLocation] = useState("");
  const [selected, setSelected] = useState<{ id: string; action: AppointmentAction } | null>(null), [reason, setReason] = useState(""), [override, setOverride] = useState(false), [expiry, setExpiry] = useState("");
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  async function change(operation: () => Promise<unknown>, message: string) {
    if (inFlight.current) return false; inFlight.current = true; setBusy(true); setError(null); setNotice(null); setLink(null);
    try { await operation(); await client.invalidateQueries({ queryKey: key }); await client.invalidateQueries({ queryKey: ["subscription-lifecycle", subscriptionId] }); await client.invalidateQueries({ queryKey: ["follow-ups", subscriptionId] }); await client.invalidateQueries({ queryKey: ["follow-up-queue"] }); setNotice(message); return true; }
    catch (failure) { setError(appointmentErrorMessage(failure)); await query.refetch(); return false; }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function submit(app: AppointmentDetail, action: AppointmentAction) {
    if (action === "reschedule") {
      let input; try { input = { scheduledStart: date(start), scheduledEnd: date(end), locationOrChannel: location.trim() || null }; } catch { setError("Choisis deux dates valides."); return; }
      if (await change(() => appointmentsApi.command(app.id, action, input), "Rendez-vous reporté. Le créneau initial est conservé.")) setSelected(null);
    } else if (action === "response-link") {
      let expiresAt; try { expiresAt = date(expiry); } catch { setError("Choisis une échéance valide."); return; }
      if (await change(async () => { const result = await appointmentsApi.link(app.id, expiresAt); setLink({ id: app.id, url: `${window.location.origin}/appointment#${result.token}` }); }, "Lien créé. Le lien précédent est révoqué.")) setSelected(null);
    } else {
      const input = action === "cancel" || action === "restore-component" ? { reason: reason.trim() } : action === "complete" ? { earlyCompletionOverride: override, ...(override ? { overrideReason: reason.trim() } : {}) } : {};
      if (await change(() => appointmentsApi.command(app.id, action, input), "Décision enregistrée.")) setSelected(null);
    }
  }
  return <section className="customers-panel appointment-panel"><h3>Rendez-vous</h3><p className="muted">Les dates sont affichées dans le fuseau de cet appareil : {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
    {query.isPending ? <p role="status">Chargement des rendez-vous…</p> : query.isError || !query.data ? <div role="alert"><p className="error">{appointmentErrorMessage(query.error)}</p><button type="button" onClick={() => void query.refetch()}>Réessayer</button></div> : <>
      <button type="button" disabled={busy || query.isFetching} onClick={() => void query.refetch()}>Actualiser les rendez-vous</button>
      {query.data.subscriptionStatus === "active" ? <details><summary>Planifier un rendez-vous</summary><form className="qualification-review-form" onSubmit={event => { event.preventDefault(); let input; try { input = { scheduledStart: date(start), scheduledEnd: date(end), componentId: componentId || null, locationOrChannel: location.trim() || null }; } catch { setError("Choisis deux dates valides."); return; } void change(() => appointmentsApi.schedule(subscriptionId, input), "Rendez-vous planifié.").then(ok => { if (ok) { setStart(""); setEnd(""); setLocation(""); } }); }}>
        <label>Début<input type="datetime-local" required disabled={busy} value={start} onChange={event => setStart(event.target.value)} /></label><label>Fin<input type="datetime-local" required disabled={busy} value={end} onChange={event => setEnd(event.target.value)} /></label>
        <label>Prestation<select value={componentId} disabled={busy} onChange={event => setComponentId(event.target.value)}><option value="">Sans prestation liée</option>{query.data.components.map(c => <option key={c.id} value={c.id} disabled={c.quantityConsumed >= c.quantityEntitled}>{c.labelSnapshot} — {Math.max(0, c.quantityEntitled - c.quantityConsumed)} restante(s)</option>)}</select></label>
        <label>Lieu ou canal<input maxLength={300} value={location} disabled={busy} onChange={event => setLocation(event.target.value)} /></label><button type="submit" disabled={busy}>Planifier</button>
      </form></details> : <p>La planification et le report nécessitent un abonnement actif. Les rendez-vous existants peuvent encore être consultés et finalisés.</p>}
      {error && <p className="error" role="alert">{error}</p>}{notice && <p className="status" role="status">{notice}</p>}
      {query.data.appointments.length === 0 ? <p>Aucun rendez-vous enregistré.</p> : <ol className="onboarding-items">{query.data.appointments.map(app => <li key={app.id} id={`appointment-${app.id}`}>
        <h4>{format(app.scheduledStart)} — {format(app.scheduledEnd)}</h4><p><strong>{states[app.status] ?? "État à vérifier"}</strong> · Réponse client : {responses[app.customerResponseStatus] ?? "À vérifier"}</p><p>{app.locationOrChannel ?? "Lieu ou canal non défini"}</p>
        <p>{app.component ? `${app.component.labelSnapshot} — ${app.component.quantityConsumed} / ${app.component.quantityEntitled} consommée(s)` : "Sans prestation liée"} · {app.restored ? "Séance restaurée" : app.consumed ? "Une séance consommée" : "Aucune séance consommée"}</p>
        <p className="muted">Préavis : {app.policy.lateCancelNoticeHours === null ? "sans pénalité de retard" : `${app.policy.lateCancelNoticeHours} h`} · Annulation client tardive : {app.policy.lateCancelConsumesComponent ? "séance consommée si préavis défini" : "sans consommation"} · Absence : {app.policy.missedConsumesComponent ? "séance consommée" : "sans consommation"}</p>
        {app.rescheduleNote && <p>Note du client : {app.rescheduleNote}</p>}
        {app.rescheduledFromAppointmentId && <p>Créneau précédent : <a href={`#appointment-${app.rescheduledFromAppointmentId}`}>Voir l’original</a></p>}{app.replacementAppointmentId && <p>Créneau de remplacement : <a href={`#appointment-${app.replacementAppointmentId}`}>Voir le remplacement</a></p>}
        <div className="onboarding-actions">{app.availableActions.map(action => <button type="button" key={action} disabled={busy} aria-pressed={selected?.id === app.id && selected.action === action} onClick={() => { setSelected({ id: app.id, action }); setReason(""); setOverride(false); setStart(""); setEnd(""); setExpiry(""); setLocation(app.locationOrChannel ?? ""); setError(null); setLink(null); }}>{labels[action]}</button>)}</div>
        {selected?.id === app.id && app.availableActions.includes(selected.action) && <form className="qualification-review-form" onSubmit={event => { event.preventDefault(); void submit(app, selected.action); }}><h4>{labels[selected.action]}</h4>
          {(selected.action === "cancel" || selected.action === "restore-component" || selected.action === "complete" && override) && <label>Motif obligatoire<textarea required maxLength={2000} rows={3} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>}
          {selected.action === "complete" && <label><input type="checkbox" checked={override} disabled={busy} onChange={event => setOverride(event.target.checked)} /> Autoriser explicitement une fin anticipée avec motif</label>}
          {selected.action === "reschedule" && <><label>Nouveau début<input type="datetime-local" required disabled={busy} value={start} onChange={event => setStart(event.target.value)} /></label><label>Nouvelle fin<input type="datetime-local" required disabled={busy} value={end} onChange={event => setEnd(event.target.value)} /></label><label>Lieu ou canal<input maxLength={300} disabled={busy} value={location} onChange={event => setLocation(event.target.value)} /></label><p>L’ancien créneau reste dans l’historique. Son lien client sera révoqué.</p></>}
          {selected.action === "response-link" && <label>Expiration du lien<input type="datetime-local" required disabled={busy} value={expiry} onChange={event => setExpiry(event.target.value)} /></label>}
          <div className="onboarding-actions"><button type="submit" disabled={busy || (selected.action === "cancel" || selected.action === "restore-component" || selected.action === "complete" && override) && !reason.trim()}>Confirmer</button><button type="button" disabled={busy} onClick={() => setSelected(null)}>Fermer</button></div>
        </form>}
        {link?.id === app.id && <div className="consent-link"><label>Lien client à transmettre<input readOnly aria-label="Lien de réponse du client" value={link.url} onFocus={event => event.target.select()} /></label><a href={link.url} target="_blank" rel="noopener noreferrer">Ouvrir le lien client</a></div>}
        {app.responseLinks.length > 0 && <details><summary>Liens de réponse</summary><ul>{app.responseLinks.map(l => <li key={l.id}>{l.state === "available" ? "Disponible" : l.state === "consumed" ? "Utilisé" : l.state === "expired" ? "Expiré" : "Révoqué"} · Expiration : {format(l.expiresAt)}</li>)}</ul></details>}
        <details><summary>Historique des décisions</summary><ol>{app.events.map(e => <li key={e.id}><time dateTime={e.createdAt}>{format(e.createdAt)}</time> · {e.actorType === "customer" ? "Client" : "Coach"} · {states[e.toStatus ?? ""] ?? "Décision enregistrée"}{e.reason && <p>{e.reason}</p>}</li>)}</ol></details>
      </li>)}</ol>}
    </>}
  </section>;
}
