import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  optionalConsentTypes,
  requiredConsentTypes,
  type ConsentDecisions,
  type ConsentDefinition,
  type ConsentDetail,
  type ConsentLinkState,
  type ConsentRequestLinkState,
  type ConsentType,
  type OptionalConsentState,
  type OptionalConsentType,
} from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Field } from "../../components/ui/field.js";
import { Card, CardHeader, CardTitle } from "../../components/ui/card.js";
import { Pill, StatusPill } from "../../components/ui/status-pill.js";
import {
  Dialog,
  DialogContent,
  Sheet,
  SheetContent,
} from "../../components/ui/dialog.js";
import type { StatusDescriptor } from "../../lib/status-map.js";
import { cn } from "../../lib/utils.js";
import {
  dateTimeFr,
  fromLocalInput,
  shortDateFr,
  toLocalInput,
} from "../../lib/format.js";
import { focusReturnTarget } from "../../lib/focus.js";
import {
  consentApi,
  consentErrorMessage,
} from "../../consents/api/consent-api.js";
import {
  questionnaireApi,
  questionnaireErrorMessage,
} from "../../questionnaires/api/questionnaire-api.js";
import { OneTimeLink } from "../payments/OneTimeLink.js";
import { CoachQuestionnaireForm } from "./CoachQuestionnaireForm.js";
import { AnswersSheet } from "./AnswersSheet.js";

/**
 * « Santé et consentements » tab (board 14d, UX-14b). Required documents: link and coach-assisted capture
 * only while the subscription is in preparation, and they must be published first. Optional accords
 * (CONS-02): requested or captured while onboarding, active or paused (the server decides). A withdrawal
 * is always possible for optional consents and stays in the history.
 */
const labels: Record<ConsentType, string> = {
  service_terms: "Conditions de service",
  privacy_notice: "Confidentialité",
  health_data: "Données de santé",
  progress_photo_storage: "Conservation des photos de suivi",
  marketing: "Communication commerciale",
  publication: "Publication",
};
const decisions: Record<string, StatusDescriptor> = {
  granted: { label: "Accord", tone: "success" },
  refused: { label: "Refus", tone: "neutral" },
  revoked: { label: "Retiré", tone: "warning" },
};
const optionalStates: Record<OptionalConsentState, StatusDescriptor> = {
  granted: { label: "Accord", tone: "success" },
  refused: { label: "Refus", tone: "neutral" },
  revoked: { label: "Retiré", tone: "warning" },
  renewal_required: { label: "Accord à renouveler", tone: "warning" },
  none: { label: "Aucune décision", tone: "neutral" },
};
const defaultRequest: OptionalConsentType[] = [
  "health_data",
  "progress_photo_storage",
];
const latestPublished = (
  view: ConsentDetail | undefined,
  types: readonly ConsentType[],
): ConsentDefinition[] =>
  view
    ? types.flatMap((type) =>
        view.definitions
          .filter((d) => d.consentType === type && d.status === "published")
          .sort((a, b) => (BigInt(a.version) > BigInt(b.version) ? -1 : 1))
          .slice(0, 1),
      )
    : [];
const linkLabel = (link: ConsentRequestLinkState) =>
  link.kind === "optional"
    ? link.types.map((t) => labels[t]).join(", ")
    : "Conditions et confidentialité";
const linkStates: Record<ConsentLinkState["state"], StatusDescriptor> = {
  available: { label: "Actif", tone: "info" },
  consumed: { label: "Utilisé", tone: "success" },
  expired: { label: "Expiré", tone: "neutral" },
  revoked: { label: "Révoqué", tone: "neutral" },
  stale: { label: "Versions remplacées", tone: "neutral" },
};
const inSevenDays = () => toLocalInput(new Date(Date.now() + 7 * 86_400_000));

type Dialogs =
  | { kind: "consent-link" }
  | { kind: "optional-link" }
  | { kind: "questionnaire-link" }
  | { kind: "revoke"; type: ConsentType }
  | { kind: "links"; which: "consent" | "questionnaire" };

export function HealthTab({
  subscriptionId,
  editable,
  optionalEditable,
}: {
  subscriptionId: string;
  editable: boolean;
  optionalEditable: boolean;
}) {
  const client = useQueryClient();
  const consents = useQuery({
    queryKey: ["consents", subscriptionId],
    queryFn: () => consentApi.get(subscriptionId),
    refetchInterval: 30_000,
  });
  const questionnaire = useQuery({
    queryKey: ["questionnaire", subscriptionId],
    queryFn: () => questionnaireApi.get(subscriptionId),
    refetchInterval: 30_000,
  });
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const [sheet, setSheet] = useState<
    "consents" | "optional" | "questionnaire" | null
  >(null);
  const [answersFor, setAnswersFor] = useState<{
    id: string;
    revisionNumber: number;
  } | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const refresh = () =>
    Promise.allSettled([
      client.invalidateQueries({ queryKey: ["consents", subscriptionId] }),
      client.invalidateQueries({ queryKey: ["questionnaire", subscriptionId] }),
      client.invalidateQueries({ queryKey: ["onboarding", subscriptionId] }),
    ]);
  function remember() {
    opener.current = focusReturnTarget();
  }
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
  };

  const view = consents.data?.consents;
  const definitions = latestPublished(view, requiredConsentTypes);
  const optionalDefinitions = latestPublished(view, optionalConsentTypes);
  const canIssueConsent =
    editable && definitions.length === requiredConsentTypes.length;
  const canRequestOptional = optionalEditable && optionalDefinitions.length > 0;
  const q = questionnaire.data?.questionnaire;
  const doc = q?.document ?? null;
  const qActive = (q?.links ?? []).filter((l) => l.state === "available");
  const current = q?.history.find((r) => r.isCurrent);

  return (
    <section aria-labelledby="health-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h2 id="health-title" className="text-xl font-extrabold tracking-tight">
          Santé et consentements
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {editable
            ? "Liens et saisie assistée possibles pendant la préparation."
            : optionalEditable
              ? "Conditions en consultation seule : l'abonnement n'est plus en préparation. Les accords facultatifs restent demandables."
              : "Consultation seule : l'abonnement est terminé. Les retraits restent possibles et enregistrés."}
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="gap-3 p-5">
          <CardHeader className="items-center">
            <CardTitle className="text-[15px]">
              Conditions et consentements
            </CardTitle>
            {view ? (
              <StatusPill
                status={
                  view.requiredBundle.satisfied
                    ? { label: "Conditions acceptées", tone: "success" }
                    : { label: "Acceptation requise", tone: "warning" }
                }
              />
            ) : null}
          </CardHeader>
          {consents.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Chargement des consentements…
            </p>
          ) : null}
          {consents.isError ? (
            <p role="alert" className="text-sm text-danger">
              {consentErrorMessage(consents.error)}
            </p>
          ) : null}
          {view ? (
            <>
              {view.requiredBundle.missingDefinitions.length > 0 ? (
                <p
                  role="alert"
                  className="rounded-lg bg-danger-soft p-3 text-[13px] text-danger"
                >
                  Documents à publier :{" "}
                  {view.requiredBundle.missingDefinitions
                    .map((t) => labels[t])
                    .join(", ")}
                  . Aucun lien ni recueil n'est possible avant.
                </p>
              ) : null}
              {(
                [
                  ["Conditions obligatoires", requiredConsentTypes],
                  ["Accords facultatifs", optionalConsentTypes],
                ] as const
              ).map(([heading, types]) => (
                <div key={heading} className="flex flex-col gap-1">
                  <h3 className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
                    {heading}
                  </h3>
                  <ul className="flex flex-col divide-y divide-border-subtle">
                    {types.map((type) => {
                      const record = view.current.find(
                        (r) => r.consentType === type,
                      );
                      const state =
                        type === "service_terms" || type === "privacy_notice"
                          ? null
                          : view.optionalStates[type];
                      return (
                        <li
                          key={type}
                          className="flex flex-wrap items-center gap-3 py-2.5"
                        >
                          <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
                            <p className="text-sm font-bold">{labels[type]}</p>
                            <p className="text-[13px] text-muted-foreground">
                              {record
                                ? [
                                    `version ${record.definitionVersion}`,
                                    shortDateFr(record.capturedAt),
                                    record.capturedVia === "public_link"
                                      ? "lien client"
                                      : "recueilli par le coach",
                                  ].join(" · ")
                                : "aucune décision"}
                              {state === "renewal_required"
                                ? " · un nouveau texte a été publié"
                                : ""}
                            </p>
                          </div>
                          {state ? (
                            <StatusPill
                              size="sm"
                              status={optionalStates[state]}
                            />
                          ) : record ? (
                            <StatusPill
                              size="sm"
                              status={
                                decisions[record.decision] ?? {
                                  label: record.decision,
                                  tone: "neutral",
                                }
                              }
                            />
                          ) : (
                            <Pill size="sm" tone="neutral">
                              Aucune décision
                            </Pill>
                          )}
                          {state && record?.decision === "granted" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                remember();
                                setDialog({ kind: "revoke", type });
                              }}
                            >
                              Retirer
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  {types === requiredConsentTypes && canIssueConsent ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          remember();
                          setDialog({ kind: "consent-link" });
                        }}
                      >
                        Envoyer le lien d'acceptation
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          remember();
                          setSheet("consents");
                        }}
                      >
                        Recueillir avec la cliente
                      </Button>
                    </div>
                  ) : null}
                  {types === optionalConsentTypes && canRequestOptional ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={canIssueConsent ? "secondary" : "default"}
                        onClick={() => {
                          remember();
                          setDialog({ kind: "optional-link" });
                        }}
                      >
                        Demander un accord
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          remember();
                          setSheet("optional");
                        }}
                      >
                        Recueillir des accords
                      </Button>
                    </div>
                  ) : null}
                  {types === optionalConsentTypes &&
                  optionalEditable &&
                  optionalDefinitions.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">
                      Aucun texte facultatif publié. Publie-les dans
                      Configuration › Textes de consentement.
                    </p>
                  ) : null}
                </div>
              ))}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                <button
                  type="button"
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    remember();
                    setDialog({ kind: "links", which: "consent" });
                  }}
                >
                  Liens envoyés ({view.links.length})
                </button>
                <details className="min-w-0 basis-full">
                  <summary className="cursor-pointer font-semibold text-primary">
                    Historique et provenance ({view.history.length})
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {view.history.map((r) => (
                      <li key={r.id} className="text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {labels[r.consentType]}
                        </span>{" "}
                        · version {r.definitionVersion} ·{" "}
                        {decisions[r.decision]?.label ?? r.decision} ·{" "}
                        {dateTimeFr(r.capturedAt)} ·{" "}
                        {r.capturedVia === "public_link"
                          ? "lien client"
                          : "recueilli par le coach"}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </>
          ) : null}
        </Card>

        <Card className="gap-3 p-5">
          <CardHeader className="items-center">
            <CardTitle className="text-[15px]">
              {doc?.template.category === "health"
                ? "Questionnaire santé"
                : "Questionnaire de préparation"}
            </CardTitle>
            {q && doc ? (
              <StatusPill
                status={
                  current
                    ? { label: "Réponses reçues", tone: "success" }
                    : q.waived
                      ? { label: "Dispensé", tone: "neutral" }
                      : { label: "En attente", tone: "warning" }
                }
              />
            ) : null}
          </CardHeader>
          {questionnaire.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Chargement du questionnaire…
            </p>
          ) : null}
          {questionnaire.isError ? (
            <p role="alert" className="text-sm text-danger">
              {questionnaireErrorMessage(questionnaire.error)}
            </p>
          ) : null}
          {q && !doc ? (
            <p className="text-sm text-muted-foreground">
              Aucun questionnaire n'est prévu pour ce service.
            </p>
          ) : null}
          {q && doc ? (
            <>
              <p className="text-[13px] text-muted-foreground">
                {doc.template.name} · version {doc.template.version}
                {q.waived ? " · une dispense du coach s'applique" : ""}
              </p>
              <div
                className={cn(
                  "flex flex-col gap-1 rounded-lg p-3 text-[13px]",
                  qActive.length ? "bg-info-soft" : "bg-muted",
                )}
              >
                <p>
                  {qActive.length ? (
                    <>
                      <span className="font-bold">Lien actif</span> · expire le{" "}
                      {dateTimeFr(qActive[0]!.expiresAt)}
                    </>
                  ) : (
                    "Aucun lien actif."
                  )}
                </p>
                {doc.healthConsent ? (
                  <p className="text-muted-foreground">
                    Les réponses de santé ne sont enregistrées que si la cliente
                    accorde « {doc.healthConsent.definition.title} » dans le
                    questionnaire.
                  </p>
                ) : null}
              </div>
              {editable ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={current ? "secondary" : "default"}
                    onClick={() => {
                      remember();
                      setDialog({ kind: "questionnaire-link" });
                    }}
                  >
                    {qActive.length
                      ? "Renvoyer un lien"
                      : "Envoyer le lien du questionnaire"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      remember();
                      setSheet("questionnaire");
                    }}
                  >
                    {doc.expectedHeadId
                      ? "Saisir une correction"
                      : "Saisir avec la cliente"}
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-col gap-1">
                <p className="text-sm font-bold">Révisions</p>
                {q.history.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    Aucune réponse enregistrée.
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border-subtle">
                    {q.history.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center gap-2 py-2 text-[13px]"
                      >
                        <span className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
                          <span className="font-semibold">
                            Révision {r.revisionNumber} · questionnaire version{" "}
                            {r.templateVersion}
                            {r.isCurrent ? " · actuelle" : " · remplacée"}
                          </span>
                          <span className="text-muted-foreground">
                            {dateTimeFr(r.submittedAt)} ·{" "}
                            {r.source === "public_link"
                              ? "lien client"
                              : "saisie par le coach"}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            remember();
                            setAnswersFor({
                              id: r.id,
                              revisionNumber: r.revisionNumber,
                            });
                          }}
                        >
                          Voir les réponses
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className="self-start text-[13px] font-semibold text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    remember();
                    setDialog({ kind: "links", which: "questionnaire" });
                  }}
                >
                  Liens envoyés ({q.links.length})
                </button>
              </div>
            </>
          ) : null}
        </Card>
      </div>

      {dialog ? (
        <HealthDialog
          key={dialog.kind + ("which" in dialog ? dialog.which : "")}
          dialog={dialog}
          subscriptionId={subscriptionId}
          consentLinks={view?.links ?? []}
          questionnaireLinks={q?.links ?? []}
          optionalDefinitions={optionalDefinitions}
          onClose={() => setDialog(null)}
          onDone={refresh}
          restoreFocus={restoreFocus}
        />
      ) : null}
      {sheet === "consents" && definitions.length ? (
        <ConsentCaptureSheet
          subscriptionId={subscriptionId}
          definitions={definitions}
          onClose={() => setSheet(null)}
          onDone={refresh}
          restoreFocus={restoreFocus}
        />
      ) : null}
      {sheet === "optional" && optionalDefinitions.length ? (
        <ConsentCaptureSheet
          optional
          subscriptionId={subscriptionId}
          definitions={optionalDefinitions}
          onClose={() => setSheet(null)}
          onDone={refresh}
          restoreFocus={restoreFocus}
        />
      ) : null}
      {answersFor ? (
        <AnswersSheet
          key={answersFor.id}
          subscriptionId={subscriptionId}
          revision={answersFor}
          onClose={() => setAnswersFor(null)}
          restoreFocus={restoreFocus}
        />
      ) : null}
      {sheet === "questionnaire" && doc ? (
        <QuestionnaireSheet
          subscriptionId={subscriptionId}
          document={doc}
          onClose={() => setSheet(null)}
          onDone={refresh}
          restoreFocus={restoreFocus}
        />
      ) : null}
    </section>
  );
}

type DialogProps = {
  dialog: Dialogs;
  subscriptionId: string;
  consentLinks: ConsentRequestLinkState[];
  questionnaireLinks: ConsentLinkState[];
  optionalDefinitions: ConsentDefinition[];
  onClose: () => void;
  onDone: () => Promise<unknown>;
  restoreFocus: (e: Event) => void;
};

function HealthDialog({
  dialog,
  subscriptionId,
  consentLinks,
  questionnaireLinks,
  optionalDefinitions,
  onClose,
  onDone,
  restoreFocus,
}: DialogProps) {
  const [expiry, setExpiry] = useState(inSevenDays);
  const published = optionalDefinitions.map(
    (d) => d.consentType as OptionalConsentType,
  );
  const [requested, setRequested] = useState<OptionalConsentType[]>(() =>
    defaultRequest.filter((t) => published.includes(t)),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; meta: string } | null>(null);
  const isQuestionnaire =
    dialog.kind === "questionnaire-link" ||
    (dialog.kind === "links" && dialog.which === "questionnaire");
  const message = (f: unknown) =>
    isQuestionnaire ? questionnaireErrorMessage(f) : consentErrorMessage(f);

  async function run(
    operation: () => Promise<unknown>,
    success: string,
    close: boolean,
  ) {
    setBusy(true);
    setError(null);
    try {
      await operation();
      toast.success(success);
      await onDone();
      if (close) onClose();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (
      dialog.kind === "consent-link" ||
      dialog.kind === "optional-link" ||
      dialog.kind === "questionnaire-link"
    ) {
      const iso = fromLocalInput(expiry);
      if (!iso || Date.parse(iso) <= Date.now())
        return setError("Choisis une expiration future.");
      if (dialog.kind === "optional-link" && requested.length === 0)
        return setError("Choisis au moins un accord à demander.");
      void run(
        async () => {
          const r =
            dialog.kind === "consent-link"
              ? await consentApi.issue(subscriptionId, iso)
              : dialog.kind === "optional-link"
                ? await consentApi.requestOptional(
                    subscriptionId,
                    requested,
                    iso,
                  )
                : await questionnaireApi.issue(subscriptionId, iso);
          setLink({
            url: `${window.location.origin}/${dialog.kind === "questionnaire-link" ? "questionnaire" : "consent"}#${r.token}`,
            meta: `Expire le ${dateTimeFr(iso)}`,
          });
        },
        "Lien créé.",
        false,
      );
    } else if (dialog.kind === "revoke") {
      void run(
        () => consentApi.revoke(subscriptionId, dialog.type),
        "Retrait enregistré dans l'historique.",
        true,
      );
    }
  }

  const links =
    dialog.kind === "links"
      ? dialog.which === "consent"
        ? consentLinks
        : questionnaireLinks
      : [];
  const title =
    dialog.kind === "consent-link"
      ? "Lien d'acceptation des conditions"
      : dialog.kind === "optional-link"
        ? "Demander un accord"
        : dialog.kind === "questionnaire-link"
          ? "Lien du questionnaire"
          : dialog.kind === "revoke"
            ? `Retirer « ${labels[dialog.type]} »`
            : "Liens envoyés";
  const description =
    dialog.kind === "consent-link"
      ? "La cliente lit et accepte chaque document séparément."
      : dialog.kind === "optional-link"
        ? "La cliente accorde ou refuse chaque usage séparément. Un nouveau lien remplace le lien de demande actif."
        : dialog.kind === "questionnaire-link"
          ? "Un nouveau lien remplace le lien actif."
          : undefined;

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent
        title={title}
        description={description}
        className="max-w-lg"
        onCloseAutoFocus={restoreFocus}
      >
        {link ? (
          <>
            <OneTimeLink url={link.url} label={title} meta={link.meta} />
            <div className="flex justify-end">
              <Button onClick={onClose}>Terminé</Button>
            </div>
          </>
        ) : dialog.kind === "links" ? (
          <div className="flex flex-col gap-3">
            {links.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun lien envoyé.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border-subtle">
                {links.map((l) => (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center gap-2.5 py-2 text-[13px]"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      {"kind" in l ? (
                        <span className="font-semibold">
                          {linkLabel(l as ConsentRequestLinkState)}
                        </span>
                      ) : null}
                      <span>Expire le {dateTimeFr(l.expiresAt)}</span>
                    </span>
                    <StatusPill size="sm" status={linkStates[l.state]} />
                    {l.state === "available" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              dialog.which === "consent"
                                ? consentApi.revokeLink(subscriptionId, l.id)
                                : questionnaireApi.revoke(subscriptionId, l.id),
                            "Lien révoqué.",
                            false,
                          )
                        }
                      >
                        Révoquer
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <fieldset disabled={busy} className="flex flex-col gap-4">
              {dialog.kind === "revoke" ? (
                <p className="text-sm">
                  Enregistrer le retrait de ce consentement ? La décision
                  précédente reste dans l'historique avec sa provenance.
                </p>
              ) : (
                <>
                  {dialog.kind === "optional-link" ? (
                    <fieldset className="flex flex-col gap-2">
                      <legend className="mb-1 text-sm font-semibold">
                        Accords demandés
                      </legend>
                      {optionalConsentTypes.map((type) => {
                        const available = published.includes(type);
                        return (
                          <label
                            key={type}
                            className={cn(
                              "flex items-center gap-2.5 text-sm",
                              available ? "" : "text-muted-foreground",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="size-4"
                              disabled={!available}
                              checked={requested.includes(type)}
                              onChange={(e) =>
                                setRequested((current) =>
                                  e.target.checked
                                    ? optionalConsentTypes.filter(
                                        (t) =>
                                          t === type || current.includes(t),
                                      )
                                    : current.filter((t) => t !== type),
                                )
                              }
                            />
                            {labels[type]}
                            {available ? "" : " · texte non publié"}
                          </label>
                        );
                      })}
                    </fieldset>
                  ) : null}
                  <Field
                    label="Expiration du lien (Libreville)"
                    hint="Par défaut : dans 7 jours."
                  >
                    {(p) => (
                      <Input
                        {...p}
                        required
                        type="datetime-local"
                        value={expiry}
                        onChange={(e) => setExpiry(e.target.value)}
                      />
                    )}
                  </Field>
                </>
              )}
              {error ? (
                <p
                  role="alert"
                  className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
                >
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Retour
                </Button>
                <Button
                  type="submit"
                  variant={
                    dialog.kind === "revoke" ? "destructive-solid" : "default"
                  }
                >
                  {busy
                    ? "Enregistrement…"
                    : dialog.kind === "revoke"
                      ? "Retirer"
                      : "Créer le lien"}
                </Button>
              </div>
            </fieldset>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

type SheetProps = {
  subscriptionId: string;
  onClose: () => void;
  onDone: () => Promise<unknown>;
  restoreFocus: (e: Event) => void;
};

/** Required: both documents decided. Optional: only the accords actually discussed are recorded (at least one). */
function ConsentCaptureSheet({
  subscriptionId,
  definitions,
  optional = false,
  onClose,
  onDone,
  restoreFocus,
}: SheetProps & { definitions: ConsentDefinition[]; optional?: boolean }) {
  const [choices, setChoices] = useState<
    Partial<Record<ConsentType, "granted" | "refused">>
  >({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const decided = definitions.filter((d) => choices[d.consentType]);
    const complete = optional
      ? decided.length > 0
      : decided.length === definitions.length;
    if (!complete || !confirmed)
      return setError(
        optional
          ? "Enregistre au moins une décision et confirme le recueil."
          : "Enregistre une décision pour chaque document et confirme le recueil.",
      );
    const recorded: ConsentDecisions = {};
    for (const d of decided) {
      const choice = choices[d.consentType];
      if (choice) recorded[d.consentType] = choice;
    }
    setBusy(true);
    setError(null);
    try {
      const ids = decided.map((d) => d.id);
      await (optional
        ? consentApi.captureOptional(subscriptionId, recorded, ids)
        : consentApi.capture(subscriptionId, recorded, ids));
      toast.success("Décisions et provenance enregistrées.");
      await onDone();
      onClose();
    } catch (failure) {
      setError(consentErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <SheetContent
        title={
          optional ? "Recueillir des accords" : "Recueillir avec la cliente"
        }
        description={
          optional
            ? "Lis chaque texte avec elle et enregistre seulement les décisions qu'elle a prises. La provenance « recueilli par le coach » est conservée."
            : "Lis chaque document avec elle, puis enregistre sa décision pour chacun. La provenance « recueilli par le coach » est conservée."
        }
        className="max-w-[560px]"
        onCloseAutoFocus={restoreFocus}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" form="consent-capture" disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer les décisions"}
            </Button>
          </>
        }
      >
        <form id="consent-capture" onSubmit={submit}>
          <fieldset disabled={busy} className="flex flex-col gap-5">
            {definitions.map((d) => (
              <fieldset
                key={d.id}
                className="flex flex-col gap-2.5 rounded-xl border border-border p-4"
              >
                <legend className="px-1 text-sm font-extrabold">
                  {optional ? `${labels[d.consentType]} · ` : ""}
                  {d.title} · version {d.version}
                </legend>
                <div
                  className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-[13px] leading-relaxed"
                  tabIndex={0}
                  role="region"
                  aria-label={`Texte : ${d.title}`}
                >
                  {d.content}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(optional
                    ? (["none", "granted", "refused"] as const)
                    : (["granted", "refused"] as const)
                  ).map((value: "none" | "granted" | "refused") => {
                    const selected =
                      value === "none"
                        ? !choices[d.consentType]
                        : choices[d.consentType] === value;
                    return (
                      <label
                        key={value}
                        className={cn(
                          "inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-[13px] font-bold focus-within:ring-2 focus-within:ring-ring",
                          selected
                            ? "border-[1.5px] border-primary bg-brand-50 text-primary"
                            : "border-input bg-card hover:bg-muted",
                        )}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={d.consentType}
                          required={!optional}
                          checked={selected}
                          onChange={() =>
                            setChoices((c) => {
                              const next = { ...c };
                              if (value === "none") delete next[d.consentType];
                              else next[d.consentType] = value;
                              return next;
                            })
                          }
                        />
                        {value === "granted"
                          ? "Accord recueilli"
                          : value === "refused"
                            ? "Refus recueilli"
                            : "Pas de décision"}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <label className="flex items-start gap-2.5 rounded-lg bg-muted p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {optional
                ? "Je confirme avoir présenté ces versions et recueilli séparément chaque décision enregistrée auprès de la cliente."
                : "Je confirme avoir présenté ces versions et recueilli séparément ces deux décisions auprès de la cliente."}
            </label>
            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
              >
                {error}
              </p>
            ) : null}
          </fieldset>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function QuestionnaireSheet({
  subscriptionId,
  document,
  onClose,
  onDone,
  restoreFocus,
}: SheetProps & {
  document: NonNullable<
    NonNullable<
      Awaited<ReturnType<typeof questionnaireApi.get>>["questionnaire"]
    >["document"]
  >;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const blocked = Boolean(
    document.healthConsent && !document.healthConsent.granted,
  );

  async function submit(
    answers: Parameters<typeof questionnaireApi.submit>[1]["answers"],
  ) {
    setBusy(true);
    setError(null);
    try {
      await questionnaireApi.submit(subscriptionId, {
        templateId: document.template.id,
        templateVersion: document.template.version,
        schemaHash: document.template.schemaHash,
        expectedHeadId: document.expectedHeadId,
        answers,
      });
      toast.success("Réponses enregistrées dans une nouvelle révision.");
      await onDone();
      onClose();
    } catch (failure) {
      setError(questionnaireErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <SheetContent
        title={
          document.expectedHeadId
            ? "Saisir une correction"
            : "Saisir avec la cliente"
        }
        description={`${document.template.name} · version ${document.template.version}. Une nouvelle révision est créée ; les précédentes restent consultables.`}
        className="max-w-[560px]"
        onCloseAutoFocus={restoreFocus}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              {blocked ? "Fermer" : "Annuler"}
            </Button>
            {blocked ? null : (
              <Button type="submit" form="coach-questionnaire" disabled={busy}>
                {busy ? "Enregistrement…" : "Enregistrer les réponses"}
              </Button>
            )}
          </>
        }
      >
        <CoachQuestionnaireForm
          id="coach-questionnaire"
          document={document}
          disabled={busy}
          onSubmit={(answers) => void submit(answers)}
        />
        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
