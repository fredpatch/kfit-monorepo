import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import type { CataloguePublicService, RequestSubmissionRecord } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input, Textarea } from "../../components/ui/input.js";
import { PublicChoice, PublicLoading, PublicNote, PublicShell, PublicUnavailable, moneyFcfa, publicPrimaryClass } from "../../components/public/PublicShell.js";
import { cn } from "../../lib/utils.js";
import { familyMeta, familyOfSlug } from "../../lib/families.js";
import { catalogueApiClient } from "../../catalogue/api/catalogue-api.js";
import { requestsApiClient } from "../api/requests-api.js";
import { classifyRequestError, extractRequestErrorCode, translateRequestError } from "../lib/request-error-messages.js";

/** Request page (board 11a) at /demande/:offre?formule=<variantId>. Loads the public catalogue to find the offer. */
export function PublicRequestPage() {
  const { offre = "" } = useParams();
  const catalogue = useQuery({ queryKey: ["catalogue", "public-services"], queryFn: () => catalogueApiClient.listPublicServices() });
  if (catalogue.isPending) return <PublicLoading label="Chargement de l'offre…" tag="Ma demande" />;
  if (catalogue.isError) return <PublicUnavailable title="Offre indisponible" message="Impossible de charger l'offre pour le moment." tag="Ma demande" onRetry={() => void catalogue.refetch()} />;
  const service = catalogue.data.services.find((s) => s.slug === offre);
  if (!service) return <PublicUnavailable title="Offre introuvable" message="Cette offre n'existe pas ou n'est plus proposée." tag="Ma demande" />;
  return <RequestForm key={service.id} service={service} />;
}

type Start = "asap" | "date";

/*
 * Intake rules unchanged from S3.2: one submission token per page visit (safe retries), honeypot « website »,
 * formRenderedAt for the minimum fill time, terminal / transient / correctable errors.
 * WhatsApp is free text (no automatic +241) so duplicate matching keeps working (Fred 2026-10-23).
 */
function RequestForm({ service }: { service: CataloguePublicService }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const bookable = service.variants.filter((v) => v.availabilityStatus === "open");
  const hasVariants = service.variants.length > 0;
  const initialVariant = bookable.find((v) => v.id === params.get("formule"))?.id ?? (bookable.length === 1 ? bookable[0]?.id ?? "" : "");

  const [token] = useState(() => crypto.randomUUID());
  const [formRenderedAt] = useState(() => new Date().toISOString());
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [variantId, setVariantId] = useState(initialVariant);
  const [objective, setObjective] = useState("");
  const [start, setStart] = useState<Start>("asap");
  const [startDate, setStartDate] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [success, setSuccess] = useState<RequestSubmissionRecord | null>(null);
  const submission = useMutation({ mutationFn: requestsApiClient.submit });

  const back = () => navigate("/#offres");
  const variant = service.variants.find((v) => v.id === variantId);
  const family = familyMeta[familyOfSlug(service.slug)];
  const price = service.pricingMode === "quote" ? null : variant ? variant.priceXaf : service.basePriceXaf;
  const today = new Date().toISOString().slice(0, 10);

  function payload() {
    return {
      fullName: fullName.trim(),
      whatsapp: whatsapp.trim(),
      serviceId: service.id,
      requestedVariantId: hasVariants ? variantId : undefined,
      objective: objective.trim() || undefined,
      preferredStartDate: start === "date" && startDate ? startDate : undefined,
      message: message.trim() || undefined,
      submissionToken: token,
      website,
      formRenderedAt,
    };
  }

  function send() {
    submission.mutate(payload(), { onSuccess: (response) => setSuccess(response.request) });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation(null);
    if (!fullName.trim()) return setValidation("Indique ton nom complet.");
    if (!whatsapp.trim()) return setValidation("Indique ton numéro WhatsApp.");
    if (hasVariants && !variantId) return setValidation("Choisis une formule pour cette offre.");
    if (start === "date" && !startDate) return setValidation("Choisis la date de début souhaitée, ou « Dès que possible ».");
    send();
  }

  if (service.availabilityStatus !== "open") {
    return (
      <PublicUnavailable
        title={service.availabilityStatus === "waitlist_only" ? "Offre complète" : "Demandes fermées"}
        message={service.availabilityStatus === "waitlist_only" ? "Plus de place pour le moment sur cette offre. Écris à ta coach pour être prévenue dès qu'une place se libère." : "Les nouvelles demandes sont fermées pour le moment sur cette offre."}
        tag="Ma demande"
      />
    );
  }

  if (success) {
    return (
      <PublicShell tag="Ma demande" className="items-center justify-center gap-4 py-10 text-center"
        actions={<Button asChild variant="secondary" className={publicPrimaryClass}><Link to="/#offres">Retour aux offres</Link></Button>}>
        <span aria-hidden="true" className="flex size-[72px] items-center justify-center rounded-full bg-success-soft text-success"><Check className="size-9" /></span>
        <h1 className="text-[26px] font-extrabold tracking-tight">Demande envoyée</h1>
        <p role="status" className="text-[15px] leading-relaxed text-muted-foreground">Ta coach te contacte sur WhatsApp pour échanger sur ton objectif.</p>
        <span className="rounded-[10px] border border-border bg-card px-3.5 py-2 text-[13px] font-bold tabular-nums">Référence {success.reference}</span>
      </PublicShell>
    );
  }

  const errorCode = submission.isError ? extractRequestErrorCode(submission.error) : undefined;
  const errorKind = submission.isError ? classifyRequestError(errorCode) : null;
  const errorMessage = submission.isError ? translateRequestError(errorCode) : null;
  const pending = submission.isPending;

  // Terminal: the offer cannot take this request now; an identical resend would fail the same way.
  if (errorKind === "terminal") {
    return (
      <PublicShell tag="Ma demande" onBack={back} backLabel="Retour aux offres"
        actions={<Button asChild variant="secondary" className={publicPrimaryClass}><Link to="/#offres">Retour aux offres</Link></Button>}>
        <h1 className="text-[26px] font-extrabold tracking-tight">Demande impossible</h1>
        <p role="alert" className="text-[15px] leading-relaxed text-muted-foreground">{errorMessage}</p>
      </PublicShell>
    );
  }

  return (
    <PublicShell
      title="Ma demande"
      onBack={back}
      backLabel="Retour aux offres"
      actions={errorKind === "transient" ? (
        <>
          <p role="alert" className="text-center text-sm font-medium text-danger">{errorMessage}</p>
          <Button className={publicPrimaryClass} disabled={pending} onClick={send}>{pending ? "Envoi…" : "Réessayer"}</Button>
        </>
      ) : (
        <Button type="submit" form="request-form" className={publicPrimaryClass} disabled={pending}>{pending ? "Envoi…" : "Envoyer ma demande"}</Button>
      )}
    >
      {/* UX-13 recette: the header shows « Ma demande » as text; the page still needs one h1 for screen readers. */}
      <h1 className="sr-only">Ma demande : {service.name}{variant ? ` · ${variant.name}` : ""}</h1>
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
        <span aria-hidden="true" className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", family.softClass)}><span className={cn("size-3.5 rounded", family.dotClass)} /></span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-extrabold">{service.name}{variant ? ` · ${variant.name}` : ""}</span>
          <span className="text-[13px] text-muted-foreground tabular-nums">{price === null ? "Sur devis" : moneyFcfa(price)}</span>
        </span>
        <Link to="/#offres" className="shrink-0 text-[13px] font-bold">Changer</Link>
      </div>

      <form id="request-form" noValidate onSubmit={handleSubmit}>
        <fieldset disabled={pending} className="flex flex-col gap-4">
          {hasVariants && bookable.length > 1 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="pb-1.5 text-sm font-semibold">Formule</legend>
              {service.variants.map((v) => (
                <PublicChoice key={v.id} name="formule" checked={variantId === v.id} disabled={v.availabilityStatus !== "open"} onChange={() => { setVariantId(v.id); setValidation(null); }}
                  label={v.name} hint={v.availabilityStatus !== "open" ? "Indisponible" : v.priceXaf !== null ? moneyFcfa(v.priceXaf) : "Sur devis"} />
              ))}
            </fieldset>
          ) : null}

          <Field label="Nom complet">
            {(control) => <Input {...control} className="h-[50px] text-base" autoComplete="name" value={fullName} onChange={(e) => { setFullName(e.target.value); setValidation(null); }} />}
          </Field>
          <Field label="Numéro WhatsApp" hint="Ta coach te répondra sur ce numéro.">
            {(control) => <Input {...control} type="tel" inputMode="tel" autoComplete="tel" placeholder="+241 …" className="h-[50px] text-base" value={whatsapp} onChange={(e) => { setWhatsapp(e.target.value); setValidation(null); }} />}
          </Field>
          <Field label="Ton objectif" optionalHint="(facultatif)">
            {(control) => <Input {...control} maxLength={500} placeholder="Ex. perdre du poids, avoir plus d'énergie…" className="h-[50px] text-base" value={objective} onChange={(e) => setObjective(e.target.value)} />}
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="pb-1.5 text-sm font-semibold">Quand veux-tu commencer ?</legend>
            <div className="grid grid-cols-2 gap-2">
              <PublicChoice name="start" checked={start === "asap"} onChange={() => { setStart("asap"); setValidation(null); }} label="Dès que possible" />
              <PublicChoice name="start" checked={start === "date"} onChange={() => setStart("date")} label="Choisir une date" />
            </div>
            {start === "date" ? (
              <Input type="date" aria-label="Date de début souhaitée" min={today} className="h-[50px] text-base" value={startDate} onChange={(e) => { setStartDate(e.target.value); setValidation(null); }} />
            ) : null}
          </fieldset>

          <Field label="Un message pour ta coach" optionalHint="(facultatif)">
            {(control) => <Textarea {...control} rows={3} maxLength={2000} className="text-base" value={message} onChange={(e) => setMessage(e.target.value)} />}
          </Field>

          {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>Site web<input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
          </div>

          {validation ? <p role="alert" className="text-sm font-medium text-danger">{validation}</p> : null}
          {errorKind === "correctable" && errorMessage ? <p role="alert" className="text-sm font-medium text-danger">{errorMessage}</p> : null}
        </fieldset>
      </form>

      <PublicNote>Aucun paiement n'est demandé ici. Tes informations servent uniquement à te recontacter.</PublicNote>
    </PublicShell>
  );
}
