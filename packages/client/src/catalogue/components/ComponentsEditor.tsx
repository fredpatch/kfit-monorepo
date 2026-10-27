import { useState, type FormEvent } from "react";
import {
  catalogueComponentTypes,
  type CatalogueComponentType,
  type CatalogueServiceComponent,
} from "@kfit/shared";
import { catalogueApiClient } from "../api/catalogue-api.js";
import { componentTypeLabels } from "../lib/catalogue-meta.js";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input, NativeSelect } from "../../components/ui/input.js";
import { Switch } from "../../components/ui/switch.js";
import { ActionError, useContentAction } from "./content-action.js";

type Draft = {
  componentType: CatalogueComponentType;
  label: string;
  quantity: string;
  isMandatory: boolean;
};
const emptyDraft: Draft = {
  componentType: "appointment",
  label: "",
  quantity: "1",
  isMandatory: true,
};

/**
 * « Prestations incluses » of one scope: the offer (variantId null) or one variant (CAT-03 D2).
 * Removing a prestation archives it: sold subscriptions keep their copy, new sales no longer include it.
 */
export function ComponentsEditor({
  serviceId,
  variantId,
  components,
  disabled,
}: {
  serviceId: string;
  variantId: string | null;
  components: CatalogueServiceComponent[];
  disabled: boolean;
}) {
  const { busy, error, setError, run } = useContentAction();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  function open(target: CatalogueServiceComponent | "new") {
    setError(null);
    setRemoving(null);
    setEditing(target === "new" ? "new" : target.id);
    setDraft(
      target === "new"
        ? emptyDraft
        : {
            componentType: target.componentType as CatalogueComponentType,
            label: target.label,
            quantity: String(target.quantity),
            isMandatory: target.isMandatory,
          },
    );
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(draft.quantity);
    if (!draft.label.trim())
      return setError("Renseigne le libellé de la prestation.");
    if (!Number.isInteger(quantity) || quantity < 1)
      return setError("La quantité doit être un entier d'au moins 1.");
    const input = {
      componentType: draft.componentType,
      label: draft.label.trim(),
      quantity,
      isMandatory: draft.isMandatory,
    };
    const done = await run(
      () =>
        editing === "new"
          ? catalogueApiClient.createComponent(serviceId, {
              ...input,
              variantId,
            })
          : catalogueApiClient.updateComponent(serviceId, editing!, input),
      editing === "new" ? "Prestation ajoutée." : "Prestation mise à jour.",
    );
    if (done) setEditing(null);
  }

  const form = (
    <form
      onSubmit={(e) => void save(e)}
      className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-card p-3"
    >
      <fieldset disabled={busy} className="flex flex-col gap-3">
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <Field label="Libellé">
            {(p) => (
              <Input
                {...p}
                maxLength={200}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            )}
          </Field>
          <Field label="Quantité">
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                value={draft.quantity}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    quantity: e.target.value.replace(/[^0-9]/g, ""),
                  })
                }
              />
            )}
          </Field>
        </div>
        <Field label="Type">
          {(p) => (
            <NativeSelect
              {...p}
              value={draft.componentType}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  componentType: e.target.value as CatalogueComponentType,
                })
              }
            >
              {catalogueComponentTypes.map((type) => (
                <option key={type} value={type}>
                  {componentTypeLabels[type]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <label className="flex items-center justify-between gap-3 text-[13px] font-semibold">
          Incluse d'office
          <Switch
            checked={draft.isMandatory}
            onCheckedChange={(v) => setDraft({ ...draft, isMandatory: v })}
            aria-label="Incluse d'office"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setEditing(null)}
          >
            Annuler
          </Button>
          <Button type="submit" size="sm">
            {busy ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </fieldset>
    </form>
  );

  return (
    <div className="flex flex-col gap-2">
      {components.length === 0 && editing !== "new" ? (
        <p className="text-[13px] text-muted-foreground">Aucune prestation.</p>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {components.map((c) =>
          editing === c.id ? (
            <li key={c.id}>{form}</li>
          ) : (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px]"
            >
              <span className="min-w-0 flex-1">
                <strong>
                  {c.quantity} × {c.label}
                </strong>
                <span className="text-muted-foreground">
                  {" "}
                  ·{" "}
                  {componentTypeLabels[
                    c.componentType as CatalogueComponentType
                  ] ?? c.componentType}
                  {c.isMandatory ? "" : " · optionnelle"}
                </span>
              </span>
              {disabled ? null : removing === c.id ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setRemoving(null)}
                  >
                    Garder
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          catalogueApiClient.archiveComponent(serviceId, c.id),
                        "Prestation retirée des nouvelles ventes.",
                      ).then(() => setRemoving(null))
                    }
                  >
                    Confirmer le retrait
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || editing !== null}
                    onClick={() => open(c)}
                  >
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || editing !== null}
                    onClick={() => setRemoving(c.id)}
                  >
                    Retirer
                  </Button>
                </>
              )}
            </li>
          ),
        )}
      </ul>
      {removing ? (
        <p className="text-xs text-muted-foreground">
          Les abonnements déjà vendus gardent cette prestation ; elle ne sera
          plus incluse dans les nouvelles ventes.
        </p>
      ) : null}
      {editing === "new" ? (
        form
      ) : !disabled ? (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          disabled={busy || editing !== null}
          onClick={() => open("new")}
        >
          Ajouter une prestation
        </Button>
      ) : null}
      <ActionError message={error} />
    </div>
  );
}
