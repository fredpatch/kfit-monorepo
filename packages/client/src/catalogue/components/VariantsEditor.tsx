import { useState, type FormEvent } from "react";
import type {
  CatalogueAdminServiceOverview,
  CatalogueAvailabilityStatus,
  CatalogueDurationUnit,
  CatalogueServiceVariant,
} from "@kfit/shared";
import { catalogueApiClient } from "../api/catalogue-api.js";
import {
  durationText,
  medicalPolicyLabels,
  slugify,
} from "../lib/catalogue-meta.js";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input, NativeSelect } from "../../components/ui/input.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { availabilityStatus } from "../../lib/status-map.js";
import { moneyXaf } from "../../lib/format.js";
import { ActionError, useContentAction } from "./content-action.js";
import { ComponentsEditor } from "./ComponentsEditor.js";
import { RulesEditor } from "./RulesEditor.js";

type Status = Exclude<CatalogueAvailabilityStatus, "archived">;
const statuses: Array<[Status, string]> = [
  ["open", "Ouverte"],
  ["waitlist_only", "Liste d'attente"],
  ["temporarily_closed", "Fermée"],
];
type Draft = {
  name: string;
  slug: string;
  price: string;
  durationValue: string;
  durationUnit: CatalogueDurationUnit | "";
  capacityLimit: string;
  availabilityStatus: Status;
  sortOrder: string;
};
const blank: Draft = {
  name: "",
  slug: "",
  price: "",
  durationValue: "",
  durationUnit: "",
  capacityLimit: "",
  availabilityStatus: "open",
  sortOrder: "0",
};
const toDraft = (v: CatalogueServiceVariant): Draft => ({
  name: v.name,
  slug: v.slug,
  price: v.priceXaf?.toString() ?? "",
  durationValue: v.durationValue?.toString() ?? "",
  durationUnit: v.durationUnit ?? "",
  capacityLimit: v.capacityLimit?.toString() ?? "",
  availabilityStatus:
    v.availabilityStatus === "archived"
      ? "temporarily_closed"
      : v.availabilityStatus,
  sortOrder: "",
});
const integerOrNull = (value: string) =>
  value.trim() === "" ? null : Number(value);
const digits = (value: string) => value.replace(/[^0-9]/g, "");

function VariantForm({
  service,
  variant,
  onClose,
}: {
  service: CatalogueAdminServiceOverview;
  variant: CatalogueServiceVariant | null;
  onClose: () => void;
}) {
  const { busy, error, setError, run } = useContentAction();
  const [draft, setDraft] = useState<Draft>(() =>
    variant
      ? toDraft(variant)
      : { ...blank, sortOrder: String(service.variants.length) },
  );
  const [slugTouched, setSlugTouched] = useState(variant !== null);
  const set = (patch: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = integerOrNull(draft.price),
      duration = integerOrNull(draft.durationValue),
      capacity = integerOrNull(draft.capacityLimit),
      sortOrder = Number(draft.sortOrder || "0");
    if (!draft.name.trim()) return setError("Renseigne le nom de la variante.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug))
      return setError(
        "Adresse invalide : lettres minuscules, chiffres et tirets uniquement.",
      );
    if ((duration === null) !== (draft.durationUnit === ""))
      return setError("Indique la durée et son unité, ou aucune des deux.");
    if (duration !== null && duration < 1)
      return setError("La durée doit être d'au moins 1.");
    if (capacity !== null && capacity < 1)
      return setError("Le nombre de places doit être d'au moins 1.");
    // The overview does not carry the stored order, so an edit never sends one (it would overwrite it).
    const input = {
      name: draft.name.trim(),
      slug: draft.slug,
      priceXaf: price,
      durationValue: duration,
      durationUnit: draft.durationUnit || null,
      capacityLimit: capacity,
      availabilityStatus: draft.availabilityStatus,
      ...(variant ? {} : { sortOrder }),
    };
    const done = await run(
      () =>
        variant
          ? catalogueApiClient.updateVariant(service.id, variant.id, input)
          : catalogueApiClient.createVariant(service.id, input),
      variant ? "Variante mise à jour." : "Variante ajoutée.",
    );
    if (done) onClose();
  }

  return (
    <form
      onSubmit={(e) => void save(e)}
      className="flex flex-col gap-3 rounded-lg border border-primary/40 p-3"
    >
      <fieldset disabled={busy} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nom">
            {(p) => (
              <Input
                {...p}
                maxLength={200}
                value={draft.name}
                onChange={(e) =>
                  set({
                    name: e.target.value,
                    ...(slugTouched ? {} : { slug: slugify(e.target.value) }),
                  })
                }
              />
            )}
          </Field>
          <Field label="Adresse (slug)">
            {(p) => (
              <Input
                {...p}
                maxLength={80}
                value={draft.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set({ slug: e.target.value });
                }}
              />
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix (XAF)" optionalHint="(vide : prix de l'offre)">
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                value={draft.price}
                onChange={(e) => set({ price: digits(e.target.value) })}
              />
            )}
          </Field>
          <Field label="Places" optionalHint="(vide : capacité de l'offre)">
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                value={draft.capacityLimit}
                onChange={(e) => set({ capacityLimit: digits(e.target.value) })}
              />
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Durée" optionalHint="(vide : durée de l'offre)">
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                value={draft.durationValue}
                onChange={(e) => set({ durationValue: digits(e.target.value) })}
              />
            )}
          </Field>
          <Field label="Unité">
            {(p) => (
              <NativeSelect
                {...p}
                value={draft.durationUnit}
                onChange={(e) =>
                  set({ durationUnit: e.target.value as Draft["durationUnit"] })
                }
              >
                <option value="">-</option>
                <option value="day">Jours</option>
                <option value="week">Semaines</option>
                <option value="month">Mois</option>
              </NativeSelect>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Disponibilité">
            {(p) => (
              <NativeSelect
                {...p}
                value={draft.availabilityStatus}
                onChange={(e) =>
                  set({ availabilityStatus: e.target.value as Status })
                }
              >
                {statuses.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          {variant ? null : (
            <Field label="Position">
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  value={draft.sortOrder}
                  onChange={(e) => set({ sortOrder: digits(e.target.value) })}
                />
              )}
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" size="sm">
            {busy ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </fieldset>
      <ActionError message={error} />
    </form>
  );
}

function rulesSummary(v: CatalogueServiceVariant): string {
  if (!v.policy) return "Suit les règles de l'offre.";
  const p = v.policy;
  return (
    [
      p.followUpFrequencyDays
        ? `suivi tous les ${p.followUpFrequencyDays} j`
        : null,
      p.lateCancelNoticeHours
        ? `annulation < ${p.lateCancelNoticeHours} h`
        : null,
      p.medicalClearancePolicy
        ? `avis médical : ${medicalPolicyLabels[p.medicalClearancePolicy as keyof typeof medicalPolicyLabels] ?? p.medicalClearancePolicy}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Règles propres (le reste comme l'offre)."
  );
}

/** « Variantes » (CAT-03 D1): formulas of the offer. Archive only: sold subscriptions keep their variant. */
export function VariantsEditor({
  service,
  disabled,
}: {
  service: CatalogueAdminServiceOverview;
  disabled: boolean;
}) {
  const { busy, error, run } = useContentAction();
  const [open, setOpen] = useState<
    | { id: string; mode: "details" | "edit" | "rules" | "archive" }
    | "new"
    | null
  >(null);
  const toggle = (id: string, mode: "details" | "edit" | "rules" | "archive") =>
    setOpen((current) =>
      current !== "new" && current?.id === id && current.mode === mode
        ? null
        : { id, mode },
    );

  return (
    <div className="flex flex-col gap-3">
      {service.variants.length === 0 && open !== "new" ? (
        <p className="text-[13px] text-muted-foreground">
          Aucune variante : l'offre se vend telle quelle, avec ses propres
          prestations.
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {service.variants.map((v) => {
          const occ = service.occupancy.byVariant.find(
            (o) => o.variantId === v.id,
          );
          const mode = open !== "new" && open?.id === v.id ? open.mode : null;
          return (
            <li
              key={v.id}
              className="flex flex-col gap-2 rounded-lg border border-border p-3.5"
            >
              <span className="flex items-center justify-between gap-2">
                <strong className="text-sm">{v.name}</strong>
                <StatusPill
                  size="sm"
                  status={availabilityStatus[v.availabilityStatus]}
                />
              </span>
              <span className="text-[13px] text-muted-foreground">
                {v.priceXaf !== null ? moneyXaf(v.priceXaf) : "Prix de l'offre"}
                {durationText(v.durationValue, v.durationUnit)
                  ? ` · ${durationText(v.durationValue, v.durationUnit)}`
                  : ""}
                {` · ${occ?.occupied ?? 0}${v.capacityLimit !== null ? ` / ${v.capacityLimit}` : ""} place(s) occupée(s)`}
                {` · ${v.components.length} prestation(s) propre(s)`}
              </span>
              <span className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggle(v.id, "details")}
                  aria-expanded={mode === "details"}
                >
                  Prestations
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggle(v.id, "rules")}
                  aria-expanded={mode === "rules"}
                >
                  Règles
                </Button>
                {disabled ? null : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggle(v.id, "edit")}
                  >
                    Modifier
                  </Button>
                )}
                {disabled ? null : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggle(v.id, "archive")}
                  >
                    Archiver
                  </Button>
                )}
              </span>
              {mode === "edit" ? (
                <VariantForm
                  service={service}
                  variant={v}
                  onClose={() => setOpen(null)}
                />
              ) : null}
              {mode === "details" ? (
                <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-2">
                  <p className="text-xs text-muted-foreground">
                    Prestations propres à cette variante, en plus des
                    prestations communes de l'offre ({service.components.length}
                    ).
                  </p>
                  <ComponentsEditor
                    serviceId={service.id}
                    variantId={v.id}
                    components={v.components}
                    disabled={disabled}
                  />
                </div>
              ) : null}
              {mode === "rules" ? (
                <div className="flex flex-col gap-2 border-t border-border-subtle pt-2">
                  <p className="text-[13px]">{rulesSummary(v)}</p>
                  {v.policy && !disabled ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="self-start"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            catalogueApiClient.removeVariantRules(
                              service.id,
                              v.id,
                            ),
                          "La variante suit à nouveau les règles de l'offre.",
                        )
                      }
                    >
                      Revenir aux règles de l'offre
                    </Button>
                  ) : null}
                  <RulesEditor
                    serviceId={service.id}
                    variantId={v.id}
                    policy={v.policy}
                    disabled={disabled}
                  />
                  <ActionError message={error} />
                </div>
              ) : null}
              {mode === "archive" ? (
                <div className="flex flex-col gap-2 rounded-md bg-warning-soft p-3 text-[13px]">
                  <p>
                    Archiver « {v.name} » ? Elle disparaît de la page publique
                    et ne peut plus être vendue. Les {occ?.occupied ?? 0}{" "}
                    abonnement(s) en cours la gardent.
                  </p>
                  <span className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setOpen(null)}
                    >
                      Garder
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive-solid"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            catalogueApiClient.archiveVariant(service.id, v.id),
                          "Variante archivée.",
                        ).then((done) => done && setOpen(null))
                      }
                    >
                      Archiver
                    </Button>
                  </span>
                  <ActionError message={error} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {open === "new" ? (
        <VariantForm
          service={service}
          variant={null}
          onClose={() => setOpen(null)}
        />
      ) : disabled ? null : (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={() => setOpen("new")}
        >
          Ajouter une variante
        </Button>
      )}
    </div>
  );
}
