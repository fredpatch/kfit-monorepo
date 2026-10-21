import { useState } from "react";
import { parseQuestionnaireAnswers, validateQuestionnaireAnswers, type QuestionnaireAnswer, type QuestionnaireDocument, type QuestionValue } from "@kfit/shared";
export function DynamicQuestionnaireForm({ document, coach = false, disabled, onSubmit }: { document: QuestionnaireDocument; coach?: boolean; disabled: boolean;
  onSubmit: (answers: QuestionnaireAnswer[], healthDataDecision?: "granted" | "refused") => Promise<void> }) {
  const [values, setValues] = useState<Record<string, QuestionValue>>({}); const [decision, setDecision] = useState<"granted" | "refused" | "">("");
  const [confirmed, setConfirmed] = useState(false); const [error, setError] = useState<string | null>(null);
  const health = document.healthConsent; const needsGrant = !!health && !health.granted;
  const blocked = disabled || needsGrant && (coach || decision !== "granted");
  const update = (id: string, value: QuestionValue) => setValues(current => ({ ...current, [id]: value }));
  return <form className="questionnaire-form" onSubmit={event => {
    event.preventDefault(); if (blocked || coach && !confirmed) return;
    const payload = document.template.questions.map(question => {
      const raw = values[question.id] ?? null;
      const value = raw === "" ? null : (question.questionType === "integer" || question.questionType === "decimal") && typeof raw === "string" ? Number(raw) : raw;
      return { questionId: question.id, value };
    });
    const answers = parseQuestionnaireAnswers(payload);
    if (!answers || !validateQuestionnaireAnswers(document.template.questions, answers)) { setError("Vérifie les réponses obligatoires et les limites indiquées."); return; }
    setError(null); void onSubmit(answers, needsGrant && !coach ? "granted" : undefined);
  }}>
    <h4>{document.template.name} — version {document.template.version}</h4>
    {health && <section className="questionnaire-consent"><h4>{health.definition.title} — version {health.definition.version}</h4><p className="consent-text">{health.definition.content}</p>
      {health.granted ? <p className="status">Accord déjà enregistré pour cette version.</p> : coach ? <p className="error" role="alert">L’accord du client doit être recueilli via son lien avant toute saisie de réponses de santé par le coach.</p>
        : <fieldset disabled={disabled}><legend>Traitement des données de santé</legend>
          <label><input type="radio" name="health-consent" checked={decision === "granted"} onChange={() => setDecision("granted")} />J’accorde le consentement décrit dans ce document.</label>
          <label><input type="radio" name="health-consent" checked={decision === "refused"} onChange={() => setDecision("refused")} />Je refuse.</label>
          {decision === "refused" && <><p>Aucune réponse au questionnaire ne sera enregistrée.</p><button type="button" onClick={() => void onSubmit([], "refused")}>Enregistrer mon refus</button></>}
        </fieldset>}
    </section>}
    {error && <p className="error" role="alert">{error}</p>}
    <fieldset disabled={blocked}><legend>Réponses au questionnaire</legend>
      {document.template.questions.map(question => {
        const value = values[question.id] ?? null; const constraints = question.validationJson;
        const name = `question-${question.id}`;
        return <div className="questionnaire-field" key={question.id}>{question.questionType !== "multi_choice" && <label htmlFor={name}>{question.label}{question.required ? " (obligatoire)" : " (facultatif)"}</label>}
          {question.questionType === "boolean" ? <select id={name} required={question.required} value={value === true ? "true" : value === false ? "false" : ""} onChange={event => update(question.id, event.target.value === "" ? null : event.target.value === "true")}><option value="">Choisir une réponse</option><option value="true">Oui</option><option value="false">Non</option></select>
            : question.questionType === "single_choice" ? <select id={name} required={question.required} value={typeof value === "string" ? value : ""} onChange={event => update(question.id, event.target.value || null)}><option value="">Choisir une réponse</option>{question.optionsJson?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            : question.questionType === "multi_choice" ? <fieldset id={name}><legend>{question.label}{question.required ? " (obligatoire)" : " (facultatif)"}</legend>{question.optionsJson?.map(option => <label key={option.value}><input type="checkbox" checked={Array.isArray(value) && value.includes(option.value)} onChange={event => {
              const current = Array.isArray(value) ? value : []; update(question.id, event.target.checked ? [...current, option.value] : current.filter(item => item !== option.value));
            }} />{option.label}</label>)}</fieldset>
            : question.questionType === "long_text" ? <textarea id={name} required={question.required} rows={4} minLength={constraints?.minLength} maxLength={constraints?.maxLength ?? 20000} value={typeof value === "string" ? value : ""} onChange={event => update(question.id, event.target.value)} />
            : <input id={name} type={question.questionType === "date" ? "date" : question.questionType === "integer" || question.questionType === "decimal" ? "number" : "text"}
              step={question.questionType === "integer" ? 1 : question.questionType === "decimal" ? "any" : undefined} required={question.required}
              min={constraints?.min} max={constraints?.max} minLength={constraints?.minLength} maxLength={constraints?.maxLength ?? 20000}
              value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={event => update(question.id, event.target.value)} />}
          {constraints && <p className="muted">{constraints.minLength !== undefined && `Minimum : ${constraints.minLength} caractères. `}{constraints.maxLength !== undefined && `Maximum : ${constraints.maxLength} caractères. `}
            {constraints.min !== undefined && `Minimum : ${constraints.min}. `}{constraints.max !== undefined && `Maximum : ${constraints.max}. `}
            {constraints.minSelections !== undefined && `Au moins ${constraints.minSelections} choix. `}{constraints.maxSelections !== undefined && `Au plus ${constraints.maxSelections} choix.`}</p>}
        </div>;
      })}
    </fieldset>
    {coach && <label><input type="checkbox" disabled={blocked} required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Je confirme saisir les réponses recueillies auprès du client pour cette version.</label>}
    <button type="submit" disabled={blocked || coach && !confirmed}>{disabled ? "Enregistrement…" : coach ? document.expectedHeadId ? "Enregistrer une révision corrigée" : "Enregistrer les réponses du client" : "Envoyer mes réponses"}</button>
  </form>;
}
