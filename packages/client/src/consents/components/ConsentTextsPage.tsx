import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  requiredConsentTypes,
  type ConsentDefinition,
  type ConsentDefinitionSummary,
  type ConsentType,
} from "@kfit/shared";
import { AdminPage } from "../../app/layout/AdminPage.js";
import { Button } from "../../components/ui/button.js";
import { Card, CardHeader, CardTitle } from "../../components/ui/card.js";
import {
  Dialog,
  DialogContent,
  Sheet,
  SheetContent,
} from "../../components/ui/dialog.js";
import { Field } from "../../components/ui/field.js";
import { Input, Textarea } from "../../components/ui/input.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import type { StatusDescriptor } from "../../lib/status-map.js";
import { dateTimeFr } from "../../lib/format.js";
import { focusReturnTarget } from "../../lib/focus.js";
import { authApiClient } from "../../auth/api/auth-api.js";
import {
  authFailureOf,
  authMessages,
  commonAuthMessage,
  sensitiveOtpRequestMessage,
} from "../../auth/api/auth-errors.js";
import { OtpCodeInput } from "../../auth/components/OtpCodeInput.js";
import {
  consentDefinitionsApi,
  consentErrorCode,
  consentErrorMessage,
} from "../api/consent-api.js";

/**
 * « Textes de consentement » (CONS-02b, D7). Drafts are editable; a published version is immutable and stays
 * in the history. Publishing needs a fresh e-mailed code and puts current grants of the previous version in renewal.
 */
const labels: Record<ConsentType, string> = {
  service_terms: "Conditions de service",
  privacy_notice: "Notice de confidentialité",
  health_data: "Données de santé",
  progress_photo_storage: "Conservation des photos de suivi",
  marketing: "Communication commerciale",
  publication: "Publication",
};
const statuses: Record<ConsentDefinitionSummary["status"], StatusDescriptor> = {
  draft: { label: "Brouillon", tone: "warning" },
  published: { label: "Publiée", tone: "success" },
  retired: { label: "Retirée", tone: "neutral" },
};
const isRequired = (type: ConsentType) =>
  requiredConsentTypes.some((required) => required === type);
const queryKey = ["consent-definitions"] as const;

type Action =
  | {
      kind: "edit";
      consentType: ConsentType;
      definitionId: string | null;
      sourceId: string | null;
    }
  | { kind: "read"; definitionId: string }
  | { kind: "publish"; definition: ConsentDefinitionSummary }
  | { kind: "delete"; definition: ConsentDefinitionSummary };

export function ConsentTextsPage() {
  const client = useQueryClient();
  const list = useQuery({
    queryKey,
    queryFn: () => consentDefinitionsApi.list(),
  });
  const [action, setAction] = useState<Action | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = (next: Action) => {
    opener.current = focusReturnTarget();
    setAction(next);
  };
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
  };
  const refresh = () => client.invalidateQueries({ queryKey });

  return (
    <AdminPage
      title="Textes de consentement"
      description="Les textes que les clientes lisent avant d'accepter ou de refuser. Une version publiée ne se modifie plus : crée une nouvelle version."
    >
      {list.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Chargement des textes…
        </p>
      ) : null}
      {list.isError ? (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
        >
          {consentErrorMessage(list.error)}
        </p>
      ) : null}
      {list.data ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {list.data.definitions.map(({ consentType, versions }) => {
            const latest = versions.find((v) => v.status === "published");
            const draft = versions.find((v) => v.status === "draft");
            return (
              <Card key={consentType} className="gap-3 p-5">
                <CardHeader className="items-center">
                  <CardTitle className="text-[15px]">
                    {labels[consentType]}
                  </CardTitle>
                  <StatusPill
                    size="sm"
                    status={
                      latest
                        ? {
                            label: `Version ${latest.version} en vigueur`,
                            tone: "success",
                          }
                        : { label: "Aucun texte publié", tone: "warning" }
                    }
                  />
                </CardHeader>
                <p className="text-[13px] text-muted-foreground">
                  {isRequired(consentType)
                    ? "Obligatoire pour démarrer un accompagnement."
                    : "Accord facultatif, demandé par le coach."}
                </p>
                {versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucune version.
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border-subtle">
                    {versions.map((v) => (
                      <li
                        key={v.id}
                        className="flex flex-wrap items-center gap-2 py-2 text-[13px]"
                      >
                        <span className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
                          <span className="font-semibold">
                            Version {v.version} · {v.title}
                          </span>
                          <span className="text-muted-foreground">
                            {v.publishedAt
                              ? `Publiée le ${dateTimeFr(v.publishedAt)}`
                              : "Non publiée"}
                            {v === latest ? " · en vigueur" : ""}
                          </span>
                        </span>
                        <StatusPill size="sm" status={statuses[v.status]} />
                        {v.status === "draft" ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                open({
                                  kind: "edit",
                                  consentType,
                                  definitionId: v.id,
                                  sourceId: null,
                                })
                              }
                            >
                              Modifier
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                open({ kind: "delete", definition: v })
                              }
                            >
                              Supprimer
                            </Button>
                            <Button
                              size="sm"
                              onClick={() =>
                                open({ kind: "publish", definition: v })
                              }
                            >
                              Publier
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              open({ kind: "read", definitionId: v.id })
                            }
                          >
                            Lire
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {draft ? null : (
                  <Button
                    variant="secondary"
                    className="self-start"
                    onClick={() =>
                      open({
                        kind: "edit",
                        consentType,
                        definitionId: null,
                        sourceId: latest?.id ?? null,
                      })
                    }
                  >
                    {latest
                      ? "Préparer une nouvelle version"
                      : "Rédiger le texte"}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      ) : null}
      {action?.kind === "edit" ? (
        <EditorSheet
          action={action}
          onClose={() => setAction(null)}
          onDone={refresh}
          restoreFocus={restoreFocus}
        />
      ) : null}
      {action?.kind === "read" ? (
        <ReadSheet
          definitionId={action.definitionId}
          onClose={() => setAction(null)}
          restoreFocus={restoreFocus}
        />
      ) : null}
      {action?.kind === "publish" ? (
        <PublishDialog
          definition={action.definition}
          onClose={() => setAction(null)}
          onDone={refresh}
          restoreFocus={restoreFocus}
        />
      ) : null}
      {action?.kind === "delete" ? (
        <DeleteDialog
          definition={action.definition}
          onClose={() => setAction(null)}
          onDone={refresh}
          restoreFocus={restoreFocus}
        />
      ) : null}
    </AdminPage>
  );
}

type Common = { onClose: () => void; restoreFocus: (event: Event) => void };

function useDefinition(id: string | null) {
  return useQuery({
    queryKey: ["consent-definition", id],
    queryFn: () => consentDefinitionsApi.get(id!),
    enabled: Boolean(id),
    staleTime: Infinity,
  });
}

/** New draft (prefilled from the version in force) or edit of an existing draft. The version number is chosen by the server. */
function EditorSheet({
  action,
  onClose,
  onDone,
  restoreFocus,
}: Common & {
  action: Extract<Action, { kind: "edit" }>;
  onDone: () => Promise<unknown>;
}) {
  const source = useDefinition(action.definitionId ?? action.sourceId);
  const [title, setTitle] = useState(""),
    [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(
    !action.definitionId && !action.sourceId,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (loaded || !source.data) return;
    setTitle(source.data.definition.title);
    setContent(source.data.definition.content);
    setLoaded(true);
  }, [loaded, source.data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !content.trim())
      return setError("Le titre et le texte sont obligatoires.");
    setBusy(true);
    setError(null);
    try {
      if (action.definitionId)
        await consentDefinitionsApi.update(action.definitionId, {
          title,
          content,
        });
      else
        await consentDefinitionsApi.create({
          consentType: action.consentType,
          title,
          content,
        });
      toast.success("Brouillon enregistré.");
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
          action.definitionId ? "Modifier le brouillon" : "Nouvelle version"
        }
        description={`${labels[action.consentType]} · le brouillon reste invisible pour les clientes tant qu'il n'est pas publié.`}
        className="max-w-160"
        onCloseAutoFocus={restoreFocus}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="submit"
              form="consent-text-editor"
              disabled={busy || !loaded}
            >
              {busy ? "Enregistrement…" : "Enregistrer le brouillon"}
            </Button>
          </>
        }
      >
        {!loaded && source.isError ? (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
          >
            {consentErrorMessage(source.error)}
          </p>
        ) : null}
        {!loaded && !source.isError ? (
          <p role="status" className="text-sm text-muted-foreground">
            Chargement du texte…
          </p>
        ) : null}
        {loaded ? (
          <form id="consent-text-editor" onSubmit={(e) => void submit(e)}>
            <fieldset disabled={busy} className="flex flex-col gap-4">
              <Field label="Titre">
                {(p) => (
                  <Input
                    {...p}
                    required
                    maxLength={200}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Texte complet"
                hint="Le texte exact que la cliente lira, conservé tel quel avec son empreinte à la publication."
              >
                {(p) => (
                  <Textarea
                    {...p}
                    required
                    rows={16}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                )}
              </Field>
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
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ReadSheet({
  definitionId,
  onClose,
  restoreFocus,
}: Common & { definitionId: string }) {
  const query = useDefinition(definitionId);
  const d: ConsentDefinition | undefined = query.data?.definition;
  return (
    <Sheet
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent
        title={d ? `${labels[d.consentType]} · version ${d.version}` : "Texte"}
        description={
          d?.publishedAt
            ? `Publiée le ${dateTimeFr(d.publishedAt)} · empreinte ${d.contentHash.slice(0, 12)}…`
            : undefined
        }
        className="max-w-160"
        onCloseAutoFocus={restoreFocus}
        footer={
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        }
      >
        {query.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Chargement du texte…
          </p>
        ) : null}
        {query.isError ? (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
          >
            {consentErrorMessage(query.error)}
          </p>
        ) : null}
        {d ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-[15px] font-extrabold">{d.title}</h3>
            <p className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed">
              {d.content}
            </p>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type PublishStep = { kind: "confirm" } | { kind: "otp"; sent: boolean };

function PublishDialog({
  definition,
  onClose,
  onDone,
  restoreFocus,
}: Common & {
  definition: ConsentDefinitionSummary;
  onDone: () => Promise<unknown>;
}) {
  const impact = useQuery({
    queryKey: ["consent-definition-impact", definition.id],
    queryFn: () => consentDefinitionsApi.impact(definition.id),
    staleTime: 0,
  });
  const [step, setStep] = useState<PublishStep>({ kind: "confirm" });
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const affected = impact.data?.activeSubscriptionsAffected ?? 0;

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await consentDefinitionsApi.publish(definition.id);
      toast.success(`Version ${definition.version} publiée.`);
      await onDone();
      onClose();
    } catch (failure) {
      if (consentErrorCode(failure) === "AUTH_FRESH_OTP_REQUIRED")
        setStep({ kind: "otp", sent: false });
      else setError(consentErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    setBusy(true);
    setError(null);
    try {
      await authApiClient.requestSensitiveActionOtp();
      setStep({ kind: "otp", sent: true });
    } catch (failure) {
      setError(sensitiveOtpRequestMessage(authFailureOf(failure)));
    } finally {
      setBusy(false);
    }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6) return setError("Saisis les 6 chiffres du code.");
    setBusy(true);
    setError(null);
    try {
      await authApiClient.verifySensitiveActionOtp(code);
      setCode("");
    } catch (failure) {
      const f = authFailureOf(failure);
      setError(
        f.code === "AUTH_OTP_REJECTED" ||
          f.code === "AUTH_OTP_CODE_INVALID_FORMAT" ||
          f.status === 400 ||
          f.status === 410
          ? authMessages.codeInvalid
          : commonAuthMessage(f),
      );
      setCode("");
      setBusy(false);
      return;
    }
    setBusy(false);
    await publish();
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent
        title={`Publier « ${labels[definition.consentType]} » version ${definition.version}`}
        className="max-w-lg"
        onCloseAutoFocus={restoreFocus}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Ce texte devient la version en vigueur. Il ne pourra plus être
            modifié ni supprimé ; la version précédente reste dans l'historique.
          </p>
          {impact.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Calcul de l'impact…
            </p>
          ) : null}
          {impact.isError ? (
            <p
              role="alert"
              className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
            >
              {consentErrorMessage(impact.error)}
            </p>
          ) : null}
          {impact.data ? (
            <p
              className={
                affected > 0
                  ? "rounded-lg bg-warning-soft p-3 text-sm"
                  : "rounded-lg bg-muted p-3 text-sm"
              }
            >
              {affected > 0
                ? `${affected} abonnement${affected > 1 ? "s" : ""} en cours ${affected > 1 ? "ont" : "a"} un accord sur la version actuelle : ${affected > 1 ? "ils devront" : "il devra"} être renouvelé${affected > 1 ? "s" : ""}.`
                : "Aucun abonnement en cours n'a d'accord sur la version actuelle."}
              {isRequired(definition.consentType)
                ? " Les abonnements déjà démarrés ne sont pas bloqués."
                : ""}
            </p>
          ) : null}
          {step.kind === "otp" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3 rounded-xl bg-muted p-4">
                <ShieldCheck
                  className="mt-0.5 size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <p className="text-sm">
                  La publication d'un texte légal demande de confirmer ton
                  identité avec le code à 6 chiffres envoyé à ton adresse
                  e-mail.
                </p>
              </div>
              {!step.sent ? (
                <Button
                  className="self-start"
                  disabled={busy}
                  onClick={() => void send()}
                >
                  {busy ? "Envoi…" : "Recevoir le code par e-mail"}
                </Button>
              ) : (
                <form
                  noValidate
                  onSubmit={(e) => void verify(e)}
                  className="flex flex-col gap-3"
                >
                  <Field
                    label="Code de vérification"
                    hint="Le code expire dans quelques minutes."
                  >
                    {(control) => (
                      <OtpCodeInput
                        {...control}
                        autoFocus
                        value={code}
                        onValueChange={setCode}
                      />
                    )}
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busy}>
                      {busy ? "Vérification…" : "Vérifier et publier"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void send()}
                    >
                      Renvoyer le code
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Retour
            </Button>
            {step.kind === "confirm" ? (
              <Button
                disabled={busy || !impact.data}
                onClick={() => void publish()}
              >
                {busy ? "Publication…" : "Publier"}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  definition,
  onClose,
  onDone,
  restoreFocus,
}: Common & {
  definition: ConsentDefinitionSummary;
  onDone: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await consentDefinitionsApi.remove(definition.id);
      toast.success("Brouillon supprimé.");
      await onDone();
      onClose();
    } catch (failure) {
      setError(consentErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent
        title="Supprimer le brouillon"
        className="max-w-lg"
        onCloseAutoFocus={restoreFocus}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Supprimer la version {definition.version} de «{" "}
            {labels[definition.consentType]} » ? Ce brouillon n'a jamais été
            publié et aucune cliente ne l'a vu.
          </p>
          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Retour
            </Button>
            <Button
              variant="destructive-solid"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Suppression…" : "Supprimer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
