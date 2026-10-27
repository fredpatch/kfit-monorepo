import { useEffect, useRef, useState } from "react";
import { Check, ClipboardList } from "lucide-react";
import {
  parseQuestionnaireAnswers,
  validateQuestionnaireAnswers,
  type QuestionnaireAnswer,
  type QuestionnaireDocument,
  type QuestionValue,
} from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, Textarea } from "../../components/ui/input.js";
import {
  PublicCard,
  PublicChoice,
  PublicShell,
  publicPrimaryClass,
} from "../../components/public/PublicShell.js";

type Question = QuestionnaireDocument["template"]["questions"][number];
type Step =
  | { kind: "intro" }
  | { kind: "consent" }
  | { kind: "question"; index: number };

/** Same value normalisation as the coach form: "" = no answer, numeric strings become numbers. */
function normalise(
  question: Question,
  raw: QuestionValue | undefined,
): QuestionValue {
  const value = raw ?? null;
  if (value === "") return null;
  if (
    (question.questionType === "integer" ||
      question.questionType === "decimal") &&
    typeof value === "string"
  )
    return Number(value);
  return value;
}

function constraintHint(question: Question): string | null {
  const c = question.validationJson;
  if (!c) return null;
  const parts = [
    c.minLength !== undefined ? `au moins ${c.minLength} caractères` : null,
    c.maxLength !== undefined ? `au plus ${c.maxLength} caractères` : null,
    c.min !== undefined ? `minimum ${c.min}` : null,
    c.max !== undefined ? `maximum ${c.max}` : null,
    c.minSelections !== undefined ? `au moins ${c.minSelections} choix` : null,
    c.maxSelections !== undefined ? `au plus ${c.maxSelections} choix` : null,
  ].filter(Boolean);
  return parts.length
    ? `${parts.join(", ")}.`.replace(/^./, (s) => s.toUpperCase())
    : null;
}

/**
 * Customer questionnaire as one question per screen (board 11b). Each step is checked with the shared
 * validator on that question; the final submit re-validates every answer exactly like the coach form.
 * Health data consent comes before any answer when it is not already granted (S5 rule).
 */
export function PublicQuestionnaireSteps({
  document,
  disabled,
  error,
  onSubmit,
}: {
  document: QuestionnaireDocument;
  disabled: boolean;
  error: string | null;
  onSubmit: (
    answers: QuestionnaireAnswer[],
    healthDataDecision?: "granted" | "refused",
  ) => Promise<void>;
}) {
  const questions = document.template.questions;
  const health = document.healthConsent;
  const needsGrant = !!health && !health.granted;
  const [step, setStep] = useState<Step>({ kind: "intro" });
  const [values, setValues] = useState<Record<string, QuestionValue>>({});
  const [decision, setDecision] = useState<"granted" | "refused" | "">("");
  const [stepError, setStepError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  const total = questions.length;
  const questionIndex = step.kind === "question" ? step.index : -1;
  const progress =
    step.kind === "intro"
      ? 0
      : step.kind === "consent"
        ? 0.05
        : (questionIndex + 1) / Math.max(total, 1);
  const tag =
    step.kind === "question"
      ? `${questionIndex + 1} / ${total}`
      : step.kind === "consent"
        ? "Consentement"
        : undefined;

  const go = (next: Step) => {
    setStepError(null);
    setStep(next);
  };
  const firstQuestion: Step =
    total > 0 ? { kind: "question", index: 0 } : { kind: "intro" };
  const back =
    step.kind === "intro"
      ? undefined
      : step.kind === "consent"
        ? () => go({ kind: "intro" })
        : () =>
            go(
              questionIndex > 0
                ? { kind: "question", index: questionIndex - 1 }
                : needsGrant
                  ? { kind: "consent" }
                  : { kind: "intro" },
            );

  function checkQuestion(question: Question): boolean {
    const parsed = parseQuestionnaireAnswers([
      {
        questionId: question.id,
        value: normalise(question, values[question.id]),
      },
    ]);
    const ok = !!parsed && validateQuestionnaireAnswers([question], parsed);
    setStepError(
      ok
        ? null
        : question.required && normalise(question, values[question.id]) === null
          ? "Réponds à cette question pour continuer."
          : "Vérifie ta réponse : elle ne respecte pas les limites indiquées.",
    );
    return ok;
  }

  function submitAll() {
    const payload = questions.map((question) => ({
      questionId: question.id,
      value: normalise(question, values[question.id]),
    }));
    const answers = parseQuestionnaireAnswers(payload);
    if (!answers || !validateQuestionnaireAnswers(questions, answers)) {
      setStepError(
        "Vérifie les réponses obligatoires et les limites indiquées.",
      );
      return;
    }
    setStepError(null);
    void onSubmit(answers, needsGrant ? "granted" : undefined);
  }

  function next() {
    if (disabled) return;
    if (step.kind === "intro")
      return go(needsGrant ? { kind: "consent" } : firstQuestion);
    if (step.kind === "consent") {
      if (decision === "refused") return void onSubmit([], "refused");
      if (decision !== "granted")
        return setStepError("Choisis une réponse pour continuer.");
      return go(firstQuestion);
    }
    const question = questions[questionIndex];
    if (!question || !checkQuestion(question)) return;
    if (questionIndex < total - 1)
      return go({ kind: "question", index: questionIndex + 1 });
    submitAll();
  }

  const isLast = step.kind === "question" && questionIndex === total - 1;
  const cta = disabled
    ? "Enregistrement…"
    : step.kind === "intro"
      ? "Commencer"
      : step.kind === "consent" && decision === "refused"
        ? "Enregistrer mon refus"
        : isLast
          ? "Envoyer mes réponses"
          : "Continuer";

  const update = (id: string, value: QuestionValue) => {
    setValues((current) => ({ ...current, [id]: value }));
    setStepError(null);
  };
  const shownError = stepError ?? error;

  return (
    <PublicShell
      title={`K'FIT · ${document.template.name}`}
      {...(tag ? { tag } : {})}
      {...(step.kind === "intro" ? {} : { progress })}
      {...(back ? { onBack: back } : {})}
      actions={
        <Button
          className={publicPrimaryClass}
          disabled={disabled}
          onClick={next}
        >
          {cta}
        </Button>
      }
    >
      {step.kind === "intro" ? (
        <div className="flex flex-col gap-4 pt-4">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-[18px] bg-success-soft text-success"
          >
            <ClipboardList className="size-7" />
          </span>
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-[28px] font-extrabold leading-tight tracking-tight focus:outline-none"
          >
            Préparons ton accompagnement
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            {total} question{total > 1 ? "s" : ""}. Tes réponses aident ton
            coach à adapter ton programme.
          </p>
          <PublicCard className="gap-2.5 text-sm">
            <span className="flex items-center gap-2">
              <Check aria-hidden="true" className="size-4 text-success" />
              Visible uniquement par ton coach
            </span>
            <span className="flex items-center gap-2">
              <Check aria-hidden="true" className="size-4 text-success" />
              Tu peux revenir en arrière avant d'envoyer
            </span>
            <span className="flex items-center gap-2">
              <Check aria-hidden="true" className="size-4 text-success" />
              Lien personnel : une seule réponse possible
            </span>
          </PublicCard>
        </div>
      ) : step.kind === "consent" && health ? (
        <fieldset disabled={disabled} className="flex flex-col gap-4 pt-2">
          <legend className="sr-only">{health.definition.title}</legend>
          <span className="text-[13px] font-bold uppercase tracking-wide text-primary">
            Données de santé
          </span>
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-2xl font-extrabold leading-tight tracking-tight focus:outline-none"
          >
            Acceptes-tu que K'FIT traite tes données de santé ?
          </h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Certaines questions portent sur ta santé. Tes réponses restent
            confidentielles et servent uniquement à ton accompagnement.
          </p>
          <details>
            <summary className="cursor-pointer text-sm font-bold text-primary">
              Lire le texte complet ({health.definition.title}, version{" "}
              {health.definition.version})
            </summary>
            <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
              {health.definition.content}
            </p>
          </details>
          <div className="flex flex-col gap-2.5">
            <PublicChoice
              name="health-consent"
              checked={decision === "granted"}
              onChange={() => {
                setDecision("granted");
                setStepError(null);
              }}
              label="J'accepte"
            />
            <PublicChoice
              name="health-consent"
              checked={decision === "refused"}
              onChange={() => {
                setDecision("refused");
                setStepError(null);
              }}
              label="Je refuse"
              hint="Aucune réponse ne sera enregistrée. Ton coach te recontactera."
            />
          </div>
        </fieldset>
      ) : step.kind === "question" && questions[questionIndex] ? (
        <QuestionStep
          key={questions[questionIndex].id}
          question={questions[questionIndex]}
          index={questionIndex}
          total={total}
          value={values[questions[questionIndex].id] ?? null}
          disabled={disabled}
          headingRef={heading}
          onChange={update}
        />
      ) : null}

      {shownError ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {shownError}
        </p>
      ) : null}
    </PublicShell>
  );
}

function QuestionStep({
  question,
  index,
  total,
  value,
  disabled,
  headingRef,
  onChange,
}: {
  question: Question;
  index: number;
  total: number;
  value: QuestionValue;
  disabled: boolean;
  headingRef: React.RefObject<HTMLHeadingElement>;
  onChange: (id: string, value: QuestionValue) => void;
}) {
  const id = `question-${question.id}`;
  const hint = constraintHint(question);
  const set = (next: QuestionValue) => onChange(question.id, next);
  const c = question.validationJson;

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-4 pt-2">
      <legend className="sr-only">{question.label}</legend>
      <span className="text-[13px] font-bold text-muted-foreground">
        Question {index + 1} sur {total}
      </span>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-extrabold leading-tight tracking-tight focus:outline-none"
      >
        <label
          htmlFor={
            ["boolean", "single_choice", "multi_choice"].includes(
              question.questionType,
            )
              ? undefined
              : id
          }
        >
          {question.label}
        </label>
      </h1>

      {question.questionType === "boolean" ? (
        <div className="flex flex-col gap-2.5">
          <PublicChoice
            name={id}
            checked={value === true}
            onChange={() => set(true)}
            label="Oui"
          />
          <PublicChoice
            name={id}
            checked={value === false}
            onChange={() => set(false)}
            label="Non"
          />
        </div>
      ) : question.questionType === "single_choice" ? (
        <div className="flex flex-col gap-2.5">
          {question.optionsJson?.map((option) => (
            <PublicChoice
              key={option.value}
              name={id}
              checked={value === option.value}
              onChange={() => set(option.value)}
              label={option.label}
            />
          ))}
        </div>
      ) : question.questionType === "multi_choice" ? (
        <div className="flex flex-col gap-2.5">
          {question.optionsJson?.map((option) => {
            const current = Array.isArray(value) ? value : [];
            return (
              <PublicChoice
                key={option.value}
                type="checkbox"
                name={`${id}-${option.value}`}
                checked={current.includes(option.value)}
                onChange={(checked) =>
                  set(
                    checked
                      ? [...current, option.value]
                      : current.filter((item) => item !== option.value),
                  )
                }
                label={option.label}
              />
            );
          })}
        </div>
      ) : question.questionType === "long_text" ? (
        <Textarea
          id={id}
          rows={5}
          className="text-base"
          minLength={c?.minLength}
          maxLength={c?.maxLength ?? 20000}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => set(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          className="h-14 text-base"
          type={
            question.questionType === "date"
              ? "date"
              : question.questionType === "integer" ||
                  question.questionType === "decimal"
                ? "number"
                : "text"
          }
          inputMode={
            question.questionType === "integer"
              ? "numeric"
              : question.questionType === "decimal"
                ? "decimal"
                : undefined
          }
          step={
            question.questionType === "integer"
              ? 1
              : question.questionType === "decimal"
                ? "any"
                : undefined
          }
          min={c?.min}
          max={c?.max}
          minLength={c?.minLength}
          maxLength={c?.maxLength ?? 20000}
          value={
            typeof value === "string" || typeof value === "number" ? value : ""
          }
          onChange={(event) => set(event.target.value)}
        />
      )}

      <span className="text-[13px] text-muted-foreground">
        {question.required ? "Réponse obligatoire" : "Réponse facultative"}
        {hint ? ` · ${hint}` : ""}
      </span>
    </fieldset>
  );
}
