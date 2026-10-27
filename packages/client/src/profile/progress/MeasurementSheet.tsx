import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  progressMetrics,
  type CreateMeasurementInput,
  type ProgressMetric,
} from "@kfit/shared";
import {
  progressApi,
  progressErrorMessage,
} from "../../progress/api/progress-api.js";
import { Sheet, SheetClose, SheetContent } from "../../components/ui/dialog.js";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input, Textarea } from "../../components/ui/input.js";
import { fromLocalInput, toLocalInput } from "../../lib/format.js";
import {
  hasTwoDecimalsMax,
  metricMeta,
  parseDecimal,
} from "./progress-meta.js";

type Values = Record<ProgressMetric, string> & {
  measuredAt: string;
  feelingNote: string;
};
const empty = (): Values => ({
  measuredAt: toLocalInput(new Date()),
  feelingNote: "",
  weightKg: "",
  waistCm: "",
  hipsCm: "",
  chestCm: "",
  bodyFatEstimate: "",
});

/**
 * New measurement (board 03 · Progression). Client-side checks mirror the server rules
 * (≥ 1 positive value, ≤ 2 decimals, no future date); the server stays the authority.
 */
export function MeasurementSheet({
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
  const { register, handleSubmit, reset, setError, formState } =
    useForm<Values>({ defaultValues: empty() });

  useEffect(() => {
    if (open) {
      reset(empty());
      setServerError(null);
    }
  }, [open, reset]);

  const submit = handleSubmit(async (values) => {
    const measuredAt = fromLocalInput(values.measuredAt);
    if (!measuredAt)
      return setError("measuredAt", {
        message: "Choisis une date de mesure valide.",
      });
    if (new Date(measuredAt).getTime() > Date.now() + 60_000)
      return setError("measuredAt", {
        message: "La date ne peut pas être dans le futur.",
      });

    const input: CreateMeasurementInput = {
      measuredAt,
      feelingNote: values.feelingNote.trim() || null,
    };
    let invalid = false;
    for (const key of progressMetrics) {
      const raw = values[key].trim();
      if (!raw) continue;
      const value = parseDecimal(raw);
      if (
        !hasTwoDecimalsMax(raw) ||
        !(value > 0) ||
        value > metricMeta[key].max
      ) {
        setError(key, {
          message: `Valeur positive, deux décimales au maximum${key === "bodyFatEstimate" ? ", 100 au plus" : ""}.`,
        });
        invalid = true;
        continue;
      }
      input[key] = value;
    }
    if (invalid) return;
    if (!progressMetrics.some((key) => input[key] !== undefined))
      return setServerError("Renseigne au moins une mesure.");

    setServerError(null);
    try {
      const response = await progressApi.measure(subscriptionId, input);
      client.setQueryData(["progress", subscriptionId], response);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["goals", subscriptionId] }),
        client.invalidateQueries({ queryKey: ["customers", "detail"] }),
      ]);
      toast.success("Mesure enregistrée.");
      onOpenChange(false);
    } catch (failure) {
      setServerError(progressErrorMessage(failure));
      await client.invalidateQueries({
        queryKey: ["progress", subscriptionId],
      });
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
        title="Nouvelle mesure"
        description="Renseigne au moins une valeur. Les mesures enregistrées restent dans l'historique."
        footer={
          <>
            <SheetClose asChild>
              <Button variant="secondary" disabled={formState.isSubmitting}>
                Annuler
              </Button>
            </SheetClose>
            <Button
              type="submit"
              form="measurement-form"
              disabled={formState.isSubmitting}
            >
              {formState.isSubmitting
                ? "Enregistrement…"
                : "Enregistrer la mesure"}
            </Button>
          </>
        }
      >
        <form
          id="measurement-form"
          onSubmit={(e) => void submit(e)}
          className="flex flex-col gap-4"
          noValidate
        >
          <Field
            label="Date de la mesure"
            error={formState.errors.measuredAt?.message}
          >
            {(p) => (
              <Input
                {...p}
                type="datetime-local"
                max={toLocalInput(new Date())}
                {...register("measuredAt")}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {progressMetrics.map((key) => (
              <Field
                key={key}
                label={`${metricMeta[key].label} (${metricMeta[key].unit})`}
                error={formState.errors[key]?.message}
              >
                {(p) => (
                  <Input
                    {...p}
                    inputMode="decimal"
                    placeholder="-"
                    {...register(key)}
                  />
                )}
              </Field>
            ))}
          </div>
          <Field
            label="Ressenti"
            optionalHint="(facultatif)"
            hint="Visible uniquement par la coach."
          >
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                maxLength={4000}
                {...register("feelingNote")}
              />
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
