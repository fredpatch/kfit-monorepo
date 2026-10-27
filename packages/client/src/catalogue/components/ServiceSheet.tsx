import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Minus, Plus } from "lucide-react";
import type {
  CatalogueAdminServiceOverview,
  CatalogueAvailabilityStatus,
  CatalogueDeliveryType,
  CatalogueDurationUnit,
  CataloguePricingMode,
} from "@kfit/shared";
import {
  catalogueApiClient,
  catalogueErrorMessage,
} from "../api/catalogue-api.js";
import {
  capacitySummary,
  isArchived,
  sinceDays,
} from "../lib/catalogue-meta.js";
import { Sheet, SheetClose, SheetContent } from "../../components/ui/dialog.js";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs.js";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input, NativeSelect, Textarea } from "../../components/ui/input.js";
import { Switch } from "../../components/ui/switch.js";
import { cn } from "../../lib/utils.js";
import { dateFr } from "../../lib/format.js";
import { ComponentsEditor } from "./ComponentsEditor.js";
import { DeliverabilityChecklist } from "./DeliverabilityChecklist.js";
import { RulesEditor } from "./RulesEditor.js";
import { VariantsEditor } from "./VariantsEditor.js";

/** Refresh admin lists and the public catalogue after any change. */
export function useCatalogueRefresh() {
  const client = useQueryClient();
  return () =>
    Promise.all([client.invalidateQueries({ queryKey: ["catalogue"] })]);
}

type SheetTab = "availability" | "content" | "variants" | "rules" | "checklist";

const availabilityChoices: Array<{
  value: Exclude<CatalogueAvailabilityStatus, "archived">;
  title: string;
  hint: string;
}> = [
  { value: "open", title: "Ouverte", hint: "Demandes directes" },
  {
    value: "waitlist_only",
    title: "Liste d'attente",
    hint: "Inscriptions en attente",
  },
  { value: "temporarily_closed", title: "Fermée", hint: "Temporairement" },
];

type AvailabilityValues = {
  availabilityStatus: Exclude<CatalogueAvailabilityStatus, "archived">;
  limited: boolean;
  capacityLimit: number;
  waitlistEnabled: boolean;
  isPublic: boolean;
};
type ContentValues = {
  name: string;
  slug: string;
  description: string;
  pricingMode: CataloguePricingMode;
  basePriceXaf: string;
  deliveryType: CatalogueDeliveryType;
  durationValue: string;
  durationUnit: CatalogueDurationUnit | "";
};

function ServerError({ message }: { message: string | null }) {
  return message ? (
    <p
      role="alert"
      className="rounded-md bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger"
    >
      {message}
    </p>
  ) : null;
}

/** Offer drawer (board 06): Disponibilité · Contenu · Variantes · Règles · Avant publication (CAT-03b). */
export function ServiceSheet({
  service,
  position,
  total,
  open,
  onOpenChange,
}: {
  service: CatalogueAdminServiceOverview | null;
  position: number;
  total: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const refresh = useCatalogueRefresh();
  const [tab, setTab] = useState<SheetTab>("availability");
  const [serverError, setServerError] = useState<string | null>(null);
  const availability = useForm<AvailabilityValues>();
  const content = useForm<ContentValues>();
  const archived = service ? isArchived(service) : true;

  useEffect(() => {
    if (!open || !service) return;
    setTab("availability");
    setServerError(null);
    availability.reset({
      availabilityStatus:
        service.availabilityStatus === "archived"
          ? "temporarily_closed"
          : service.availabilityStatus,
      limited: service.capacityMode === "limited",
      capacityLimit:
        service.capacityLimit ?? Math.max(1, service.occupancy.occupied),
      waitlistEnabled: service.waitlistEnabled,
      isPublic: service.isPublic,
    });
    content.reset({
      name: service.name,
      slug: service.slug,
      description: service.description ?? "",
      pricingMode: service.pricingMode,
      basePriceXaf: service.basePriceXaf?.toString() ?? "",
      deliveryType: service.deliveryType,
      durationValue: service.defaultDurationValue?.toString() ?? "",
      durationUnit: service.defaultDurationUnit ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service?.id, service?.updatedAt]);

  if (!service) return null;
  const a = availability.watch();
  const occupied = service.occupancy.occupied;
  const belowOccupied =
    a.limited &&
    Number.isInteger(a.capacityLimit) &&
    a.capacityLimit > 0 &&
    a.capacityLimit < occupied;
  const busy =
    availability.formState.isSubmitting || content.formState.isSubmitting;
  const editable = !archived && (tab === "availability" || tab === "content");

  const saveAvailability = availability.handleSubmit(async (v) => {
    if (
      v.limited &&
      (!Number.isInteger(v.capacityLimit) || v.capacityLimit <= 0)
    )
      return availability.setError("capacityLimit", {
        message: "Nombre de places entier, au moins 1.",
      });
    if (v.availabilityStatus === "waitlist_only" && !v.waitlistEnabled)
      return availability.setError("waitlistEnabled", {
        message: "Active la liste d'attente pour l'état « Liste d'attente ».",
      });
    setServerError(null);
    try {
      await catalogueApiClient.updateAdminServiceCapacity(service.id, {
        availabilityStatus: v.availabilityStatus,
        capacityMode: v.limited ? "limited" : "unlimited",
        capacityLimit: v.limited ? v.capacityLimit : null,
        waitlistEnabled: v.waitlistEnabled,
      });
      if (service.publishedAt && v.isPublic !== service.isPublic)
        await catalogueApiClient.updateAdminService(service.id, {
          isPublic: v.isPublic,
        });
      await refresh();
      toast.success("Disponibilité mise à jour.");
      onOpenChange(false);
    } catch (failure) {
      setServerError(catalogueErrorMessage(failure));
    }
  });

  const saveContent = content.handleSubmit(async (v) => {
    const name = v.name.trim();
    if (!name)
      return content.setError("name", { message: "Renseigne le nom." });
    const slug = v.slug.trim();
    if (!service.publishedAt && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      return content.setError("slug", {
        message: "Lettres minuscules, chiffres et tirets uniquement.",
      });
    const price = v.basePriceXaf.trim() === "" ? null : Number(v.basePriceXaf);
    if (price !== null && !(Number.isInteger(price) && price >= 0))
      return content.setError("basePriceXaf", {
        message: "Montant entier en XAF.",
      });
    const duration =
      v.durationValue.trim() === "" ? null : Number(v.durationValue);
    if (duration !== null && !(Number.isInteger(duration) && duration > 0))
      return content.setError("durationValue", {
        message: "Durée entière, au moins 1.",
      });
    if (duration !== null && !v.durationUnit)
      return content.setError("durationUnit", { message: "Choisis l'unité." });
    setServerError(null);
    try {
      await catalogueApiClient.updateAdminService(service.id, {
        name,
        // The slug is frozen once published (decision 2026-10-22: links already shared stay valid).
        ...(!service.publishedAt && slug !== service.slug ? { slug } : {}),
        description: v.description.trim() || null,
        pricingMode: v.pricingMode,
        basePriceXaf: price,
        deliveryType: v.deliveryType,
        defaultDurationValue: duration,
        defaultDurationUnit: duration === null ? null : v.durationUnit,
      });
      await refresh();
      toast.success("Contenu mis à jour.");
      onOpenChange(false);
    } catch (failure) {
      setServerError(catalogueErrorMessage(failure));
    }
  });

  const capacity = capacitySummary(service);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
    >
      <SheetContent
        title={service.name}
        description={`/${service.slug}${service.publishedAt ? ` · publiée le ${dateFr(service.publishedAt)}` : " · brouillon"}${archived ? " · archivée" : ""}`}
        className="max-w-[560px]"
        footer={
          editable ? (
            <>
              <SheetClose asChild>
                <Button variant="secondary" disabled={busy}>
                  Annuler
                </Button>
              </SheetClose>
              <Button
                onClick={() =>
                  void (tab === "availability"
                    ? saveAvailability()
                    : saveContent())
                }
                disabled={busy}
              >
                {busy ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </>
          ) : (
            <SheetClose asChild>
              <Button variant="secondary">Fermer</Button>
            </SheetClose>
          )
        }
      >
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as SheetTab);
            setServerError(null);
          }}
          className="flex flex-col gap-5"
        >
          <TabsList
            aria-label="Sections de l'offre"
            className="overflow-x-auto"
          >
            <TabsTrigger value="availability">Disponibilité</TabsTrigger>
            <TabsTrigger value="content">Contenu</TabsTrigger>
            <TabsTrigger value="variants">
              Variantes · {service.variants.length}
            </TabsTrigger>
            <TabsTrigger value="rules">Règles</TabsTrigger>
            <TabsTrigger value="checklist">Avant publication</TabsTrigger>
          </TabsList>

          <TabsContent value="availability" className="flex flex-col gap-5">
            {archived ? (
              <p className="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
                Offre archivée : lecture seule.
              </p>
            ) : null}
            <fieldset disabled={archived} className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-bold">
                Disponibilité commerciale
              </legend>
              <Controller
                control={availability.control}
                name="availabilityStatus"
                render={({ field }) => (
                  <div
                    role="radiogroup"
                    aria-label="Disponibilité"
                    className="grid grid-cols-3 gap-2"
                  >
                    {availabilityChoices.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        role="radio"
                        aria-checked={field.value === c.value}
                        onClick={() => field.onChange(c.value)}
                        className={cn(
                          "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                          field.value === c.value
                            ? "border-primary bg-[#f5faf2] ring-1 ring-primary"
                            : "border-border hover:border-input",
                        )}
                      >
                        <span className="text-sm font-bold">{c.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              />
            </fieldset>

            <fieldset
              disabled={archived}
              className="flex flex-col gap-3 rounded-xl border border-border p-4"
            >
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold">Capacité limitée</span>
                <Controller
                  control={availability.control}
                  name="limited"
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label="Capacité limitée"
                    />
                  )}
                />
              </label>
              {a.limited ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-muted-foreground">
                      Nombre de places
                    </span>
                    <Controller
                      control={availability.control}
                      name="capacityLimit"
                      render={({ field }) => (
                        <span className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon-sm"
                            aria-label="Une place de moins"
                            onClick={() =>
                              field.onChange(
                                Math.max(1, (field.value || 1) - 1),
                              )
                            }
                          >
                            <Minus />
                          </Button>
                          <Input
                            aria-label="Nombre de places"
                            inputMode="numeric"
                            className="h-8 w-16 text-center tabular-nums"
                            value={
                              Number.isFinite(field.value) ? field.value : ""
                            }
                            onChange={(e) =>
                              field.onChange(
                                Number(e.target.value.replace(/[^0-9]/g, "")),
                              )
                            }
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon-sm"
                            aria-label="Une place de plus"
                            onClick={() =>
                              field.onChange((field.value || 0) + 1)
                            }
                          >
                            <Plus />
                          </Button>
                        </span>
                      )}
                    />
                  </div>
                  {availability.formState.errors.capacityLimit ? (
                    <p role="alert" className="text-xs text-danger">
                      {availability.formState.errors.capacityLimit.message}
                    </p>
                  ) : null}
                </>
              ) : null}
              <p className="text-[13px]">
                <strong className="tabular-nums">
                  {occupied}
                  {a.limited && a.capacityLimit ? ` / ${a.capacityLimit}` : ""}
                </strong>{" "}
                place(s) occupée(s)
                {a.limited && a.capacityLimit && occupied >= a.capacityLimit ? (
                  <span className="font-semibold text-danger"> · complète</span>
                ) : null}
                {service.occupancy.reservedOnboarding ? (
                  <span className="block text-xs text-muted-foreground">
                    dont {service.occupancy.reservedOnboarding} réservation(s)
                    en préparation
                  </span>
                ) : null}
              </p>
              {belowOccupied ? (
                <p
                  role="status"
                  className="flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning"
                >
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  {occupied} places occupées : la nouvelle limite (
                  {a.capacityLimit}) bloque les nouvelles réservations jusqu'à
                  ce que des places se libèrent. Personne n'est retiré.
                </p>
              ) : null}
            </fieldset>

            <fieldset
              disabled={archived}
              className="flex flex-col gap-2 rounded-xl border border-border p-4"
            >
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold">
                  Autoriser la liste d'attente
                </span>
                <Controller
                  control={availability.control}
                  name="waitlistEnabled"
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label="Autoriser la liste d'attente"
                    />
                  )}
                />
              </label>
              <p className="text-[13px] text-muted-foreground">
                {service.waitlist.active
                  ? `${service.waitlist.active} personne(s) en attente · la plus ancienne ${sinceDays(service.waitlist.oldestEnteredAt)}`
                  : "Personne en attente."}
              </p>
              {availability.formState.errors.waitlistEnabled ? (
                <p role="alert" className="text-xs text-danger">
                  {availability.formState.errors.waitlistEnabled.message}
                </p>
              ) : null}
            </fieldset>

            {service.publishedAt && !archived ? (
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
                <span className="flex flex-col">
                  <span className="text-sm font-bold">
                    Visible sur la page publique
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Position {position} sur {total}
                  </span>
                </span>
                <Controller
                  control={availability.control}
                  name="isPublic"
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label="Visible sur la page publique"
                    />
                  )}
                />
              </label>
            ) : null}
            <span className="sr-only">{capacity.text}</span>
          </TabsContent>

          <TabsContent value="content" className="flex flex-col gap-4">
            <fieldset disabled={archived} className="flex flex-col gap-4">
              <Field label="Nom" error={content.formState.errors.name?.message}>
                {(p) => (
                  <Input {...p} maxLength={200} {...content.register("name")} />
                )}
              </Field>
              <Field
                label="Adresse (slug)"
                error={content.formState.errors.slug?.message}
                hint={
                  service.publishedAt
                    ? "Fixée après publication pour ne pas casser les liens partagés."
                    : "Modifiable tant que l'offre n'est pas publiée."
                }
              >
                {(p) =>
                  service.publishedAt ? (
                    <Input {...p} value={service.slug} readOnly disabled />
                  ) : (
                    <Input
                      {...p}
                      maxLength={80}
                      {...content.register("slug")}
                    />
                  )
                }
              </Field>
              <Field label="Description" optionalHint="(facultatif)">
                {(p) => (
                  <Textarea
                    {...p}
                    rows={4}
                    {...content.register("description")}
                  />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tarification">
                  {(p) => (
                    <NativeSelect {...p} {...content.register("pricingMode")}>
                      <option value="fixed">Prix fixe</option>
                      <option value="quote">Sur devis</option>
                    </NativeSelect>
                  )}
                </Field>
                <Field
                  label="Prix de base (XAF)"
                  {...(content.watch("pricingMode") === "quote"
                    ? { optionalHint: "(facultatif)" }
                    : {})}
                  error={content.formState.errors.basePriceXaf?.message}
                >
                  {(p) => (
                    <Input
                      {...p}
                      inputMode="numeric"
                      {...content.register("basePriceXaf")}
                    />
                  )}
                </Field>
              </div>
              <Field label="Type de prestation">
                {(p) => (
                  <NativeSelect {...p} {...content.register("deliveryType")}>
                    <option value="time_based">
                      Sur une durée (abonnement)
                    </option>
                    <option value="one_time">Ponctuelle</option>
                  </NativeSelect>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Durée par défaut"
                  optionalHint="(facultatif)"
                  error={content.formState.errors.durationValue?.message}
                >
                  {(p) => (
                    <Input
                      {...p}
                      inputMode="numeric"
                      {...content.register("durationValue")}
                    />
                  )}
                </Field>
                <Field
                  label="Unité"
                  error={content.formState.errors.durationUnit?.message}
                >
                  {(p) => (
                    <NativeSelect {...p} {...content.register("durationUnit")}>
                      <option value="">-</option>
                      <option value="day">Jours</option>
                      <option value="week">Semaines</option>
                      <option value="month">Mois</option>
                    </NativeSelect>
                  )}
                </Field>
              </div>
            </fieldset>
            <section
              className="flex flex-col gap-2 border-t border-border-subtle pt-4"
              aria-labelledby="included-title"
            >
              <h3 id="included-title" className="text-sm font-bold">
                Prestations incluses dans l'offre
              </h3>
              <p className="text-xs text-muted-foreground">
                Communes à toutes les variantes. Une modification vaut pour les
                nouvelles ventes ; les abonnements déjà vendus gardent leur
                contenu.
              </p>
              <ComponentsEditor
                key={service.id}
                serviceId={service.id}
                variantId={null}
                components={service.components}
                disabled={archived}
              />
            </section>
          </TabsContent>

          <TabsContent value="variants" className="flex flex-col gap-3">
            {archived ? (
              <p className="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
                Offre archivée : lecture seule.
              </p>
            ) : null}
            <VariantsEditor
              key={service.id}
              service={service}
              disabled={archived}
            />
          </TabsContent>

          <TabsContent value="rules" className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Règles de l'offre, appliquées à chaque variante qui n'a pas les
              siennes (onglet Variantes).
            </p>
            <RulesEditor
              key={service.id}
              serviceId={service.id}
              variantId={null}
              policy={service.policy}
              disabled={archived}
            />
          </TabsContent>

          <TabsContent value="checklist" className="flex flex-col gap-3">
            <DeliverabilityChecklist
              serviceId={service.id}
              variants={service.variants}
              published={service.publishedAt !== null}
            />
          </TabsContent>
        </Tabs>
        <ServerError message={serverError} />
      </SheetContent>
    </Sheet>
  );
}
