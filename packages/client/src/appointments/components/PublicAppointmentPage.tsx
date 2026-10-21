import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AppointmentResponseAction } from "@kfit/shared";
import { appointmentsApi, appointmentErrorMessage } from "../api/appointments-api.js";
export function PublicAppointmentPage() {
  const [link, setLink] = useState(() => ({ token: window.location.hash.slice(1), key: crypto.randomUUID() }));
  useEffect(() => { const changed = () => setLink({ token: window.location.hash.slice(1), key: crypto.randomUUID() }); window.addEventListener("hashchange", changed); return () => window.removeEventListener("hashchange", changed); }, []);
  return <Content key={link.key} token={link.token} queryId={link.key} />;
}
function Content({ token, queryId }: { token: string; queryId: string }) {
  const [submitted, setSubmitted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [action, setAction] = useState<AppointmentResponseAction | "">(""), [note, setNote] = useState(""), inFlight = useRef(false);
  const query = useQuery({ queryKey: ["public-appointment", queryId], queryFn: () => appointmentsApi.publicGet(token), enabled: !!token && !submitted, retry: false, refetchOnWindowFocus: false });
  const format = (value: string) => new Date(value).toLocaleString("fr-FR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  return <main className="consent-shell"><section className="customers-panel"><p className="eyebrow">K’FIT</p><h1>Votre rendez-vous</h1>
    {!token ? <p className="error" role="alert">Ce lien est incomplet. Demande un nouveau lien au coach.</p> : submitted ? <div role="status"><h2>Réponse enregistrée</h2><p>Ton choix a été transmis au coach. Ce lien a été utilisé ; contacte le coach pour toute nouvelle modification.</p></div> : query.isPending ? <p role="status">Chargement du rendez-vous…</p> : query.isError || !query.data ? <p className="error" role="alert">{appointmentErrorMessage(query.error)}</p> : <>
      <h2>{query.data.appointment.serviceLabel}</h2><p>{format(query.data.appointment.scheduledStart)} — {format(query.data.appointment.scheduledEnd)}</p><p>{query.data.appointment.locationOrChannel ?? "Lieu ou canal à confirmer avec le coach"}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {query.data.appointment.availableActions.length === 0 ? <p>Aucune réponse n’est disponible pour ce rendez-vous. Contacte le coach.</p> : <form className="qualification-review-form" onSubmit={event => { event.preventDefault(); if (!action || inFlight.current) return; inFlight.current = true; setBusy(true); setError(null); void appointmentsApi.publicSubmit(token, { action, ...(action === "request_reschedule" ? { rescheduleNote: note } : {}) }).then(() => setSubmitted(true)).catch(async failure => { setError(appointmentErrorMessage(failure)); await query.refetch(); }).finally(() => { inFlight.current = false; setBusy(false); }); }}>
        <fieldset disabled={busy}><legend>Ta réponse</legend>{query.data.appointment.availableActions.map(value => <label key={value}><input type="radio" name="appointment-response" required value={value} checked={action === value} onChange={() => setAction(value)} /> {value === "confirm" ? "Confirmer" : value === "decline" ? "Décliner" : "Demander un report"}</label>)}</fieldset>
        {action === "request_reschedule" && <label>Message au coach (facultatif)<textarea rows={3} maxLength={500} disabled={busy} value={note} onChange={event => setNote(event.target.value)} /></label>}
        <button type="submit" disabled={busy || !action}>{busy ? "Enregistrement…" : "Envoyer ma réponse"}</button>
      </form>}
    </>}
  </section></main>;
}
