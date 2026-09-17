import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { CataloguePublicService, RequestSubmissionRecord } from "@kfit/shared";
import { requestsApiClient } from "../api/requests-api.js";
import { classifyRequestError, extractRequestErrorCode, translateRequestError } from "../lib/request-error-messages.js";

function newSubmissionToken(): string {
  return crypto.randomUUID();
}

export function PublicRequestForm({ service }: { service: CataloguePublicService }) {
  const [expanded, setExpanded] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [formRenderedAt, setFormRenderedAt] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [requestedVariantId, setRequestedVariantId] = useState("");
  const [website, setWebsite] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [successRecord, setSuccessRecord] = useState<RequestSubmissionRecord | null>(null);

  const submission = useMutation({
    mutationFn: requestsApiClient.submit,
  });

  const hasVariants = service.variants.length > 0;

  function startIntent() {
    setExpanded(true);
    setToken(newSubmissionToken());
    setFormRenderedAt(new Date().toISOString());
    setValidationMessage(null);
    setSuccessRecord(null);
    submission.reset();
  }

  function endIntent() {
    setExpanded(false);
    setToken(null);
    setFormRenderedAt(null);
    setFullName("");
    setWhatsapp("");
    setRequestedVariantId("");
    setWebsite("");
    setValidationMessage(null);
    setSuccessRecord(null);
    submission.reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationMessage(null);

    const trimmedName = fullName.trim();
    const trimmedWhatsapp = whatsapp.trim();

    if (!trimmedName) {
      setValidationMessage("Indique ton nom complet.");
      return;
    }
    if (!trimmedWhatsapp) {
      setValidationMessage("Indique ton numéro WhatsApp.");
      return;
    }
    if (hasVariants && !requestedVariantId) {
      setValidationMessage("Choisis une option pour ce service.");
      return;
    }
    if (!token || !formRenderedAt) return;

    submission.mutate(
      {
        fullName: trimmedName,
        whatsapp: trimmedWhatsapp,
        serviceId: service.id,
        requestedVariantId: hasVariants ? requestedVariantId : undefined,
        submissionToken: token,
        website,
        formRenderedAt,
      },
      { onSuccess: (response) => setSuccessRecord(response.request) },
    );
  }

  if (service.availabilityStatus === "waitlist_only") {
    return (
      <div className="request-state request-state--waitlist">
        <p className="request-state__title">Liste d'attente uniquement</p>
        <p className="muted">Les nouvelles demandes directes sont suspendues pour cette offre.</p>
      </div>
    );
  }

  if (service.availabilityStatus !== "open") {
    return (
      <div className="request-state request-state--closed">
        <p className="muted">Nouvelles demandes temporairement fermées pour cette offre.</p>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button type="button" className="service-cta" onClick={startIntent}>
        Demander un accompagnement
      </button>
    );
  }

  if (successRecord) {
    return (
      <div className="request-state request-state--success" role="status" aria-live="polite">
        <p className="status">Merci ! Ta demande a été enregistrée.</p>
        <p>Référence : {successRecord.reference}</p>
        <p className="muted">Nous te recontacterons sur WhatsApp.</p>
        <button type="button" onClick={endIntent}>Fermer</button>
      </div>
    );
  }

  const errorCode = submission.isError ? extractRequestErrorCode(submission.error) : undefined;
  const errorKind = submission.isError ? classifyRequestError(errorCode) : null;
  const errorMessage = submission.isError ? translateRequestError(errorCode) : null;
  const pending = submission.isPending;

  function retrySubmission() {
    if (!token || !formRenderedAt) return;
    submission.mutate(
      {
        fullName: fullName.trim(),
        whatsapp: whatsapp.trim(),
        serviceId: service.id,
        requestedVariantId: hasVariants ? requestedVariantId : undefined,
        submissionToken: token,
        website,
        formRenderedAt,
      },
      { onSuccess: (response) => setSuccessRecord(response.request) },
    );
  }

  // Terminal errors mean the service/variant itself can't accept this request right
  // now; resubmitting identical data would fail identically, so we don't offer a
  // retry — only closing (which starts a fresh intent/token if reopened).
  if (errorKind === "terminal") {
    return (
      <div className="request-state request-state--error">
        <p className="error" role="alert">{errorMessage}</p>
        <button type="button" onClick={endIntent}>Fermer</button>
      </div>
    );
  }

  // Transient errors (rate limit, unexpected/network failure) are worth an
  // immediate identical retry using the same submission token.
  if (errorKind === "transient") {
    return (
      <div className="request-state request-state--error">
        <p className="error" role="alert">{errorMessage}</p>
        <div className="request-form__actions">
          <button type="button" onClick={retrySubmission}>Réessayer</button>
          <button type="button" onClick={endIntent}>Annuler</button>
        </div>
      </div>
    );
  }

  return (
    <form className="request-form" onSubmit={handleSubmit} noValidate>
      <label>
        Nom complet
        <input
          type="text"
          value={fullName}
          disabled={pending}
          autoComplete="name"
          onChange={(event) => setFullName(event.target.value)}
        />
      </label>

      <label>
        Numéro WhatsApp
        <input
          type="tel"
          inputMode="tel"
          value={whatsapp}
          disabled={pending}
          autoComplete="tel"
          onChange={(event) => setWhatsapp(event.target.value)}
        />
      </label>

      {hasVariants ? (
        <label>
          Option souhaitée
          <select
            value={requestedVariantId}
            disabled={pending}
            onChange={(event) => setRequestedVariantId(event.target.value)}
          >
            <option value="">Choisir une option</option>
            {service.variants.map((variant) => (
              <option key={variant.id} value={variant.id} disabled={variant.availabilityStatus !== "open"}>
                {variant.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div aria-hidden="true" className="request-honeypot">
        <label>
          Site web
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>
      </div>

      {validationMessage ? <p className="error" role="alert">{validationMessage}</p> : null}
      {/* errorKind === "correctable" here (e.g. REQUEST_INVALID_INPUT, incl. bot-signal
          rejections, which the server intentionally reports the same way): the user
          can edit fields and resubmit with the same token via the normal submit button. */}
      {errorMessage ? <p className="error" role="alert">{errorMessage}</p> : null}

      <div className="request-form__actions">
        <button type="submit" disabled={pending}>
          {pending ? "Envoi..." : "Envoyer la demande"}
        </button>
        <button type="button" onClick={endIntent} disabled={pending}>
          Annuler
        </button>
      </div>
    </form>
  );
}
