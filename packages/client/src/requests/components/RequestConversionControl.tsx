import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminServiceRequestDetail, RequestConversionResponse } from "@kfit/shared";
import { adminRequestsApiClient } from "../api/admin-requests-api.js";
import { extractRequestErrorCode, translateRequestError } from "../lib/request-error-messages.js";

export function RequestConversionControl({ request, onConverted }: { request: AdminServiceRequestDetail; onConverted(): Promise<void> }) {
  const queryClient = useQueryClient();
  const [plannedStartDate, setPlannedStartDate] = useState("");
  const [result, setResult] = useState<RequestConversionResponse | null>(null);
  const [alreadyConverted, setAlreadyConverted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const convert = useMutation({ mutationFn: () => adminRequestsApiClient.convert(request.id, plannedStartDate ? { plannedStartDate } : {}) });
  const current = request.qualificationReviews.filter(review => review.supersededAt === null);
  const review = current.length === 1 ? current[0] : undefined;
  const eligible = request.status === "qualified" || request.status === "qualified_with_conditions";
  const consistent = review?.outcome === request.status && !!review?.finalVariantId && review.agreedPriceXaf !== null;
  const locked = request.status === "converted" || alreadyConverted || result !== null;
  const subscriptionId = result?.subscription.id ?? request.convertedSubscriptionId;

  async function refresh() {
    await Promise.all([onConverted(), queryClient.invalidateQueries({ queryKey: ["customers", "admin-list"] })]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || locked || !eligible || !consistent) return;
    inFlight.current = true; setError(null);
    try {
      setResult(await convert.mutateAsync());
      await refresh();
    } catch (failure) {
      const code = extractRequestErrorCode(failure);
      setError(translateRequestError(code));
      if (code === "REQUEST_ALREADY_CONVERTED") { setAlreadyConverted(true); await refresh(); }
    } finally { inFlight.current = false; }
  }

  if (!eligible && !locked) return null;
  return <section className="admin-request-detail__conversion" aria-label="Conversion de la demande">
    <h4>Conversion en abonnement</h4>
    {error && <p className="error" role="alert">{error}</p>}
    {locked ? <p className="status" role="status">
      {result ? `Abonnement ${result.subscription.reference} créé, en préparation.` : "Cette demande a déjà été convertie."}
    </p> : <>
      <p className="muted">La conversion crée un abonnement en préparation et clôt définitivement cette demande. Une correction ultérieure passera par l’abonnement.</p>
      {!consistent || !review ? <p className="error" role="alert">La qualification actuelle est incomplète ou incohérente. Vérifie la décision avant de convertir.</p> : <form className="qualification-review-form" onSubmit={event => void submit(event)}>
        <dl className="admin-request-detail__meta">
          <div><dt>Service</dt><dd>{request.service.name}</dd></div>
          <div><dt>Option retenue</dt><dd>{request.qualificationAvailableVariants.find(variant => variant.id === review.finalVariantId)?.name ?? "Option qualifiée"}</dd></div>
          <div><dt>Prix convenu</dt><dd>{new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XAF", maximumFractionDigits: 0 }).format(review.agreedPriceXaf!)}</dd></div>
        </dl>
        {review.targetStartDate ? <p>Début prévu : <time dateTime={review.targetStartDate}>{new Date(review.targetStartDate).toLocaleDateString("fr-FR")}</time></p> : <label>
          Date de début prévue *
          <input type="date" required value={plannedStartDate} onChange={event => setPlannedStartDate(event.target.value)} disabled={convert.isPending} />
        </label>}
        <button type="submit" disabled={convert.isPending}>{convert.isPending ? "Conversion…" : "Convertir en abonnement"}</button>
      </form>}
    </>}
    {locked && subscriptionId && <a href={`/admin/abonnements/${encodeURIComponent(subscriptionId)}/preparation`}>Ouvrir l’onboarding de l’abonnement</a>}
  </section>;
}
