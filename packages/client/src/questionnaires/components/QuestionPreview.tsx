import { useEffect, useState } from "react";
import type { QuestionInput, QuestionValue } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, Textarea } from "../../components/ui/input.js";
import { cn } from "../../lib/utils.js";

/**
 * « Aperçu client » (board 07): one question per screen, as the client will see it on mobile.
 * Answers typed here are never sent - preview only.
 */
export function QuestionPreview({
  questions,
  title,
  focusIndex,
}: {
  questions: QuestionInput[];
  title: string;
  focusIndex?: number;
}) {
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<number, QuestionValue>>({});
  useEffect(() => {
    if (focusIndex !== undefined && focusIndex >= 0)
      setIndex(Math.min(focusIndex, Math.max(0, questions.length - 1)));
  }, [focusIndex, questions.length]);
  const total = questions.length;
  const q = questions[Math.min(index, total - 1)];
  const value = values[index] ?? null;
  const set = (v: QuestionValue) =>
    setValues((current) => ({ ...current, [index]: v }));

  return (
    <div className="flex flex-col gap-3">
      <div className="mx-auto flex w-full max-w-[300px] flex-col overflow-hidden rounded-[28px] border-[6px] border-foreground bg-[#f7f8f5] shadow-lg">
        <div className="flex items-center justify-between bg-brand-950 px-4 py-3 text-xs font-bold text-white">
          <span>K'FIT</span>
          <span className="tabular-nums">
            {total ? `${index + 1} / ${total}` : "0 / 0"}
          </span>
        </div>
        <div className="h-1 bg-border" aria-hidden="true">
          <div
            className="h-1 bg-lime transition-all"
            style={{ width: total ? `${((index + 1) / total) * 100}%` : "0%" }}
          />
        </div>
        <div className="flex min-h-[300px] flex-col gap-4 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {title || "Questionnaire"}
          </span>
          {!q ? (
            <p className="text-sm text-muted-foreground">
              Ajoute une question pour voir l'aperçu.
            </p>
          ) : (
            <>
              <p className="text-base font-bold leading-snug">
                {q.label || (
                  <span className="text-muted-foreground">
                    Libellé de la question…
                  </span>
                )}
                {!q.required ? (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (facultatif)
                  </span>
                ) : null}
              </p>
              {q.questionType === "boolean" ? (
                <div className="grid grid-cols-2 gap-2">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => set(v)}
                      className={cn(
                        "rounded-xl border-2 bg-card py-3 text-sm font-bold",
                        value === v
                          ? "border-primary text-primary"
                          : "border-border",
                      )}
                    >
                      {v ? "Oui" : "Non"}
                    </button>
                  ))}
                </div>
              ) : q.questionType === "single_choice" ||
                q.questionType === "multi_choice" ? (
                <div className="flex flex-col gap-2">
                  {(q.optionsJson ?? []).map((o, i) => {
                    const multi = q.questionType === "multi_choice";
                    const on = multi
                      ? Array.isArray(value) && value.includes(o.value)
                      : value === o.value;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          multi
                            ? set(
                                on
                                  ? (value as string[]).filter(
                                      (x) => x !== o.value,
                                    )
                                  : [
                                      ...(Array.isArray(value) ? value : []),
                                      o.value,
                                    ],
                              )
                            : set(o.value)
                        }
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl border-2 bg-card px-3 py-2.5 text-left text-sm font-semibold",
                          on ? "border-primary" : "border-border",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "size-4 shrink-0 border-2",
                            multi ? "rounded-[4px]" : "rounded-full",
                            on ? "border-[5px] border-primary" : "border-input",
                          )}
                        />
                        {o.label || (
                          <span className="text-muted-foreground">Choix…</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : q.questionType === "long_text" ? (
                <Textarea
                  rows={4}
                  aria-label="Réponse"
                  value={typeof value === "string" ? value : ""}
                  onChange={(e) => set(e.target.value)}
                />
              ) : (
                <Input
                  aria-label="Réponse"
                  type={
                    q.questionType === "date"
                      ? "date"
                      : q.questionType === "short_text"
                        ? "text"
                        : "number"
                  }
                  inputMode={
                    q.questionType === "integer"
                      ? "numeric"
                      : q.questionType === "decimal"
                        ? "decimal"
                        : undefined
                  }
                  value={
                    typeof value === "string" || typeof value === "number"
                      ? value
                      : ""
                  }
                  onChange={(e) => set(e.target.value)}
                />
              )}
              {q.validationJson ? (
                <p className="text-xs text-muted-foreground">
                  {[
                    q.validationJson.min !== undefined
                      ? `min. ${q.validationJson.min}`
                      : null,
                    q.validationJson.max !== undefined
                      ? `max. ${q.validationJson.max}`
                      : null,
                    q.validationJson.minLength !== undefined
                      ? `au moins ${q.validationJson.minLength} caractères`
                      : null,
                    q.validationJson.maxLength !== undefined
                      ? `au plus ${q.validationJson.maxLength} caractères`
                      : null,
                    q.validationJson.minSelections !== undefined
                      ? `au moins ${q.validationJson.minSelections} choix`
                      : null,
                    q.validationJson.maxSelections !== undefined
                      ? `au plus ${q.validationJson.maxSelections} choix`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </>
          )}
          <div className="mt-auto flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              Retour
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={index >= total - 1}
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
            >
              Continuer
            </Button>
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Aperçu : rien n'est envoyé.
      </p>
    </div>
  );
}
