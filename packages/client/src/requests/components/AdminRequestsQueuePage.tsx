import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminRequestAllowedTransitions,
  contactAttemptChannels,
  contactAttemptDirections,
  contactAttemptOutcomes,
  serviceRequestStatuses,
  type AdminServiceRequestSummary,
  type ContactAttemptChannel,
  type ContactAttemptDirection,
  type ContactAttemptOutcome,
  type ServiceRequestStatus,
} from "@kfit/shared";
import { adminRequestsApiClient } from "../api/admin-requests-api.js";
import { extractRequestErrorCode, translateRequestError } from "../lib/request-error-messages.js";

const queueQueryKey = (status: ServiceRequestStatus | "all") => ["requests", "admin-queue", status] as const;
const detailQueryKey = (requestId: string) => ["requests", "admin-detail", requestId] as const;

const statusLabels: Record<ServiceRequestStatus, string> = {
  submitted: "Soumise",
  contacting: "En contact",
  qualification_in_progress: "Qualification en cours",
  qualified: "Qualifiée",
  qualified_with_conditions: "Qualifiée avec conditions",
  waitlisted: "Liste d'attente",
  rejected: "Rejetée",
  abandoned: "Abandonnée",
  converted: "Convertie",
  closed_duplicate: "Doublon clôturé",
};

const channelLabels: Record<ContactAttemptChannel, string> = {
  whatsapp: "WhatsApp",
  phone_call: "Appel téléphonique",
  sms: "SMS",
  email: "E-mail",
  other: "Autre",
};

const directionLabels: Record<ContactAttemptDirection, string> = {
  outbound: "Sortant",
  inbound: "Entrant",
};

const outcomeLabels: Record<ContactAttemptOutcome, string> = {
  reached: "Contact joint",
  no_answer: "Pas de réponse",
  invalid_contact: "Coordonnées invalides",
  callback_requested: "Rappel demandé",
  not_interested: "Pas intéressé",
  other: "Autre",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

function ContactAttemptForm({ requestId, onLogged }: { requestId: string; onLogged(): void }) {
  const [channel, setChannel] = useState<ContactAttemptChannel>("whatsapp");
  const [direction, setDirection] = useState<ContactAttemptDirection>("outbound");
  const [outcome, setOutcome] = useState<ContactAttemptOutcome>("reached");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const logAttempt = useMutation({
    mutationFn: () => adminRequestsApiClient.logContactAttempt(requestId, { channel, direction, outcome, note: note || undefined }),
  });

  return (
    <form
      className="contact-attempt-form"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        logAttempt.mutate(undefined, {
          onSuccess: () => {
            setNote("");
            onLogged();
          },
          onError: (mutationError) => setError(translateRequestError(extractRequestErrorCode(mutationError))),
        });
      }}
    >
      <label>
        Canal
        <select value={channel} onChange={(event) => setChannel(event.target.value as ContactAttemptChannel)} disabled={logAttempt.isPending}>
          {contactAttemptChannels.map((value) => (
            <option key={value} value={value}>{channelLabels[value]}</option>
          ))}
        </select>
      </label>

      <label>
        Sens
        <select value={direction} onChange={(event) => setDirection(event.target.value as ContactAttemptDirection)} disabled={logAttempt.isPending}>
          {contactAttemptDirections.map((value) => (
            <option key={value} value={value}>{directionLabels[value]}</option>
          ))}
        </select>
      </label>

      <label>
        Résultat
        <select value={outcome} onChange={(event) => setOutcome(event.target.value as ContactAttemptOutcome)} disabled={logAttempt.isPending}>
          {contactAttemptOutcomes.map((value) => (
            <option key={value} value={value}>{outcomeLabels[value]}</option>
          ))}
        </select>
      </label>

      <label>
        Note (optionnelle)
        <textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={logAttempt.isPending} rows={2} />
      </label>

      {error ? <p className="error">{error}</p> : null}

      <button type="submit" disabled={logAttempt.isPending}>
        {logAttempt.isPending ? "Enregistrement..." : "Enregistrer le contact"}
      </button>
    </form>
  );
}

function RequestDetailPanel({ requestId }: { requestId: string }) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: detailQueryKey(requestId),
    queryFn: () => adminRequestsApiClient.getDetail(requestId),
  });

  const [transitionError, setTransitionError] = useState<string | null>(null);

  const transition = useMutation({
    mutationFn: (toStatus: ServiceRequestStatus) => adminRequestsApiClient.transitionStatus(requestId, toStatus),
    onSuccess: async () => {
      setTransitionError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailQueryKey(requestId) }),
        queryClient.invalidateQueries({ queryKey: ["requests", "admin-queue"] }),
      ]);
    },
    onError: (error) => setTransitionError(translateRequestError(extractRequestErrorCode(error))),
  });

  async function refreshAfterContactAttempt() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: detailQueryKey(requestId) }),
      queryClient.invalidateQueries({ queryKey: ["requests", "admin-queue"] }),
    ]);
  }

  if (detail.isLoading) return <p className="catalogue-state">Chargement de la demande...</p>;
  if (detail.isError || !detail.data) return <p className="catalogue-state catalogue-state--error">Impossible de charger cette demande.</p>;

  const request = detail.data.request;
  const allowedTargets = adminRequestAllowedTransitions[request.status] ?? [];

  return (
    <div className="admin-request-detail">
      <div className="admin-request-detail__heading">
        <div>
          <p className="eyebrow">Demande {request.reference}</p>
          <h3>{request.prospect.fullName}</h3>
          <p className="muted">{request.prospect.whatsapp}{request.prospect.email ? ` · ${request.prospect.email}` : ""}</p>
        </div>
        <span className={`request-status request-status--${request.status}`}>{statusLabels[request.status]}</span>
      </div>

      <dl className="admin-request-detail__meta">
        <div><dt>Service</dt><dd>{request.service.name}{request.requestedVariant ? ` — ${request.requestedVariant.name}` : ""}</dd></div>
        <div><dt>Soumise le</dt><dd>{formatDate(request.submittedAt)}</dd></div>
        {request.objective ? <div><dt>Objectif</dt><dd>{request.objective}</dd></div> : null}
        {request.message ? <div><dt>Message</dt><dd>{request.message}</dd></div> : null}
      </dl>

      <div className="admin-request-detail__actions">
        <p className="eyebrow">Changer le statut</p>
        <div className="admin-request-detail__transitions">
          {allowedTargets.length === 0 ? <p className="muted">Aucune transition disponible depuis cet état dans cette version.</p> : null}
          {allowedTargets.map((target) => (
            <button
              key={target}
              type="button"
              disabled={transition.isPending}
              onClick={() => transition.mutate(target)}
            >
              {statusLabels[target]}
            </button>
          ))}
        </div>
        {transitionError ? <p className="error">{transitionError}</p> : null}
      </div>

      <div className="admin-request-detail__contact">
        <p className="eyebrow">Historique des contacts</p>
        {request.contactAttempts.length === 0 ? <p className="muted">Aucun contact enregistré pour l'instant.</p> : null}
        <ul className="contact-attempt-list">
          {request.contactAttempts.map((attempt) => (
            <li key={attempt.id}>
              <span className="contact-attempt-list__meta">
                {formatDate(attempt.occurredAt)} · {channelLabels[attempt.channel]} · {directionLabels[attempt.direction]} · {outcomeLabels[attempt.outcome]}
              </span>
              {attempt.note ? <p>{attempt.note}</p> : null}
            </li>
          ))}
        </ul>

        <ContactAttemptForm requestId={requestId} onLogged={() => void refreshAfterContactAttempt()} />
      </div>
    </div>
  );
}

export function AdminRequestsQueuePage() {
  const [statusFilter, setStatusFilter] = useState<ServiceRequestStatus | "all">("all");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const queue = useQuery({
    queryKey: queueQueryKey(statusFilter),
    queryFn: () => adminRequestsApiClient.listQueue(statusFilter === "all" ? undefined : statusFilter),
  });

  return (
    <section className="admin-requests-panel">
      <div className="section-heading">
        <p className="eyebrow">Demandes K'FIT</p>
        <h2>File des demandes et contacts</h2>
        <p className="muted">Suis les demandes reçues, enregistre les tentatives de contact et fais progresser leur statut.</p>
      </div>

      <label className="admin-requests-filter">
        Filtrer par statut
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ServiceRequestStatus | "all")}>
          <option value="all">Tous les statuts</option>
          {serviceRequestStatuses.map((status) => (
            <option key={status} value={status}>{statusLabels[status]}</option>
          ))}
        </select>
      </label>

      {queue.isLoading ? <p className="catalogue-state">Chargement de la file...</p> : null}
      {queue.isError ? (
        <div className="catalogue-state catalogue-state--error">
          <p>Impossible de charger la file des demandes.</p>
          <button type="button" onClick={() => void queue.refetch()}>Réessayer</button>
        </div>
      ) : null}
      {queue.data?.requests.length === 0 ? <p className="catalogue-state">Aucune demande pour ce filtre.</p> : null}

      <div className="admin-requests-layout">
        {queue.data?.requests.length ? (
          <ul className="admin-requests-queue">
            {queue.data.requests.map((request: AdminServiceRequestSummary) => (
              <li key={request.id}>
                <button
                  type="button"
                  className={`admin-requests-queue__row${selectedRequestId === request.id ? " admin-requests-queue__row--active" : ""}`}
                  onClick={() => setSelectedRequestId(request.id)}
                >
                  <span className="admin-requests-queue__prospect">{request.prospect.fullName}</span>
                  <span className="muted">{request.service.name}</span>
                  <span className={`request-status request-status--${request.status}`}>{statusLabels[request.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {selectedRequestId ? <RequestDetailPanel requestId={selectedRequestId} /> : <p className="catalogue-state">Sélectionne une demande pour voir le détail.</p>}
      </div>
    </section>
  );
}
