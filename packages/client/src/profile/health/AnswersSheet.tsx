import { useCallback, useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { ShieldCheck } from "lucide-react";
import type { QuestionnaireRevisionAnswers, QuestionValue } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Sheet, SheetContent } from "../../components/ui/dialog.js";
import { dateFr, dateTimeFr } from "../../lib/format.js";
import { authApiClient } from "../../auth/api/auth-api.js";
import {
  authFailureOf,
  authMessages,
  commonAuthMessage,
  sensitiveOtpRequestMessage,
} from "../../auth/api/auth-errors.js";
import { OtpCodeInput } from "../../auth/components/OtpCodeInput.js";
import {
  questionnaireApi,
  questionnaireErrorMessage,
} from "../../questionnaires/api/questionnaire-api.js";

/**
 * « Voir les réponses » (UX-14c, Fred 2026-10-23). The server requires a fresh OTP and writes every view
 * to the audit log; answers live only in this component's state (never in the query cache) and are
 * dropped when the panel closes.
 */
type Revision = { id: string; revisionNumber: number };
type State =
  | { kind: "loading" }
  | { kind: "otp"; sent: boolean }
  | { kind: "ready"; data: QuestionnaireRevisionAnswers }
  | { kind: "error"; message: string };

function format(
  value: QuestionValue,
  question: QuestionnaireRevisionAnswers["questions"][number] | undefined,
): string {
  if (
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  )
    return "Sans réponse";
  const label = (v: string) =>
    question?.optionsJson?.find((o) => o.value === v)?.label ?? v;
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (Array.isArray(value)) return value.map(label).join(", ");
  if (question?.questionType === "single_choice" && typeof value === "string")
    return label(value);
  if (question?.questionType === "date" && typeof value === "string")
    return dateFr(`${value}T12:00:00Z`);
  return typeof value === "number" ? value.toLocaleString("fr-FR") : value;
}

export function AnswersSheet({
  subscriptionId,
  revision,
  onClose,
  restoreFocus,
}: {
  subscriptionId: string;
  revision: Revision;
  onClose: () => void;
  restoreFocus: (e: Event) => void;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [otpError, setOtpError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const r = await questionnaireApi.answers(subscriptionId, revision.id);
      setState({ kind: "ready", data: r.answers });
    } catch (failure) {
      const code = axios.isAxiosError<{ error?: string }>(failure)
        ? failure.response?.data?.error
        : undefined;
      if (code === "AUTH_FRESH_OTP_REQUIRED")
        setState({ kind: "otp", sent: false });
      else
        setState({
          kind: "error",
          message: questionnaireErrorMessage(failure),
        });
    }
  }, [subscriptionId, revision.id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    setBusy(true);
    setOtpError(null);
    try {
      await authApiClient.requestSensitiveActionOtp();
      setState({ kind: "otp", sent: true });
    } catch (failure) {
      setOtpError(sensitiveOtpRequestMessage(authFailureOf(failure)));
    } finally {
      setBusy(false);
    }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6) return setOtpError("Saisis les 6 chiffres du code.");
    setBusy(true);
    setOtpError(null);
    try {
      await authApiClient.verifySensitiveActionOtp(code);
      setCode("");
      await load();
    } catch (failure) {
      const f = authFailureOf(failure);
      setOtpError(
        f.code === "AUTH_OTP_REJECTED" ||
          f.code === "AUTH_OTP_CODE_INVALID_FORMAT" ||
          f.status === 400 ||
          f.status === 410
          ? authMessages.codeInvalid
          : commonAuthMessage(f),
      );
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  const data = state.kind === "ready" ? state.data : null;
  return (
    <Sheet
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <SheetContent
        title={`Réponses · révision ${revision.revisionNumber}`}
        description={
          data
            ? `${data.template.name} · version ${data.template.version} · ${data.revision.source === "public_link" ? "lien client" : "saisie par le coach"} le ${dateTimeFr(data.revision.submittedAt)}`
            : "Données personnelles de la cliente."
        }
        className="max-w-[560px]"
        onCloseAutoFocus={restoreFocus}
        footer={
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Fermer
          </Button>
        }
      >
        {state.kind === "loading" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Chargement…
          </p>
        ) : null}
        {state.kind === "error" ? (
          <div className="flex flex-col items-start gap-3">
            <p
              role="alert"
              className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
            >
              {state.message}
            </p>
            <Button variant="secondary" onClick={() => void load()}>
              Réessayer
            </Button>
          </div>
        ) : null}
        {state.kind === "otp" ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-xl bg-muted p-4">
              <ShieldCheck
                className="mt-0.5 size-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <p className="text-sm">
                Ces réponses sont des données personnelles. Confirme ton
                identité avec le code à 6 chiffres envoyé à ton adresse e-mail.
                La consultation est enregistrée dans le journal d'audit.
              </p>
            </div>
            {!state.sent ? (
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
                onSubmit={verify}
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
                    {busy ? "Vérification…" : "Vérifier et afficher"}
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
            {otpError ? (
              <p
                role="alert"
                className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
              >
                {otpError}
              </p>
            ) : null}
          </div>
        ) : null}
        {data ? (
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-success" aria-hidden="true" />
              Consultation enregistrée le {dateTimeFr(data.viewedAt)} dans le
              journal d'audit.
            </p>
            <dl className="flex flex-col divide-y divide-border-subtle">
              {[...data.questions]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((q) => {
                  const answer = data.answers.find(
                    (a) => a.questionId === q.id,
                  );
                  const text = answer
                    ? format(answer.value, q)
                    : "Sans réponse";
                  return (
                    <div key={q.id} className="flex flex-col gap-1 py-3">
                      <dt className="text-[13px] font-semibold text-muted-foreground">
                        {q.label}
                      </dt>
                      <dd
                        className={
                          text === "Sans réponse"
                            ? "text-sm italic text-muted-foreground"
                            : "whitespace-pre-wrap break-words text-sm font-semibold"
                        }
                      >
                        {text}
                      </dd>
                    </div>
                  );
                })}
            </dl>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
