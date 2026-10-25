import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  contactAttemptChannels,
  contactAttemptOutcomes,
  qualificationReviewOutcomes,
  type AdminServiceRequestDetail,
  type ContactAttemptChannel,
  type ContactAttemptDirection,
  type ContactAttemptOutcome,
  type QualificationReviewOutcome,
} from "@kfit/shared";
import { adminRequestsApiClient } from "../api/admin-requests-api.js";
import { extractRequestErrorCode, translateRequestError } from "../lib/request-error-messages.js";
import { channelLabels, outcomeLabels, qualificationOutcomeLabels } from "../lib/request-labels.js";
import { Dialog, DialogClose, DialogContent, Sheet, SheetClose, SheetContent } from "../../components/ui/dialog.js";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input, NativeSelect, Textarea } from "../../components/ui/input.js";
import { SegmentedControl } from "../../components/ui/segmented-control.js";
import { dateFr, fromLocalInput, moneyXaf, toLocalInput } from "../../lib/format.js";

/** Refresh the detail, every queue key (incl. the nav badge) and, after conversion, customers. */
export function useRequestRefresh(requestId: string) {
  const client = useQueryClient();
  return async (alsoCustomers = false) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["requests", "admin-detail", requestId] }),
      client.invalidateQueries({ queryKey: ["requests", "admin-queue"] }),
      ...(alsoCustomers ? [client.invalidateQueries({ queryKey: ["customers"] })] : []),
    ]);
  };
}

function ServerError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger">
      {message}
    </p>
  ) : null;
}

const errorOf = (failure: unknown) => translateRequestError(extractRequestErrorCode(failure));

/* ------------------------------------------------------------------ */
/* Contact attempt — same fields as S3.3; occurredAt / nextActionAt   */
/* are optional server inputs (default: now / none).                  */
/* ------------------------------------------------------------------ */

type AttemptValues = { channel: ContactAttemptChannel; direction: ContactAttemptDirection; outcome: ContactAttemptOutcome; occurredAt: string; nextActionAt: string; note: string };

export function ContactAttemptSheet({ request, open, onOpenChange }: { request: AdminServiceRequestDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const refresh = useRequestRefresh(request.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const defaults = (): AttemptValues => ({ channel: "whatsapp", direction: "outbound", outcome: "reached", occurredAt: toLocalInput(new Date()), nextActionAt: "", note: "" });
  const { control, register, handleSubmit, reset, setError, formState } = useForm<AttemptValues>({ defaultValues: defaults() });

  useEffect(() => {
    if (open) {
      reset(defaults());
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  const submit = handleSubmit(async (values) => {
    const occurredAt = fromLocalInput(values.occurredAt);
    if (!occurredAt) return setError("occurredAt", { message: "Date invalide." });
    if (new Date(occurredAt).getTime() > Date.now() + 60_000) return setError("occurredAt", { message: "Le contact ne peut pas être dans le futur." });
    const nextActionAt = values.nextActionAt ? fromLocalInput(values.nextActionAt) : null;
    if (values.nextActionAt && !nextActionAt) return setError("nextActionAt", { message: "Date invalide." });
    setServerError(null);
    try {
      await adminRequestsApiClient.logContactAttempt(request.id, {
        channel: values.channel,
        direction: values.direction,
        outcome: values.outcome,
        occurredAt,
        ...(nextActionAt ? { nextActionAt } : {}),
        ...(values.note.trim() ? { note: values.note.trim() } : {}),
      });
      await refresh();
      toast.success("Tentative de contact enregistrée.");
      onOpenChange(false);
    } catch (failure) {
      setServerError(errorOf(failure));
    }
  });

  return (
    <Sheet open={open} onOpenChange={(next) => (formState.isSubmitting ? undefined : onOpenChange(next))}>
      <SheetContent
        title="Tentative de contact"
        description={`${request.prospect.fullName} · ${request.prospect.whatsapp}`}
        footer={
          <>
            <SheetClose asChild>
              <Button variant="secondary" disabled={formState.isSubmitting}>Annuler</Button>
            </SheetClose>
            <Button type="submit" form="attempt-form" disabled={formState.isSubmitting}>{formState.isSubmitting ? "Enregistrement…" : "Enregistrer"}</Button>
          </>
        }
      >
        <form id="attempt-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-[13px] font-semibold">Canal</legend>
            <Controller control={control} name="channel" render={({ field }) => (
              <SegmentedControl aria-label="Canal" size="sm" value={field.value} onValueChange={field.onChange} options={contactAttemptChannels.map((value) => ({ value, label: channelLabels[value] }))} />
            )} />
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-[13px] font-semibold">Sens</legend>
            <Controller control={control} name="direction" render={({ field }) => (
              <SegmentedControl aria-label="Sens" size="sm" value={field.value} onValueChange={field.onChange} options={[{ value: "outbound", label: "Je l'ai contacté" }, { value: "inbound", label: "Il m'a contactée" }]} />
            )} />
          </fieldset>
          <Field label="Résultat">
            {(p) => (
              <NativeSelect {...p} {...register("outcome")}>
                {contactAttemptOutcomes.map((value) => <option key={value} value={value}>{outcomeLabels[value]}</option>)}
              </NativeSelect>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date du contact" error={formState.errors.occurredAt?.message}>
              {(p) => <Input {...p} type="datetime-local" max={toLocalInput(new Date())} {...register("occurredAt")} />}
            </Field>
            <Field label="Prochaine action" optionalHint="(facultatif)" error={formState.errors.nextActionAt?.message}>
              {(p) => <Input {...p} type="datetime-local" {...register("nextActionAt")} />}
            </Field>
          </div>
          <Field label="Note" optionalHint="(facultatif)">
            {(p) => <Textarea {...p} rows={3} maxLength={1000} {...register("note")} />}
          </Field>
          <ServerError message={serverError} />
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Qualification decision — same inputs as S3.4 (legacy form).        */
/* ------------------------------------------------------------------ */

type QualificationValues = { outcome: QualificationReviewOutcome; finalVariantId: string; agreedPriceXaf: string; targetStartDate: string; suitabilityNote: string; conditions: string; blockers: string };
const lines = (value: string) => {
  const items = value.split("\n").map((item) => item.trim()).filter(Boolean);
  return items.length ? items : undefined;
};

export function QualificationSheet({ request, open, onOpenChange }: { request: AdminServiceRequestDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const refresh = useRequestRefresh(request.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const defaults = (): QualificationValues => ({
    outcome: "qualified",
    finalVariantId: request.requestedVariant?.id ?? request.qualificationAvailableVariants[0]?.id ?? "",
    agreedPriceXaf: "",
    targetStartDate: "",
    suitabilityNote: "",
    conditions: "",
    blockers: "",
  });
  const { control, register, handleSubmit, reset, watch, setError, formState } = useForm<QualificationValues>({ defaultValues: defaults() });
  const outcome = watch("outcome");
  // REG-F1: an offer with no active option is sold as is; the server refuses any option for it.
  const soldAsIs = request.qualificationAvailableVariants.length === 0;

  useEffect(() => {
    if (open) {
      reset(defaults());
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  const submit = handleSubmit(async (v) => {
    const rejected = v.outcome === "rejected";
    if (!rejected && v.agreedPriceXaf !== "" && !(Number.isInteger(Number(v.agreedPriceXaf)) && Number(v.agreedPriceXaf) >= 0)) {
      return setError("agreedPriceXaf", { message: "Montant entier en XAF, positif ou nul." });
    }
    setServerError(null);
    try {
      await adminRequestsApiClient.recordQualificationReview(request.id, {
        outcome: v.outcome,
        finalVariantId: rejected || soldAsIs ? undefined : v.finalVariantId || undefined,
        agreedPriceXaf: rejected || v.agreedPriceXaf === "" ? undefined : Number(v.agreedPriceXaf),
        targetStartDate: rejected || v.targetStartDate === "" ? undefined : new Date(v.targetStartDate).toISOString(),
        suitabilityNote: v.suitabilityNote || undefined,
        conditions: v.outcome === "qualified_with_conditions" ? lines(v.conditions) : undefined,
        blockers: lines(v.blockers),
      });
      await refresh();
      toast.success("Décision de qualification enregistrée.");
      onOpenChange(false);
    } catch (failure) {
      setServerError(errorOf(failure));
    }
  });

  return (
    <Sheet open={open} onOpenChange={(next) => (formState.isSubmitting ? undefined : onOpenChange(next))}>
      <SheetContent
        title="Décision de qualification"
        description="Une décision par demande. Une demande qualifiée peut ensuite être convertie en abonnement."
        footer={
          <>
            <SheetClose asChild>
              <Button variant="secondary" disabled={formState.isSubmitting}>Annuler</Button>
            </SheetClose>
            <Button type="submit" form="qualification-form" variant={outcome === "rejected" ? "destructive-solid" : "default"} disabled={formState.isSubmitting}>
              {formState.isSubmitting ? "Enregistrement…" : "Enregistrer la décision"}
            </Button>
          </>
        }
      >
        <form id="qualification-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-[13px] font-semibold">Décision</legend>
            <Controller control={control} name="outcome" render={({ field }) => (
              <SegmentedControl aria-label="Décision" size="sm" value={field.value} onValueChange={field.onChange} options={qualificationReviewOutcomes.map((value) => ({ value, label: qualificationOutcomeLabels[value] }))} />
            )} />
          </fieldset>
          {outcome !== "rejected" ? (
            <>
              {soldAsIs ? (
                <p className="text-sm text-muted-foreground">Offre sans option : vendue telle quelle.</p>
              ) : (
                <Field label="Option retenue">
                  {(p) => (
                    <NativeSelect {...p} {...register("finalVariantId")}>
                      <option value="">Choisir une option</option>
                      {request.qualificationAvailableVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}
                    </NativeSelect>
                  )}
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prix validé (XAF)" error={formState.errors.agreedPriceXaf?.message}>
                  {(p) => <Input {...p} inputMode="numeric" {...register("agreedPriceXaf")} />}
                </Field>
                <Field label="Date cible" optionalHint="(facultatif)">
                  {(p) => <Input {...p} type="date" {...register("targetStartDate")} />}
                </Field>
              </div>
            </>
          ) : null}
          {outcome === "qualified_with_conditions" ? (
            <Field label="Conditions" hint="Une condition par ligne.">
              {(p) => <Textarea {...p} rows={3} {...register("conditions")} />}
            </Field>
          ) : null}
          <Field label="Note d'aptitude" optionalHint="(facultatif)">
            {(p) => <Textarea {...p} rows={3} {...register("suitabilityNote")} />}
          </Field>
          <Field label="Blocages" optionalHint="(facultatif)" hint="Un blocage par ligne.">
            {(p) => <Textarea {...p} rows={2} {...register("blockers")} />}
          </Field>
          <ServerError message={serverError} />
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Waitlist entry (S3.4)                                               */
/* ------------------------------------------------------------------ */

export function WaitlistDialog({ request, open, onOpenChange }: { request: AdminServiceRequestDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const refresh = useRequestRefresh(request.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<{ variantId: string; priorityNote: string }>({ defaultValues: { variantId: request.requestedVariant?.id ?? "", priorityNote: "" } });

  useEffect(() => {
    if (open) {
      reset({ variantId: request.requestedVariant?.id ?? "", priorityNote: "" });
      setServerError(null);
    }
  }, [open, reset, request.requestedVariant?.id]);

  const submit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      await adminRequestsApiClient.createWaitlistEntry(request.id, { variantId: v.variantId || undefined, priorityNote: v.priorityNote || undefined });
      await refresh();
      toast.success("Demande ajoutée à la liste d'attente.");
      onOpenChange(false);
    } catch (failure) {
      setServerError(errorOf(failure));
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (formState.isSubmitting ? undefined : onOpenChange(next))}>
      <DialogContent
        title="Ajouter à la liste d'attente"
        description="La demande passe en liste d'attente jusqu'à ce qu'une place se libère."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={formState.isSubmitting}>Retour</Button>
            </DialogClose>
            <Button type="submit" form="waitlist-form" disabled={formState.isSubmitting}>{formState.isSubmitting ? "Ajout…" : "Ajouter"}</Button>
          </>
        }
      >
        <form id="waitlist-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
          <Field label="Option">
            {(p) => (
              <NativeSelect {...p} {...register("variantId")}>
                <option value="">Service entier</option>
                {request.qualificationAvailableVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}
              </NativeSelect>
            )}
          </Field>
          <Field label="Note de priorité" optionalHint="(facultatif)">
            {(p) => <Textarea {...p} rows={2} {...register("priorityNote")} />}
          </Field>
          <ServerError message={serverError} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Confirmation for status changes with consequences                  */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive = false, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel: string; destructive?: boolean; onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) setError(null); }, [open]);
  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent
        title={title}
        description={description}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={busy}>Retour</Button>
            </DialogClose>
            <Button
              variant={destructive ? "destructive-solid" : "default"}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await onConfirm();
                  onOpenChange(false);
                } catch (failure) {
                  setError(errorOf(failure));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Enregistrement…" : confirmLabel}
            </Button>
          </>
        }
      >
        <ServerError message={error} />
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Conversion — same eligibility/consistency checks as S3.5 legacy.    */
/* The server owns price, variant and customer resolution.            */
/* ------------------------------------------------------------------ */

export function currentReview(request: AdminServiceRequestDetail) {
  const current = request.qualificationReviews.filter((review) => review.supersededAt === null);
  return current.length === 1 ? current[0] : undefined;
}
export function conversionState(request: AdminServiceRequestDetail) {
  const review = currentReview(request);
  const eligible = request.status === "qualified" || request.status === "qualified_with_conditions";
  // A null option is a valid qualification of an offer sold as is (REG-F1).
  const consistent = review?.outcome === request.status && review.agreedPriceXaf !== null;
  return { review, eligible, consistent };
}

export function ConversionDialog({ request, open, onOpenChange, onConverted }: { request: AdminServiceRequestDetail; open: boolean; onOpenChange: (open: boolean) => void; onConverted: (reference: string) => void }) {
  const refresh = useRequestRefresh(request.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const { review, eligible, consistent } = conversionState(request);
  // Pre-filled with the prospect's preferred start date when it is still ahead; the coach confirms it.
  const suggested = request.preferredStartDate && new Date(request.preferredStartDate).getTime() > Date.now() ? toLocalInput(new Date(request.preferredStartDate)).slice(0, 10) : "";
  const { register, handleSubmit, reset, setError, formState } = useForm<{ plannedStartDate: string }>({ defaultValues: { plannedStartDate: suggested } });

  useEffect(() => {
    if (open) {
      reset({ plannedStartDate: suggested });
      setServerError(null);
    }
  }, [open, reset, suggested]);

  const submit = handleSubmit(async (v) => {
    if (!eligible || !consistent || !review) return;
    if (!review.targetStartDate && !v.plannedStartDate) return setError("plannedStartDate", { message: "Renseigne la date de début prévue." });
    setServerError(null);
    try {
      const result = await adminRequestsApiClient.convert(request.id, v.plannedStartDate ? { plannedStartDate: v.plannedStartDate } : {});
      await refresh(true);
      onOpenChange(false);
      onConverted(result.subscription.reference);
    } catch (failure) {
      setServerError(errorOf(failure));
      if (extractRequestErrorCode(failure) === "REQUEST_ALREADY_CONVERTED") await refresh(true);
    }
  });

  const variantName = review?.finalVariantId
    ? request.qualificationAvailableVariants.find((variant) => variant.id === review.finalVariantId)?.name ?? "Option qualifiée"
    : "Offre unique";

  return (
    <Dialog open={open} onOpenChange={(next) => (formState.isSubmitting ? undefined : onOpenChange(next))}>
      <DialogContent
        title="Convertir en abonnement"
        description="Crée un abonnement en préparation et clôt définitivement la demande. Une correction ultérieure passera par l'abonnement."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={formState.isSubmitting}>Retour</Button>
            </DialogClose>
            <Button type="submit" form="conversion-form" disabled={formState.isSubmitting || !consistent}>{formState.isSubmitting ? "Conversion…" : "Convertir"}</Button>
          </>
        }
      >
        {!consistent || !review ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger">
            La qualification actuelle est incomplète ou incohérente. Vérifie la décision avant de convertir.
          </p>
        ) : (
          <form id="conversion-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-[#f7f8f5] p-4 text-[13px]">
              <div className="col-span-2 flex flex-col gap-0.5"><dt className="text-muted-foreground">Offre</dt><dd className="font-semibold">{request.service.name} · {variantName}</dd></div>
              <div className="flex flex-col gap-0.5"><dt className="text-muted-foreground">Prix convenu</dt><dd className="font-semibold">{moneyXaf(review.agreedPriceXaf ?? 0)}</dd></div>
              {review.targetStartDate ? (
                <div className="flex flex-col gap-0.5"><dt className="text-muted-foreground">Début prévu</dt><dd className="font-semibold">{dateFr(review.targetStartDate)}</dd></div>
              ) : null}
            </dl>
            {!review.targetStartDate ? (
              <Field label="Date de début prévue" hint={suggested ? "Proposée d'après le début souhaité par le prospect." : undefined} error={formState.errors.plannedStartDate?.message}>
                {(p) => <Input {...p} type="date" {...register("plannedStartDate")} />}
              </Field>
            ) : null}
            <ServerError message={serverError} />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
