import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  catalogueMedicalClearancePolicies,
  catalogueRuleLimits,
  type CatalogueMedicalClearancePolicy,
  type CatalogueServicePolicy,
} from "@kfit/shared";
import { catalogueApiClient } from "../api/catalogue-api.js";
import { medicalPolicyLabels } from "../lib/catalogue-meta.js";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input, NativeSelect } from "../../components/ui/input.js";
import { Switch } from "../../components/ui/switch.js";
import { ActionError, useContentAction } from "./content-action.js";

type Draft = {
  cadence: string;
  notice: string;
  lateCancelConsumes: boolean;
  missedConsumes: boolean;
  medical: CatalogueMedicalClearancePolicy | "";
};
const toDraft = (policy: CatalogueServicePolicy | null): Draft => ({
  cadence: policy?.followUpFrequencyDays?.toString() ?? "",
  notice: policy?.lateCancelNoticeHours?.toString() ?? "",
  lateCancelConsumes: policy?.lateCancelConsumesComponent ?? false,
  missedConsumes: policy?.missedConsumesComponent ?? false,
  medical:
    (policy?.medicalClearancePolicy as CatalogueMedicalClearancePolicy | null) ??
    "",
});
const affectedText = (count: number) =>
  count
    ? ` ${count} client(e)${count > 1 ? "s" : ""} en préparation mis(es) à jour.`
    : "";

/**
 * Offer rules, or one variant's own rules (CAT-03 D3). On a variant an empty field means « comme l'offre ».
 * New rules apply to new appointments; the medical policy applies at once to clients in preparation (D5).
 */
export function RulesEditor({
  serviceId,
  variantId,
  policy,
  disabled,
  onDone,
}: {
  serviceId: string;
  variantId: string | null;
  policy: CatalogueServicePolicy | null;
  disabled: boolean;
  onDone?: () => void;
}) {
  const { busy, error, setError, run } = useContentAction();
  const [draft, setDraft] = useState<Draft>(() => toDraft(policy));
  const forVariant = variantId !== null;
  const empty = forVariant ? "Comme l'offre" : "Aucune";
  const { followUpFrequencyDays: cadence, lateCancelNoticeHours: notice } =
    catalogueRuleLimits;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const days = draft.cadence === "" ? null : Number(draft.cadence),
      hours = draft.notice === "" ? null : Number(draft.notice);
    if (
      days !== null &&
      !(Number.isInteger(days) && days >= cadence.min && days <= cadence.max)
    )
      return setError(
        `La cadence de suivi va de ${cadence.min} à ${cadence.max} jours.`,
      );
    if (
      hours !== null &&
      !(Number.isInteger(hours) && hours >= notice.min && hours <= notice.max)
    )
      return setError(
        `Le délai d'annulation va de ${notice.min} à ${notice.max} heures.`,
      );
    if (!forVariant && !draft.medical)
      return setError("Choisis la politique d'avis médical de l'offre.");
    let affected = 0;
    const done = await run(async () => {
      const response = await catalogueApiClient.putRules(serviceId, variantId, {
        followUpFrequencyDays: days,
        lateCancelNoticeHours: hours,
        lateCancelConsumesComponent: draft.lateCancelConsumes,
        missedConsumesComponent: draft.missedConsumes,
        medicalClearancePolicy: draft.medical || null,
      });
      affected = response.onboardingSubscriptionsAffected;
    }, "Règles enregistrées.");
    if (!done) return;
    if (affected)
      toast.info(`Avis médical appliqué :${affectedText(affected)}`);
    onDone?.();
  }

  return (
    <form onSubmit={(e) => void save(e)} className="flex flex-col gap-4">
      <fieldset disabled={disabled || busy} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Cadence de suivi (jours)"
            hint={`Vide : ${empty.toLowerCase()}. De ${cadence.min} à ${cadence.max}.`}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                placeholder={empty}
                value={draft.cadence}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cadence: e.target.value.replace(/[^0-9]/g, ""),
                  })
                }
              />
            )}
          </Field>
          <Field
            label="Annulation tardive (heures avant)"
            hint={`Vide : ${forVariant ? "comme l'offre" : "pas de délai"}. De ${notice.min} à ${notice.max}.`}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                placeholder={empty}
                value={draft.notice}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    notice: e.target.value.replace(/[^0-9]/g, ""),
                  })
                }
              />
            )}
          </Field>
        </div>
        <label className="flex items-center justify-between gap-3 text-[13px] font-semibold">
          Une annulation tardive consomme la séance
          <Switch
            checked={draft.lateCancelConsumes}
            onCheckedChange={(v) =>
              setDraft({ ...draft, lateCancelConsumes: v })
            }
            aria-label="Une annulation tardive consomme la séance"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-[13px] font-semibold">
          Une absence consomme la séance
          <Switch
            checked={draft.missedConsumes}
            onCheckedChange={(v) => setDraft({ ...draft, missedConsumes: v })}
            aria-label="Une absence consomme la séance"
          />
        </label>
        <Field
          label="Avis médical"
          hint="S'applique tout de suite aux clientes en préparation."
        >
          {(p) => (
            <NativeSelect
              {...p}
              value={draft.medical}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  medical: e.target.value as Draft["medical"],
                })
              }
            >
              <option value="">
                {forVariant ? "Comme l'offre" : "- Choisir -"}
              </option>
              {catalogueMedicalClearancePolicies.map((value) => (
                <option key={value} value={value}>
                  {medicalPolicyLabels[value]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <p className="text-xs text-muted-foreground">
          Les règles d'annulation et d'absence s'appliquent aux nouveaux
          rendez-vous ; ceux déjà planifiés gardent les leurs.
          {forVariant
            ? " Les deux interrupteurs s'appliquent à cette variante même s'ils sont identiques à l'offre."
            : ""}
        </p>
        {disabled ? null : (
          <Button type="submit" className="self-end">
            {busy ? "Enregistrement…" : "Enregistrer les règles"}
          </Button>
        )}
      </fieldset>
      <ActionError message={error} />
    </form>
  );
}
