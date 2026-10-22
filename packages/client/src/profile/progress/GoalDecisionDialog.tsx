import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { goalOutcomes, type CoachingGoal, type GoalAction, type GoalOutcome } from "@kfit/shared";
import { progressApi, progressErrorMessage } from "../../progress/api/progress-api.js";
import { Dialog, DialogClose, DialogContent } from "../../components/ui/dialog.js";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { NativeSelect, Textarea } from "../../components/ui/input.js";
import { goalStatus } from "../../lib/status-map.js";
import { goalActionLabels } from "./progress-meta.js";

type Values = { outcome: GoalOutcome; reason: string };
type Props = { goal: CoachingGoal | null; action: GoalAction | null; onClose: () => void };

const descriptions: Record<GoalAction, string> = {
  pause: "L'objectif reste visible ; il ne reçoit plus de suggestion jusqu'à sa reprise.",
  resume: "L'objectif redevient actif.",
  cancel: "L'objectif est arrêté. La décision et son motif restent dans l'historique.",
  "confirm-outcome": "La suggestion système est indicative : c'est ta confirmation qui fait foi.",
};

/** Goal decisions. Reason rule (server GOAL_OUTCOME_REASON_REQUIRED): required to cancel, or to confirm an outcome other than the suggestion (or with no suggestion). */
export function GoalDecisionDialog({ goal, action, onClose }: Props) {
  const client = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, setError, formState } = useForm<Values>({ defaultValues: { outcome: "achieved", reason: "" } });
  const outcome = watch("outcome");

  useEffect(() => {
    reset({ outcome: goal?.suggestedStatus ?? "achieved", reason: "" });
    setServerError(null);
  }, [goal, action, reset]);

  if (!goal || !action) return null;
  const needsReason = action === "cancel" || (action === "confirm-outcome" && outcome !== goal.suggestedStatus);
  const subscriptionKey = ["goals"] as const;

  const submit = handleSubmit(async (values) => {
    const reason = values.reason.trim();
    if (needsReason && !reason) return setError("reason", { message: "Renseigne un motif." });
    setServerError(null);
    try {
      await progressApi.command(goal.id, action, action === "confirm-outcome" ? { outcome: values.outcome, reason: reason || null } : { reason: reason || null });
      await client.invalidateQueries({ queryKey: subscriptionKey });
      toast.success("Décision enregistrée.");
      onClose();
    } catch (failure) {
      setServerError(progressErrorMessage(failure));
      await client.invalidateQueries({ queryKey: subscriptionKey });
    }
  });

  return (
    <Dialog open onOpenChange={(open) => (!open && !formState.isSubmitting ? onClose() : undefined)}>
      <DialogContent
        title={goalActionLabels[action]}
        description={descriptions[action]}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={formState.isSubmitting}>Retour</Button>
            </DialogClose>
            <Button type="submit" form="goal-decision-form" variant={action === "cancel" ? "destructive-solid" : "default"} disabled={formState.isSubmitting}>
              {formState.isSubmitting ? "Enregistrement…" : "Confirmer"}
            </Button>
          </>
        }
      >
        <form id="goal-decision-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
          <p className="text-sm font-semibold">{goal.label}</p>
          {action === "confirm-outcome" ? (
            <>
              <p className="rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
                Suggestion système : <strong>{goal.suggestedStatus ? goalStatus[goal.suggestedStatus].label : "aucune suggestion"}</strong>
              </p>
              <Field label="Résultat confirmé">
                {(p) => (
                  <NativeSelect {...p} {...register("outcome")}>
                    {goalOutcomes.map((value) => (
                      <option key={value} value={value}>
                        {goalStatus[value].label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </>
          ) : null}
          <Field label="Motif" {...(needsReason ? {} : { optionalHint: "(facultatif)" })} error={formState.errors.reason?.message}>
            {(p) => <Textarea {...p} rows={3} maxLength={2000} {...register("reason")} />}
          </Field>
          {serverError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger">
              {serverError}
            </p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
