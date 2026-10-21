import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OnboardingOwner, OnboardingResponse } from "@kfit/shared";
import { onboardingApi, onboardingErrorMessage } from "../api/onboarding-api.js";
import { AdminConsentPanel } from "../../consents/components/AdminConsentPanel.js";
import { AdminQuestionnairePanel } from "../../questionnaires/components/AdminQuestionnairePanel.js";

const owners: Record<OnboardingOwner, string> = { system: "Automatique", coach: "Coach", consent: "Acceptation des conditions", questionnaire: "Questionnaire", medical: "Validation médicale", external: "Parcours dédié" };
const statuses: Record<string, string> = { pending: "À compléter", blocked: "Bloquant", completed: "Complété", waived: "Dispensé", not_applicable: "Non applicable" };
const lifecycle: Record<string, string> = { onboarding: "En préparation", ready_to_start: "Prêt à démarrer", active: "Actif", cancelled: "Annulé", completed: "Terminé", awaiting_payment: "En attente de paiement", medical_clearance_required: "Validation médicale requise" };
function date(value: string | null) { return value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "Non définie"; }

function OnboardingPanel({ subscriptionId }: { subscriptionId: string }) {
  const client = useQueryClient(); const key = ["onboarding", subscriptionId] as const;
  const query = useQuery({ queryKey: key, queryFn: () => onboardingApi.get(subscriptionId), refetchInterval: 30_000 });
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [until, setUntil] = useState(""); const [waiverItem, setWaiverItem] = useState<string | null>(null); const [reason, setReason] = useState("");
  const inFlight = useRef(false);
  const mutation = useMutation({ mutationFn: (operation: () => Promise<OnboardingResponse>) => operation() });
  async function change(operation: () => Promise<OnboardingResponse>, message: string) {
    if (inFlight.current) return false; inFlight.current = true; setError(null); setNotice(null);
    try {
      const response = await mutation.mutateAsync(operation); client.setQueryData(key, response); setNotice(message); return true;
    } catch (failure) { setError(onboardingErrorMessage(failure)); await query.refetch(); return false; }
    finally { inFlight.current = false; }
  }
  if (query.isPending) return <p role="status">Chargement de l’onboarding…</p>;
  if (query.isError || !query.data) return <div role="alert"><p className="error">{onboardingErrorMessage(query.error)}</p><button type="button" onClick={() => void query.refetch()}>Réessayer</button></div>;
  const view = query.data.onboarding; const pending = mutation.isPending;
  const state = view.onboardingState === "ready" ? "Exigences satisfaites" : view.onboardingState === "stalled" ? "Réservation expirée — reprise nécessaire" : "Préparation bloquée";
  const editable = view.subscription.status === "onboarding";
  return <div className="onboarding-grid">
    <section className="customers-panel">
      <h2>Abonnement {view.subscription.reference}</h2>
      <p>{view.service.name}{view.service.variantName ? ` — ${view.service.variantName}` : ""}</p>
      <p>{lifecycle[view.subscription.status] ?? "Autre état"}</p>
      <p className={view.onboardingState === "stalled" ? "error" : "status"} role="status">{state}</p>
      <p>Début prévu : {date(view.subscription.plannedStartDate)}</p>
      {view.onboardingState === "stalled" && <p className="muted">L’abonnement conserve son état. Prolonge ou reconfirme la réservation pour reprendre la préparation.</p>}
      <button type="button" disabled={pending} onClick={() => void query.refetch()}>Actualiser</button>
      {error && <p className="error" role="alert">{error}</p>}{notice && <p className="status" role="status">{notice}</p>}
    </section>
    <section className="customers-panel">
      <h3>Checklist de préparation</h3>
      {!view.initialized && <><p className="muted">Prépare la checklist pour afficher les exigences applicables à cet abonnement.</p>
        {editable && <button type="button" disabled={pending} onClick={() => void change(() => onboardingApi.initialize(subscriptionId), "Checklist préparée.")}>Préparer la checklist</button>}</>}
      <ul className="onboarding-items">{view.items.map(item => <li key={item.id}>
        <strong>{item.label}</strong><p>{statuses[item.status] ?? "À vérifier"} · {owners[item.owner]}{item.isBlocking ? " · Exigence bloquante" : ""}</p>
        {item.waiverReason && <p>Motif de dispense : {item.waiverReason}</p>}
        <div className="onboarding-actions">
          {item.canComplete && <button type="button" disabled={pending} onClick={() => void change(() => onboardingApi.complete(subscriptionId, item.id), "Exigence complétée.")}>Confirmer</button>}
          {item.canWaive && <button type="button" disabled={pending} onClick={() => { setWaiverItem(item.id); setReason(""); }}>Accorder une dispense</button>}
        </div>
        {waiverItem === item.id && item.canWaive && <form className="qualification-review-form" onSubmit={event => { event.preventDefault(); void change(() => onboardingApi.waive(subscriptionId, item.id, reason), "Dispense enregistrée.").then(ok => { if (ok) { setWaiverItem(null); setReason(""); } }); }}>
          <label>Motif obligatoire<textarea required maxLength={2000} rows={3} value={reason} disabled={pending} onChange={event => setReason(event.target.value)} /></label>
          <div className="onboarding-actions"><button type="submit" disabled={pending || !reason.trim()}>Confirmer la dispense</button><button type="button" disabled={pending} onClick={() => setWaiverItem(null)}>Annuler</button></div>
        </form>}
      </li>)}</ul>
    </section>
    <section className="customers-panel">
      <h3>Réservation de capacité</h3>
      {view.capacity.mode === "unlimited" ? <p>Aucune réservation nécessaire pour ce service à capacité illimitée.</p> : <>
        <p>Échéance actuelle : {date(view.subscription.capacityReservedUntil)}</p>
        <p>Autres abonnements occupant une place : {view.capacity.occupied} / {view.capacity.limit} ({view.capacity.scope === "variant" ? "option" : "service"})</p>
        {["onboarding", "ready_to_start"].includes(view.subscription.status) && <form className="qualification-review-form" onSubmit={event => { event.preventDefault(); const deadline = new Date(until); if (!Number.isFinite(deadline.getTime())) { setError("Choisis une échéance valide."); return; } void change(() => onboardingApi.reserve(subscriptionId, deadline.toISOString()), "Réservation enregistrée."); }}>
          <label>Nouvelle échéance de réservation<input type="datetime-local" required value={until} disabled={pending} onChange={event => setUntil(event.target.value)} /></label>
          <button type="submit" disabled={pending}>{view.subscription.capacityReservedUntil ? "Prolonger ou reconfirmer" : "Réserver la place"}</button>
        </form>}
      </>}
    </section>
    <AdminConsentPanel subscriptionId={subscriptionId} editable={editable} />
    <AdminQuestionnairePanel subscriptionId={subscriptionId} editable={editable} />
    <section className="customers-panel"><h3>Prêt à démarrer</h3>
      <p className="muted">Toutes les exigences bloquantes et la capacité doivent être validées avant ce changement d’état.</p>
      <button type="button" disabled={pending || !view.canReady} onClick={() => void change(() => onboardingApi.ready(subscriptionId), "Abonnement prêt à démarrer.")}>Confirmer « Prêt à démarrer »</button>
    </section>
  </div>;
}

export function AdminOnboardingPage({ initialSubscriptionId = "" }: { initialSubscriptionId?: string }) {
  const [input, setInput] = useState(initialSubscriptionId); const [selected, setSelected] = useState(initialSubscriptionId); const [error, setError] = useState(false);
  return <section aria-label="Onboarding des abonnements">
    <form className="customers-search customers-panel" onSubmit={event => { event.preventDefault(); const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.trim()); setError(!valid); if (valid) setSelected(input.trim()); }}>
      <label htmlFor="onboarding-subscription-id">Identifiant de l’abonnement</label><div className="customers-search-controls"><input id="onboarding-subscription-id" required maxLength={36} value={input} onChange={event => setInput(event.target.value)} /><button type="submit">Ouvrir l’onboarding</button></div>
      {error && <p className="error" role="alert">Saisis un identifiant d’abonnement valide.</p>}
    </form>
    {selected && <OnboardingPanel key={selected} subscriptionId={selected} />}
  </section>;
}
