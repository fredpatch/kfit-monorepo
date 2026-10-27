import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { CheckCircle2, Search } from "lucide-react";
import { normalizeWhatsapp, type AdminCustomer } from "@kfit/shared";
import { customerErrorMessage, customersApi } from "../api/customers-api.js";
import { Sheet, SheetClose, SheetContent } from "../../components/ui/dialog.js";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input, NativeSelect } from "../../components/ui/input.js";
import { Avatar } from "../../components/ui/avatar.js";

export const contactChannels: Record<string, string> = {
  whatsapp: "WhatsApp",
  phone_call: "Appel téléphonique",
  sms: "SMS",
  email: "E-mail",
  other: "Autre",
};

type Values = {
  whatsapp: string;
  fullName: string;
  email: string;
  city: string;
  country: string;
  preferredContactChannel: string;
};
const empty: Values = {
  whatsapp: "",
  fullName: "",
  email: "",
  city: "",
  country: "",
  preferredContactChannel: "whatsapp",
};

/**
 * « Nouveau client » (board 04). The WhatsApp number is checked first with the existing search endpoint
 * (same normalisation as the server); the rest of the form opens only when no active client uses it.
 * The server keeps the final say: a 409 on create shows the existing client.
 */
export function NewCustomerSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [checked, setChecked] = useState<{
    whatsapp: string;
    matches: AdminCustomer[];
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    getValues,
    watch,
    formState,
  } = useForm<Values>({ defaultValues: empty });
  const whatsapp = watch("whatsapp");

  useEffect(() => {
    if (open) {
      reset(empty);
      setChecked(null);
      setServerError(null);
    }
  }, [open, reset]);

  // Editing the number invalidates the previous check.
  useEffect(() => {
    if (checked && normalizeWhatsapp(whatsapp.trim()) !== checked.whatsapp)
      setChecked(null);
  }, [whatsapp, checked]);

  async function check() {
    const normalized = normalizeWhatsapp(getValues("whatsapp").trim());
    if (!normalized)
      return setError("whatsapp", {
        message: "Numéro invalide : 6 à 20 chiffres, indicatif « + » accepté.",
      });
    setChecking(true);
    setServerError(null);
    try {
      const response = await customersApi.search(normalized);
      setChecked({ whatsapp: normalized, matches: response.customers });
    } catch (failure) {
      setServerError(customerErrorMessage(failure));
    } finally {
      setChecking(false);
    }
  }

  const submit = handleSubmit(async (values) => {
    if (!checked || checked.matches.length > 0) return;
    const fullName = values.fullName.trim();
    if (!fullName)
      return setError("fullName", { message: "Renseigne le nom complet." });
    const email = values.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return setError("email", { message: "Adresse e-mail invalide." });
    setServerError(null);
    try {
      const response = await customersApi.create({
        fullName,
        whatsapp: checked.whatsapp,
        email,
        city: values.city,
        country: values.country,
        preferredContactChannel: values.preferredContactChannel,
      });
      await client.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Fiche client créée.");
      onOpenChange(false);
      navigate(`/admin/clients/${response.customer.id}`);
    } catch (failure) {
      if (isAxiosError(failure) && failure.response?.status === 409) {
        await check();
        return;
      }
      setServerError(customerErrorMessage(failure));
    }
  });

  const busy = checking || formState.isSubmitting;
  const canCreate = checked !== null && checked.matches.length === 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
    >
      <SheetContent
        title="Nouveau client"
        description="Le numéro WhatsApp est vérifié d'abord pour éviter les doublons."
        footer={
          <>
            <SheetClose asChild>
              <Button variant="secondary" disabled={busy}>
                Annuler
              </Button>
            </SheetClose>
            <Button
              type="submit"
              form="new-customer-form"
              disabled={busy || !canCreate}
            >
              {formState.isSubmitting ? "Création…" : "Créer la fiche"}
            </Button>
          </>
        }
      >
        <form
          id="new-customer-form"
          onSubmit={(e) => void submit(e)}
          className="flex flex-col gap-4"
          noValidate
        >
          <Field
            label="Numéro WhatsApp"
            hint="Avec l'indicatif, ex. +241 07 41 22 18"
            error={formState.errors.whatsapp?.message}
          >
            {(p) => (
              <div className="flex gap-2">
                <Input
                  {...p}
                  type="tel"
                  autoComplete="tel"
                  maxLength={30}
                  {...register("whatsapp")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !canCreate) {
                      e.preventDefault();
                      void check();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void check()}
                  disabled={busy || !whatsapp.trim()}
                >
                  <Search /> {checking ? "Vérification…" : "Vérifier"}
                </Button>
              </div>
            )}
          </Field>

          {checked && checked.matches.length > 0 ? (
            <div
              role="status"
              className="flex flex-col gap-3 rounded-lg bg-warning-soft p-3.5"
            >
              <p className="text-[13px] font-semibold text-warning">
                Un client actif utilise déjà ce numéro.
              </p>
              {checked.matches.map((match) => (
                <div
                  key={match.id}
                  className="flex items-center gap-3 rounded-md bg-card p-3"
                >
                  <Avatar name={match.fullName} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-bold">
                      {match.fullName}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {match.whatsapp}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      onOpenChange(false);
                      navigate(`/admin/clients/${match.id}`);
                    }}
                  >
                    Ouvrir la fiche
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {canCreate ? (
            <>
              <p
                role="status"
                className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-[13px] font-semibold text-success"
              >
                <CheckCircle2 className="size-4" aria-hidden="true" /> Aucun
                client avec ce numéro - tu peux créer la fiche.
              </p>
              <Field
                label="Nom complet"
                error={formState.errors.fullName?.message}
              >
                {(p) => (
                  <Input
                    {...p}
                    autoComplete="name"
                    maxLength={200}
                    {...register("fullName")}
                  />
                )}
              </Field>
              <Field
                label="E-mail"
                optionalHint="(facultatif)"
                error={formState.errors.email?.message}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    {...register("email")}
                  />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ville" optionalHint="(facultatif)">
                  {(p) => (
                    <Input
                      {...p}
                      autoComplete="address-level2"
                      maxLength={200}
                      {...register("city")}
                    />
                  )}
                </Field>
                <Field label="Pays" optionalHint="(facultatif)">
                  {(p) => (
                    <Input
                      {...p}
                      autoComplete="country-name"
                      maxLength={200}
                      list="kfit-countries"
                      {...register("country")}
                    />
                  )}
                </Field>
              </div>
              <datalist id="kfit-countries">
                {[
                  "Gabon",
                  "Cameroun",
                  "Congo",
                  "Guinée équatoriale",
                  "Afrique du Sud",
                  "France",
                ].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <Field label="Canal de contact préféré">
                {(p) => (
                  <NativeSelect {...p} {...register("preferredContactChannel")}>
                    {Object.entries(contactChannels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </>
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
      </SheetContent>
    </Sheet>
  );
}
