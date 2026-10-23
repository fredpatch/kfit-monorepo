import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, MapPin } from "lucide-react";
import type { AppointmentResponseAction } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
import { Textarea } from "../../components/ui/input.js";
import { PublicLoading, PublicNote, PublicShell, PublicTitle, PublicUnavailable, publicPrimaryClass } from "../../components/public/PublicShell.js";
import { longDayFr, timeFr } from "../../lib/format.js";
import { appointmentsApi, appointmentErrorMessage } from "../api/appointments-api.js";

/** Token in the URL hash (never sent to the server or in Referer); a new hash = a fresh page. */
export function PublicAppointmentPage() {
  const [link, setLink] = useState(() => ({ token: window.location.hash.slice(1), key: crypto.randomUUID() }));
  useEffect(() => {
    const changed = () => setLink({ token: window.location.hash.slice(1), key: crypto.randomUUID() });
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  return <Content key={link.key} token={link.token} queryId={link.key} />;
}

const outcomes: Record<AppointmentResponseAction, { title: string; text: string }> = {
  confirm: { title: "Rendez-vous confirmé", text: "Merci ! Ton coach a bien reçu ta confirmation." },
  request_reschedule: { title: "Demande de report envoyée", text: "Ton coach va te proposer un autre créneau." },
  decline: { title: "Absence signalée", text: "Ton coach a été prévenu que tu ne pourras pas venir." },
};

/** Appointment response (board 11d). One response per link; actions offered = server's availableActions. */
function Content({ token, queryId }: { token: string; queryId: string }) {
  const [submitted, setSubmitted] = useState<AppointmentResponseAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [note, setNote] = useState("");
  const inFlight = useRef(false);
  const query = useQuery({ queryKey: ["public-appointment", queryId], queryFn: () => appointmentsApi.publicGet(token), enabled: !!token && !submitted, retry: false, refetchOnWindowFocus: false });

  function send(action: AppointmentResponseAction) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    void appointmentsApi.publicSubmit(token, { action, ...(action === "request_reschedule" ? { rescheduleNote: note } : {}) })
      .then(() => { setConfirmDecline(false); setSubmitted(action); })
      .catch(async (failure) => { setError(appointmentErrorMessage(failure)); setConfirmDecline(false); await query.refetch(); })
      .finally(() => { inFlight.current = false; setBusy(false); });
  }

  if (!token) return <PublicUnavailable title="Lien incomplet" message="Ce lien est incomplet. Demande un nouveau lien à ton coach." tag="Rendez-vous" />;
  if (submitted) {
    return (
      <PublicShell tag="Rendez-vous" className="items-center justify-center gap-4 py-10 text-center">
        <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-[20px] bg-success-soft text-success"><Check className="size-8" /></span>
        <h1 className="text-2xl font-extrabold tracking-tight">{outcomes[submitted].title}</h1>
        <p role="status" className="text-[15px] leading-relaxed text-muted-foreground">{outcomes[submitted].text}</p>
        <p className="text-[13px] text-muted-foreground">Ce lien a été utilisé. Pour un autre changement, contacte ton coach.</p>
      </PublicShell>
    );
  }
  if (query.isPending) return <PublicLoading label="Chargement du rendez-vous…" tag="Rendez-vous" />;
  if (query.isError || !query.data) return <PublicUnavailable title="Rendez-vous indisponible" message={appointmentErrorMessage(query.error)} tag="Rendez-vous" />;

  const a = query.data.appointment;
  const actions = a.availableActions;
  const start = new Date(a.scheduledStart);
  const day = longDayFr(start);
  const [weekday = "", dayNumber = ""] = day.split(" ");

  return (
    <PublicShell tag="Rendez-vous">
      <PublicTitle>Ton rendez-vous</PublicTitle>

      <section className="flex flex-col gap-3.5 rounded-[22px] bg-brand-950 p-5 text-white">
        <span className="text-xs font-bold text-lime">{a.serviceLabel}</span>
        <div className="flex items-center gap-3.5">
          <div aria-hidden="true" className="flex size-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-white/10">
            <span className="text-xs font-bold uppercase text-sidebar-foreground">{weekday.slice(0, 3)}.</span>
            <span className="text-2xl font-extrabold leading-none">{dayNumber}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xl font-extrabold tabular-nums">{timeFr(a.scheduledStart)} – {timeFr(a.scheduledEnd)}</span>
            <span className="text-sm text-sidebar-foreground">{day.charAt(0).toUpperCase() + day.slice(1)} · heure de Libreville</span>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-white/10 pt-3 text-sm text-sidebar-foreground">
          <MapPin aria-hidden="true" className="size-4" />
          {a.locationOrChannel ?? "Lieu ou canal à confirmer avec ton coach"}
        </div>
      </section>

      {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}

      {actions.length === 0 ? (
        <p className="text-[15px] text-muted-foreground">Aucune réponse n'est possible pour ce rendez-vous. Contacte ton coach.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {actions.includes("confirm") ? (
            <Button className={publicPrimaryClass} disabled={busy} onClick={() => send("confirm")}>{busy && !rescheduleOpen ? "Enregistrement…" : "Je confirme"}</Button>
          ) : null}
          {actions.includes("request_reschedule") ? (
            <Button variant="secondary" aria-expanded={rescheduleOpen} className="h-[52px] rounded-[14px] border-warning/60 bg-warning-soft text-base font-bold text-warning hover:bg-warning-soft/80" disabled={busy} onClick={() => setRescheduleOpen((v) => !v)}>
              Demander un autre créneau
            </Button>
          ) : null}
        </div>
      )}

      {rescheduleOpen ? (
        <form className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4" onSubmit={(event) => { event.preventDefault(); send("request_reschedule"); }}>
          <label htmlFor="reschedule-note" className="text-sm font-semibold">Quand serais-tu disponible ? <span className="font-medium text-muted-foreground">(facultatif)</span></label>
          <Textarea id="reschedule-note" rows={3} maxLength={500} disabled={busy} value={note} onChange={(event) => setNote(event.target.value)} className="text-base" placeholder="Ex. jeudi matin, avant 10 h" />
          <span className="text-xs text-muted-foreground">Ton coach te proposera un nouveau créneau.</span>
          <Button type="submit" className="h-12 rounded-xl bg-warning text-white hover:bg-warning/90" disabled={busy}>{busy ? "Envoi…" : "Envoyer ma demande de report"}</Button>
        </form>
      ) : null}

      {actions.includes("decline") ? (
        <Button variant="ghost" className="h-11 text-danger hover:bg-danger-soft" disabled={busy} onClick={() => setConfirmDecline(true)}>Je ne pourrai pas venir</Button>
      ) : null}

      <PublicNote>Une annulation tardive peut être décomptée de ton offre, selon ses conditions. Lien personnel : une seule réponse possible.</PublicNote>

      <Dialog open={confirmDecline} onOpenChange={(open) => { if (!open && !busy) setConfirmDecline(false); }}>
        {confirmDecline ? (
          <DialogContent title="Tu ne pourras pas venir ?" description="Ton coach sera prévenu. Cette réponse ne pourra plus être modifiée avec ce lien.">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={busy} onClick={() => setConfirmDecline(false)}>Retour</Button>
              <Button variant="destructive-solid" disabled={busy} onClick={() => send("decline")}>{busy ? "Envoi…" : "Oui, je ne viendrai pas"}</Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </PublicShell>
  );
}
