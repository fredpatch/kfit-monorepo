import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import type {
  CatalogueDeliverabilityRule,
  CatalogueServiceVariant,
} from "@kfit/shared";
import {
  catalogueApiClient,
  catalogueErrorMessage,
} from "../api/catalogue-api.js";
import { deliverabilityLabels } from "../lib/catalogue-meta.js";
import { cn } from "../../lib/utils.js";

const checks: Array<{ title: string; rules: CatalogueDeliverabilityRule[] }> = [
  {
    title: "Chaque formule contient au moins une prestation",
    rules: ["service_component_missing", "variant_component_missing"],
  },
  {
    title: "Règles de l'offre et avis médical définis",
    rules: ["service_rules_missing", "medical_policy_missing"],
  },
  { title: "Prix connu pour chaque formule", rules: ["price_missing"] },
  { title: "Durée connue pour chaque formule", rules: ["duration_missing"] },
];

export const deliverabilityQueryKey = (serviceId: string) =>
  ["catalogue", "deliverability", serviceId] as const;

/** « Avant publication » (CAT-03 D6): the server's deliverability report, the same check the publish guard runs. */
export function DeliverabilityChecklist({
  serviceId,
  variants,
  published,
}: {
  serviceId: string;
  variants: CatalogueServiceVariant[];
  published: boolean;
}) {
  const query = useQuery({
    queryKey: deliverabilityQueryKey(serviceId),
    queryFn: () => catalogueApiClient.deliverability(serviceId),
  });
  if (query.isPending)
    return (
      <p role="status" className="text-[13px] text-muted-foreground">
        Vérification de l'offre…
      </p>
    );
  if (query.isError)
    return (
      <p
        role="alert"
        className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger"
      >
        {catalogueErrorMessage(query.error)}
      </p>
    );
  const { deliverable, failures } = query.data;
  const nameOf = (variantId: string | null) =>
    variantId
      ? (variants.find((v) => v.id === variantId)?.name ?? "Variante")
      : null;
  return (
    <div className="flex flex-col gap-3">
      <p
        className={cn(
          "rounded-md px-3 py-2 text-[13px] font-semibold",
          deliverable
            ? "bg-success-soft text-success"
            : "bg-warning-soft text-warning",
        )}
      >
        {deliverable
          ? "L'offre est prête à être vendue."
          : published
            ? "Offre publiée mais incomplète : elle reste en ligne, complète les points ci-dessous."
            : "À compléter avant de publier."}
      </p>
      <ul className="flex flex-col gap-2">
        {checks.map((check) => {
          const failed = failures.filter((f) => check.rules.includes(f.rule));
          return (
            <li key={check.title} className="flex gap-2.5 text-[13px]">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full",
                  failed.length
                    ? "bg-danger-soft text-danger"
                    : "bg-success-soft text-success",
                )}
              >
                {failed.length ? (
                  <X className="size-3" />
                ) : (
                  <Check className="size-3" />
                )}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">
                  {check.title}
                  <span className="sr-only">
                    {failed.length ? " : à compléter" : " : fait"}
                  </span>
                </span>
                {failed.map((f, i) => (
                  <span
                    key={`${f.rule}-${f.variantId ?? i}`}
                    className="text-muted-foreground"
                  >
                    {nameOf(f.variantId) ? `${nameOf(f.variantId)} : ` : ""}
                    {deliverabilityLabels[f.rule]}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
