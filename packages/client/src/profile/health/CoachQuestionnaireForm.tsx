import { useState, type FormEvent } from "react";
import {
  parseQuestionnaireAnswers,
  validateQuestionnaireAnswers,
  type QuestionnaireAnswer,
  type QuestionnaireDocument,
  type QuestionValue,
} from "@kfit/shared";
import { Input, NativeSelect, Textarea } from "../../components/ui/input.js";
import { Field } from "../../components/ui/field.js";

/**
 * Coach-assisted questionnaire entry (UX-14b, replaces the legacy form). Same rules as S5:
 * health answers need the client's own health-data consent first; values are normalised and checked
 * with the shared validator before submit; a correction creates a new revision.
 */
type Question = QuestionnaireDocument["template"]["questions"][number];

function hint(q: Question): string | undefined {
  const c = q.validationJson;
  if (!c) return undefined;
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
    : undefined;
}

export function CoachQuestionnaireForm({
  id,
  document,
  disabled,
  onSubmit,
}: {
  id: string;
  document: QuestionnaireDocument;
  disabled: boolean;
  onSubmit: (answers: QuestionnaireAnswer[]) => void;
}) {
  const [values, setValues] = useState<Record<string, QuestionValue>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const health = document.healthConsent;
  const blocked = Boolean(health && !health.granted);
  const update = (qid: string, value: QuestionValue) =>
    setValues((current) => ({ ...current, [qid]: value }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || disabled) return;
    if (!confirmed)
      return setError(
        "Confirme que les réponses ont été recueillies auprès de la cliente.",
      );
    const payload = document.template.questions.map((q) => {
      const raw = values[q.id] ?? null;
      const value =
        raw === ""
          ? null
          : (q.questionType === "integer" || q.questionType === "decimal") &&
              typeof raw === "string"
            ? Number(raw)
            : raw;
      return { questionId: q.id, value };
    });
    const answers = parseQuestionnaireAnswers(payload);
    if (
      !answers ||
      !validateQuestionnaireAnswers(document.template.questions, answers)
    )
      return setError(
        "Vérifie les réponses obligatoires et les limites indiquées.",
      );
    setError(null);
    onSubmit(answers);
  }

  if (blocked) {
    return (
      <p role="alert" className="rounded-lg bg-warning-soft p-3 text-sm">
        Le consentement « {health!.definition.title} » doit être accordé par la
        cliente elle-même, depuis son lien, avant toute saisie de réponses de
        santé.
      </p>
    );
  }

  return (
    <form id={id} onSubmit={submit}>
      <fieldset disabled={disabled} className="flex flex-col gap-4">
        {document.template.questions.map((q) => {
          const value = values[q.id] ?? null;
          const optional = q.required ? undefined : "(facultatif)";
          if (q.questionType === "multi_choice") {
            return (
              <fieldset key={q.id} className="flex flex-col gap-2">
                <legend className="pb-1.5 text-[13px] font-semibold">
                  {q.label}
                  {optional ? (
                    <span className="font-medium text-muted-foreground">
                      {" "}
                      {optional}
                    </span>
                  ) : null}
                </legend>
                {q.optionsJson?.map((o) => (
                  <label
                    key={o.value}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={Array.isArray(value) && value.includes(o.value)}
                      onChange={(e) => {
                        const current = Array.isArray(value) ? value : [];
                        update(
                          q.id,
                          e.target.checked
                            ? [...current, o.value]
                            : current.filter((x) => x !== o.value),
                        );
                      }}
                    />
                    {o.label}
                  </label>
                ))}
                {hint(q) ? (
                  <p className="text-xs text-muted-foreground">{hint(q)}</p>
                ) : null}
              </fieldset>
            );
          }
          return (
            <Field
              key={q.id}
              label={q.label}
              {...(optional ? { optionalHint: optional } : {})}
              hint={hint(q)}
            >
              {(p) =>
                q.questionType === "boolean" ? (
                  <NativeSelect
                    {...p}
                    required={q.required}
                    value={
                      value === true ? "true" : value === false ? "false" : ""
                    }
                    onChange={(e) =>
                      update(
                        q.id,
                        e.target.value === ""
                          ? null
                          : e.target.value === "true",
                      )
                    }
                  >
                    <option value="">Choisir une réponse</option>
                    <option value="true">Oui</option>
                    <option value="false">Non</option>
                  </NativeSelect>
                ) : q.questionType === "single_choice" ? (
                  <NativeSelect
                    {...p}
                    required={q.required}
                    value={typeof value === "string" ? value : ""}
                    onChange={(e) => update(q.id, e.target.value || null)}
                  >
                    <option value="">Choisir une réponse</option>
                    {q.optionsJson?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                ) : q.questionType === "long_text" ? (
                  <Textarea
                    {...p}
                    required={q.required}
                    rows={4}
                    minLength={q.validationJson?.minLength}
                    maxLength={q.validationJson?.maxLength ?? 20000}
                    value={typeof value === "string" ? value : ""}
                    onChange={(e) => update(q.id, e.target.value)}
                  />
                ) : (
                  <Input
                    {...p}
                    type={
                      q.questionType === "date"
                        ? "date"
                        : q.questionType === "integer" ||
                            q.questionType === "decimal"
                          ? "number"
                          : "text"
                    }
                    step={
                      q.questionType === "integer"
                        ? 1
                        : q.questionType === "decimal"
                          ? "any"
                          : undefined
                    }
                    required={q.required}
                    min={q.validationJson?.min}
                    max={q.validationJson?.max}
                    minLength={q.validationJson?.minLength}
                    maxLength={q.validationJson?.maxLength ?? 20000}
                    value={
                      typeof value === "string" || typeof value === "number"
                        ? value
                        : ""
                    }
                    onChange={(e) => update(q.id, e.target.value)}
                  />
                )
              }
            </Field>
          );
        })}
        <label className="flex items-start gap-2.5 rounded-lg bg-muted p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Je confirme saisir les réponses recueillies auprès de la cliente pour
          cette version du questionnaire.
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
  );
}
