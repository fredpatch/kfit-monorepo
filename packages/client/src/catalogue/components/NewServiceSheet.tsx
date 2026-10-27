import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type {
  CatalogueDeliveryType,
  CatalogueDurationUnit,
  CataloguePricingMode,
} from "@kfit/shared";
import {
  catalogueApiClient,
  catalogueErrorMessage,
} from "../api/catalogue-api.js";
import { slugify } from "../lib/catalogue-meta.js";
import { useCatalogueRefresh } from "./ServiceSheet.js";
import { Sheet, SheetClose, SheetContent } from "../../components/ui/dialog.js";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input, NativeSelect, Textarea } from "../../components/ui/input.js";

type Values = {
  name: string;
  slug: string;
  description: string;
  pricingMode: CataloguePricingMode;
  basePriceXaf: string;
  deliveryType: CatalogueDeliveryType;
  durationValue: string;
  durationUnit: CatalogueDurationUnit | "";
  capacityLimit: string;
};
const empty: Values = {
  name: "",
  slug: "",
  description: "",
  pricingMode: "fixed",
  basePriceXaf: "",
  deliveryType: "time_based",
  durationValue: "",
  durationUnit: "month",
  capacityLimit: "",
};

/**
 * « Nouvelle offre » (board 06): creates a DRAFT through the existing POST /admin/catalogue/services.
 * The server keeps its defaults (closed, not public); publication is a separate, explicit action.
 */
export function NewServiceSheet({
  open,
  onOpenChange,
  nextSortOrder,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextSortOrder: number;
  onCreated: (id: string) => void;
}) {
  const refresh = useCatalogueRefresh();
  const [serverError, setServerError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState,
  } = useForm<Values>({ defaultValues: empty });
  const name = watch("name");

  useEffect(() => {
    if (open) {
      reset(empty);
      setSlugTouched(false);
      setServerError(null);
    }
  }, [open, reset]);
  useEffect(() => {
    if (!slugTouched) setValue("slug", slugify(name));
  }, [name, slugTouched, setValue]);

  const submit = handleSubmit(async (v) => {
    const fullName = v.name.trim();
    if (!fullName)
      return setError("name", { message: "Renseigne le nom de l'offre." });
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.slug))
      return setError("slug", {
        message: "Lettres minuscules, chiffres et tirets uniquement.",
      });
    const price = v.basePriceXaf.trim() === "" ? null : Number(v.basePriceXaf);
    if (price !== null && !(Number.isInteger(price) && price >= 0))
      return setError("basePriceXaf", { message: "Montant entier en XAF." });
    const duration =
      v.durationValue.trim() === "" ? null : Number(v.durationValue);
    if (duration !== null && !(Number.isInteger(duration) && duration > 0))
      return setError("durationValue", {
        message: "Durée entière, au moins 1.",
      });
    const limit =
      v.capacityLimit.trim() === "" ? null : Number(v.capacityLimit);
    if (limit !== null && !(Number.isInteger(limit) && limit > 0))
      return setError("capacityLimit", {
        message: "Nombre de places entier, au moins 1.",
      });
    setServerError(null);
    try {
      const response = await catalogueApiClient.createAdminService({
        name: fullName,
        slug: v.slug,
        description: v.description.trim() || null,
        pricingMode: v.pricingMode,
        basePriceXaf: price,
        deliveryType: v.deliveryType,
        defaultDurationValue: duration,
        defaultDurationUnit: duration === null ? null : v.durationUnit || null,
        capacityMode: limit === null ? "unlimited" : "limited",
        capacityLimit: limit,
        sortOrder: nextSortOrder,
      });
      await refresh();
      toast.success("Brouillon créé. Publie-le quand il est prêt.");
      onOpenChange(false);
      onCreated(response.service.id);
    } catch (failure) {
      setServerError(catalogueErrorMessage(failure));
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
        title="Nouvelle offre"
        description="L'offre est créée en brouillon, fermée et invisible. Tu la publies ensuite."
        footer={
          <>
            <SheetClose asChild>
              <Button variant="secondary" disabled={formState.isSubmitting}>
                Annuler
              </Button>
            </SheetClose>
            <Button
              type="submit"
              form="new-service-form"
              disabled={formState.isSubmitting}
            >
              {formState.isSubmitting ? "Création…" : "Créer le brouillon"}
            </Button>
          </>
        }
      >
        <form
          id="new-service-form"
          onSubmit={(e) => void submit(e)}
          className="flex flex-col gap-4"
          noValidate
        >
          <Field label="Nom" error={formState.errors.name?.message}>
            {(p) => <Input {...p} maxLength={200} {...register("name")} />}
          </Field>
          <Field
            label="Adresse (slug)"
            hint="Utilisée dans le lien public. Fixée après publication."
            error={formState.errors.slug?.message}
          >
            {(p) => (
              <Input
                {...p}
                maxLength={80}
                {...register("slug", { onChange: () => setSlugTouched(true) })}
              />
            )}
          </Field>
          <Field label="Description" optionalHint="(facultatif)">
            {(p) => <Textarea {...p} rows={3} {...register("description")} />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tarification">
              {(p) => (
                <NativeSelect {...p} {...register("pricingMode")}>
                  <option value="fixed">Prix fixe</option>
                  <option value="quote">Sur devis</option>
                </NativeSelect>
              )}
            </Field>
            <Field
              label="Prix de base (XAF)"
              optionalHint="(requis pour publier un prix fixe)"
              error={formState.errors.basePriceXaf?.message}
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  {...register("basePriceXaf")}
                />
              )}
            </Field>
          </div>
          <Field label="Type de prestation">
            {(p) => (
              <NativeSelect {...p} {...register("deliveryType")}>
                <option value="time_based">Sur une durée (abonnement)</option>
                <option value="one_time">Ponctuelle</option>
              </NativeSelect>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Durée par défaut"
              optionalHint="(facultatif)"
              error={formState.errors.durationValue?.message}
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  {...register("durationValue")}
                />
              )}
            </Field>
            <Field label="Unité">
              {(p) => (
                <NativeSelect {...p} {...register("durationUnit")}>
                  <option value="day">Jours</option>
                  <option value="week">Semaines</option>
                  <option value="month">Mois</option>
                </NativeSelect>
              )}
            </Field>
          </div>
          <Field
            label="Nombre de places"
            optionalHint="(vide = illimité)"
            error={formState.errors.capacityLimit?.message}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                {...register("capacityLimit")}
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
