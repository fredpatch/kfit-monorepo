import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  goalMetricKeys,
  type CreateGoalInput,
  type GoalMetricKey,
} from "@kfit/shared";
import {
  progressApi,
  progressErrorMessage,
} from "../../progress/api/progress-api.js";
import { Sheet, SheetClose, SheetContent } from "../../components/ui/dialog.js";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input, NativeSelect } from "../../components/ui/input.js";
import { fromLocalInput } from "../../lib/format.js";
import {
  goalMetricToProgress,
  hasTwoDecimalsMax,
  metricMeta,
  parseDecimal,
} from "./progress-meta.js";

type Values = {
  category: string;
  label: string;
  metricKey: GoalMetricKey | "";
  baselineValue: string;
  targetValue: string;
  targetDate: string;
};
const empty: Values = {
  category: "",
  label: "",
  metricKey: "",
  baselineValue: "",
  targetValue: "",
  targetDate: "",
};

/**
 * New coaching goal. Rules kept from the former panel: a measurable goal needs baseline + target + unit
 * together (unit derived from the metric), values positive and different, deadline in the future.
 */
export function GoalSheet({
  subscriptionId,
  open,
  onOpenChange,
}: {
  subscriptionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const client = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, setError, watch, formState } =
    useForm<Values>({ defaultValues: empty });
  const metricKey = watch("metricKey");
  const meta = metricKey ? metricMeta[goalMetricToProgress[metricKey]] : null;

  useEffect(() => {
    if (open) {
      reset(empty);
      setServerError(null);
    }
  }, [open, reset]);

  const submit = handleSubmit(async (values) => {
    const category = values.category.trim();
    const label = values.label.trim();
    if (!category)
      return setError("category", { message: "Renseigne une catégorie." });
    if (!label) return setError("label", { message: "Renseigne un intitulé." });
    const input: CreateGoalInput = {
      category,
      label,
      metricKey: values.metricKey || null,
    };

    if (values.metricKey && meta) {
      const fields = ["baselineValue", "targetValue"] as const;
      let invalid = false;
      for (const field of fields) {
        const value = parseDecimal(values[field]);
        if (
          !hasTwoDecimalsMax(values[field]) ||
          !(value > 0) ||
          value > meta.max
        ) {
          setError(field, {
            message: "Valeur positive, deux décimales au maximum.",
          });
          invalid = true;
        }
      }
      if (invalid) return;
      const baselineValue = parseDecimal(values.baselineValue);
      const targetValue = parseDecimal(values.targetValue);
      if (baselineValue === targetValue)
        return setError("targetValue", {
          message: "La cible doit être différente de la valeur de départ.",
        });
      Object.assign(input, { baselineValue, targetValue, unit: meta.unit });
    }

    if (values.targetDate) {
      const targetDate = fromLocalInput(values.targetDate);
      if (!targetDate || new Date(targetDate).getTime() <= Date.now())
        return setError("targetDate", {
          message: "L'échéance doit être une date future valide.",
        });
      input.targetDate = targetDate;
    }

    setServerError(null);
    try {
      const response = await progressApi.createGoal(subscriptionId, input);
      client.setQueryData(["goals", subscriptionId], response);
      toast.success("Objectif créé.");
      onOpenChange(false);
    } catch (failure) {
      setServerError(progressErrorMessage(failure));
      await client.invalidateQueries({ queryKey: ["goals", subscriptionId] });
    }
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) =>
        formState.isSubmitting ? undefined : onOpenChange(next)
      }
    >
      <SheetContent
        title="Nouvel objectif"
        description="Un objectif lié à une mesure reçoit une suggestion automatique ; la coach confirme toujours le résultat."
        footer={
          <>
            <SheetClose asChild>
              <Button variant="secondary" disabled={formState.isSubmitting}>
                Annuler
              </Button>
            </SheetClose>
            <Button
              type="submit"
              form="goal-form"
              disabled={formState.isSubmitting}
            >
              {formState.isSubmitting ? "Création…" : "Créer l'objectif"}
            </Button>
          </>
        }
      >
        <form
          id="goal-form"
          onSubmit={(e) => void submit(e)}
          className="flex flex-col gap-4"
          noValidate
        >
          <Field
            label="Catégorie"
            hint="Ex. : Composition corporelle, Mobilité, Habitudes"
            error={formState.errors.category?.message}
          >
            {(p) => <Input {...p} maxLength={100} {...register("category")} />}
          </Field>
          <Field label="Intitulé" error={formState.errors.label?.message}>
            {(p) => <Input {...p} maxLength={500} {...register("label")} />}
          </Field>
          <Field label="Mesure associée">
            {(p) => (
              <NativeSelect {...p} {...register("metricKey")}>
                <option value="">
                  Objectif qualitatif, sans suggestion automatique
                </option>
                {goalMetricKeys.map((key) => (
                  <option key={key} value={key}>
                    {metricMeta[goalMetricToProgress[key]].label} (
                    {metricMeta[goalMetricToProgress[key]].unit})
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          {meta ? (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={`Valeur de départ (${meta.unit})`}
                error={formState.errors.baselineValue?.message}
              >
                {(p) => (
                  <Input
                    {...p}
                    inputMode="decimal"
                    {...register("baselineValue")}
                  />
                )}
              </Field>
              <Field
                label={`Cible (${meta.unit})`}
                error={formState.errors.targetValue?.message}
              >
                {(p) => (
                  <Input
                    {...p}
                    inputMode="decimal"
                    {...register("targetValue")}
                  />
                )}
              </Field>
            </div>
          ) : null}
          <Field
            label="Échéance"
            optionalHint="(facultatif)"
            error={formState.errors.targetDate?.message}
          >
            {(p) => (
              <Input {...p} type="datetime-local" {...register("targetDate")} />
            )}
          </Field>
          {serverError ? (
            <p
              role="alert"
              className="rounded-md bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger"
            >
              {serverError}
            </p>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
