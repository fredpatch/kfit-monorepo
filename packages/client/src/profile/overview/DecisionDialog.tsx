import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  SubscriptionCommand,
  SubscriptionDetail,
  SubscriptionInput,
} from "@kfit/shared";
import {
  subscriptionErrorMessage,
  subscriptionsApi,
} from "../../subscriptions/api/subscriptions-api.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
} from "../../components/ui/dialog.js";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input, Textarea } from "../../components/ui/input.js";
import { financeApi } from "../../finance/api/finance-api.js";
import { fromLocalInput } from "../../lib/format.js";
import {
  commandDescriptions,
  commandLabels,
  outstandingComponents,
  reasonRequired,
} from "./subscription-commands.js";

type Values = { reason: string; date: string; overrideOutstanding: boolean };

/** Keys refreshed after a lifecycle decision (same set as the former lifecycle screen, plus the profile). */
export function subscriptionQueryKeys(id: string) {
  return [
    ["subscription-lifecycle", id],
    ["onboarding", id],
    ["appointments", id],
    ["follow-ups", id],
    ["follow-up-queue"],
    ["customers", "detail"],
    ["progress", id],
    ["goals", id],
  ];
}

type DecisionDialogProps = {
  view: SubscriptionDetail;
  command: SubscriptionCommand | null;
  onClose: () => void;
};

export function DecisionDialog({
  view,
  command,
  onClose,
}: DecisionDialogProps) {
  const client = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    clearErrors,
    setValue,
    formState,
  } = useForm<Values>({
    defaultValues: { reason: "", date: "", overrideOutstanding: false },
  });
  const override = watch("overrideOutstanding");
  const reasonValue = watch("reason");
  const financeQuery = useQuery({
    queryKey: ["finance", view.id],
    queryFn: () => financeApi.get(view.id),
    enabled: command === "complete",
  });

  useEffect(() => {
    reset({ reason: "", date: "", overrideOutstanding: false });
    setServerError(null);
  }, [command, reset]);

  useEffect(() => {
    if (command === "complete" && !override) {
      clearErrors(["reason", "overrideOutstanding"]);
      setValue("reason", "");
      setServerError(null);
    }
  }, [command, override, clearErrors, setValue]);

  if (!command) return null;
  const needsReason = reasonRequired(command, view, override);
  const takesReason =
    needsReason || command === "completion-due" || command === "complete";
  const takesDate =
    command === "resume" || command === "resume-active" || command === "renew";
  const outstanding = outstandingComponents(view);
  const blockedCompletion = command === "complete" && outstanding > 0;
  const remainingXaf = financeQuery.data?.finance.remainingXaf;
  const completionIntentInvalid =
    command === "complete" &&
    ((blockedCompletion && !override) || (override && !reasonValue.trim()));
  const destructive = command === "cancel";

  const submit = handleSubmit(async (values) => {
    if (blockedCompletion && values.overrideOutstanding !== true)
      return setError("overrideOutstanding", {
        message:
          "Sélectionne explicitement la dérogation pour terminer malgré le blocage.",
      });
    const reason = values.reason.trim();
    if (needsReason && !reason)
      return setError("reason", { message: "Renseigne un motif." });
    const date = fromLocalInput(values.date);
    if (command === "renew" && !date)
      return setError("date", { message: "Choisis une date de début valide." });
    if (values.date && !date)
      return setError("date", { message: "Choisis une date valide." });

    let input: SubscriptionInput = {};
    if (
      command === "pause" ||
      command === "cancel" ||
      command === "completion-due"
    )
      input = reason ? { reason } : {};
    if (command === "complete")
      input = {
        overrideOutstandingComponents: values.overrideOutstanding,
        ...(values.overrideOutstanding ? { overrideReason: reason } : {}),
      };
    if (command === "resume") input = date ? { revisedEndDate: date } : {};
    if (command === "resume-active")
      input = { reason, ...(date ? { revisedEndDate: date } : {}) };
    if (command === "renew" && date) input = { plannedStartDate: date };

    setServerError(null);
    try {
      const response = await subscriptionsApi.command(view.id, command, input);
      client.setQueryData(["subscription-lifecycle", view.id], response);
      await Promise.all(
        subscriptionQueryKeys(view.id).map((queryKey) =>
          client.invalidateQueries({ queryKey }),
        ),
      );
      toast.success("Décision enregistrée.");
      onClose();
    } catch (failure) {
      setServerError(subscriptionErrorMessage(failure));
      await client.invalidateQueries({
        queryKey: ["subscription-lifecycle", view.id],
      });
    }
  });

  return (
    <Dialog
      open
      onOpenChange={(open) =>
        !open && !formState.isSubmitting ? onClose() : undefined
      }
    >
      <DialogContent
        title={commandLabels[command]}
        description={commandDescriptions[command]}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={formState.isSubmitting}>
                Retour
              </Button>
            </DialogClose>
            <Button
              type="submit"
              form="decision-form"
              variant={destructive ? "destructive-solid" : "default"}
              disabled={formState.isSubmitting || completionIntentInvalid}
            >
              {formState.isSubmitting
                ? "Enregistrement…"
                : destructive
                  ? "Confirmer l'annulation"
                  : "Confirmer"}
            </Button>
          </>
        }
      >
        <form
          id="decision-form"
          onSubmit={(e) => void submit(e)}
          className="flex flex-col gap-4"
          noValidate
        >
          {command === "complete" &&
          remainingXaf !== undefined &&
          remainingXaf > 0 ? (
            <p
              role="note"
              className="rounded-md border border-warning/40 bg-warning-soft p-3 text-[13px] font-semibold text-warning"
            >
              Solde financier restant : {remainingXaf.toLocaleString("fr-FR")}{" "}
              FCFA. L'abonnement peut être terminé, mais ce solde restera dû
              après la clôture.
            </p>
          ) : null}
          {blockedCompletion ? (
            <div className="flex flex-col gap-2.5 rounded-md bg-warning-soft p-3 text-[13px] text-warning">
              <p>
                Des prestations restent dues par le coach. Pour terminer malgré
                ce blocage, sélectionne explicitement la dérogation et renseigne
                un motif.
              </p>
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  {...register("overrideOutstanding")}
                />
                <span>Terminer malgré le blocage</span>
              </label>
              {formState.errors.overrideOutstanding ? (
                <p role="alert">
                  {formState.errors.overrideOutstanding.message}
                </p>
              ) : null}
            </div>
          ) : null}
          {takesDate ? (
            <Field
              label={
                command === "renew"
                  ? "Date de début du renouvellement"
                  : "Nouvelle date de fin"
              }
              {...(command === "renew" ? {} : { optionalHint: "(facultatif)" })}
              error={formState.errors.date?.message}
            >
              {(p) => (
                <Input {...p} type="datetime-local" {...register("date")} />
              )}
            </Field>
          ) : null}
          {takesReason && (needsReason || command === "completion-due") ? (
            <Field
              label={
                command === "complete" && override
                  ? "Motif de la dérogation"
                  : "Motif"
              }
              {...(needsReason ? {} : { optionalHint: "(facultatif)" })}
              error={formState.errors.reason?.message}
            >
              {(p) => (
                <Textarea
                  {...p}
                  required={needsReason}
                  maxLength={2000}
                  {...register("reason")}
                />
              )}
            </Field>
          ) : null}
          {serverError ? (
            <p
              role="alert"
              className="rounded-md bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger"
            >
              {serverError}
            </p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
