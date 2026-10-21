import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseQuestionnaireTemplate, questionTypes, type QuestionInput, type QuestionnaireTemplate, type QuestionnaireTemplateInput, type RiskRule } from "@kfit/shared";
import { questionnaireApi, questionnaireErrorMessage } from "../api/questionnaire-api.js";
const typeLabels = { short_text: "Texte court", long_text: "Texte long", boolean: "Oui / Non", single_choice: "Choix unique", multi_choice: "Choix multiples", integer: "Nombre entier", decimal: "Nombre décimal", date: "Date" };
const operatorLabels = { equals: "Égal à", in: "Parmi les valeurs", gt: "Supérieur à", gte: "Supérieur ou égal à", lt: "Inférieur à", lte: "Inférieur ou égal à" };
const blankQuestion = (index: number): QuestionInput => ({ questionKey: `question_${index}`, label: "", questionType: "boolean", required: true, optionsJson: null, validationJson: null, riskFlagRuleJson: null });
const blankTemplate = (): QuestionnaireTemplateInput => ({ templateKey: "", name: "", category: "assessment", questions: [blankQuestion(1)] });
function QuestionEditor({ question, onChange, onRemove, disabled }: { question: QuestionInput; onChange: (q: QuestionInput) => void; onRemove: () => void; disabled: boolean }) {
  const choice = question.questionType === "single_choice" || question.questionType === "multi_choice";
  const numeric = question.questionType === "integer" || question.questionType === "decimal";
  const string = question.questionType === "short_text" || question.questionType === "long_text";
  const constraints = question.validationJson;
  const boundKeys: (keyof NonNullable<QuestionInput["validationJson"]>)[] = string ? ["minLength", "maxLength"] : numeric || question.questionType === "date" ? ["min", "max"] : question.questionType === "multi_choice" ? ["minSelections", "maxSelections"] : [];
  const boundLabels = { minLength: "Longueur minimale", maxLength: "Longueur maximale", min: "Valeur minimale", max: "Valeur maximale", minSelections: "Nombre minimal de choix", maxSelections: "Nombre maximal de choix" };
  const operators: RiskRule["operator"][] = question.questionType === "multi_choice" ? ["in"] : numeric || question.questionType === "date" ? ["equals", "in", "gt", "gte", "lt", "lte"] : ["equals", "in"];
  const rule = question.riskFlagRuleJson;
  const riskValue = (text: string): string | number | boolean => numeric ? text.trim() ? Number(text) : "" : question.questionType === "boolean" ? text === "true" ? true : text === "false" ? false : text : text;
  return <fieldset className="questionnaire-editor-question" disabled={disabled}><legend>Question</legend>
    <label>Référence de la question<input required pattern="[a-z][a-z0-9_]*" maxLength={80} value={question.questionKey} onChange={event => onChange({ ...question, questionKey: event.target.value })} /></label>
    <label>Libellé présenté au client<input required maxLength={1000} value={question.label} onChange={event => onChange({ ...question, label: event.target.value })} /></label>
    <label>Type de réponse<select value={question.questionType} onChange={event => { const type = questionTypes.find(type => type === event.target.value)!;
      onChange({ ...question, questionType: type, optionsJson: type.endsWith("choice") ? [{ value: "", label: "" }] : null, validationJson: null, riskFlagRuleJson: null }); }}>
      {questionTypes.map(type => <option key={type} value={type}>{typeLabels[type]}</option>)}
    </select></label><p className="muted">Changer le type réinitialise les choix, les limites et la règle de cette question.</p>
    <label><input type="checkbox" checked={question.required} onChange={event => onChange({ ...question, required: event.target.checked })} />Réponse obligatoire</label>
    {choice && <fieldset><legend>Choix proposés</legend>{question.optionsJson?.map((option, index) => <div className="questionnaire-option" key={index}>
      <label>Référence du choix<input required maxLength={100} value={option.value} onChange={event => onChange({ ...question, optionsJson: question.optionsJson!.map((o,i) => i === index ? { ...o, value: event.target.value } : o) })} /></label>
      <label>Libellé du choix<input required maxLength={300} value={option.label} onChange={event => onChange({ ...question, optionsJson: question.optionsJson!.map((o,i) => i === index ? { ...o, label: event.target.value } : o) })} /></label>
      <button type="button" onClick={() => onChange({ ...question, optionsJson: question.optionsJson!.filter((_,i) => i !== index) })}>Retirer ce choix</button>
    </div>)}<button type="button" disabled={(question.optionsJson?.length ?? 0) >= 100} onClick={() => onChange({ ...question, optionsJson: [...question.optionsJson ?? [], { value: "", label: "" }] })}>Ajouter un choix</button></fieldset>}
    {boundKeys.map(key => <label key={key}>{boundLabels[key]} (facultative)<input type={question.questionType === "date" ? "date" : "number"} step={numeric && question.questionType === "decimal" ? "any" : 1} value={constraints?.[key] ?? ""} onChange={event => {
      const next = { ...constraints }; const raw = event.target.value;
      if (raw === "") delete next[key]; else if (key === "min" || key === "max") next[key] = question.questionType === "date" ? raw : Number(raw); else next[key] = Number(raw);
      onChange({ ...question, validationJson: Object.keys(next).length ? next : null });
    }} /></label>)}
    <fieldset><legend>Signalement opérationnel (facultatif)</legend><label>Déclencher un signalement si cette réponse est<select value={rule?.operator ?? ""} onChange={event => {
      const operator = operators.find(op => op === event.target.value); onChange({ ...question, riskFlagRuleJson: operator ? { operator, value: operator === "in" ? [] : question.questionType === "boolean" ? true : numeric ? 0 : "" } : null });
    }}><option value="">Aucune règle</option>{operators.map(op => <option key={op} value={op}>{operatorLabels[op]}</option>)}</select></label>
    {rule && (rule.operator === "in" ? <label>Valeurs déclenchant le signalement (une par ligne){choice && <span className="muted">Utilise les références des choix ci-dessus.</span>}
      <textarea rows={3} required value={Array.isArray(rule.value) ? rule.value.map(String).join("\n") : ""} onChange={event => onChange({ ...question, riskFlagRuleJson: { operator: "in", value: event.target.value.split("\n").map(riskValue) } })} />
    </label> : question.questionType === "boolean" ? <label>Réponse déclenchant le signalement<select value={String(rule.value)} onChange={event => onChange({ ...question, riskFlagRuleJson: { ...rule, value: event.target.value === "true" } })}><option value="true">Oui</option><option value="false">Non</option></select></label>
      : choice ? <label>Choix déclenchant le signalement<select required value={String(rule.value)} onChange={event => onChange({ ...question, riskFlagRuleJson: { ...rule, value: event.target.value } })}><option value="">Choisir</option>{question.optionsJson?.map((option,i) => <option key={i} value={option.value}>{option.label || option.value}</option>)}</select></label>
      : <label>Seuil ou valeur<input required type={numeric ? "number" : question.questionType === "date" ? "date" : "text"} step={question.questionType === "integer" ? 1 : "any"} value={String(rule.value)} onChange={event => onChange({ ...question, riskFlagRuleJson: { ...rule, value: riskValue(event.target.value) } })} /></label>)}
    </fieldset><button type="button" onClick={onRemove}>Retirer la question</button>
  </fieldset>;
}
export function AdminQuestionnaireTemplatesPage() {
  const query = useQuery({ queryKey: ["questionnaire-templates"], queryFn: questionnaireApi.templates });\n  const assignments = useQuery({ queryKey: ["questionnaire-assignments"], queryFn: questionnaireApi.assignments });
  const [form, setForm] = useState<QuestionnaireTemplateInput>(blankTemplate); const [sourceId, setSourceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const inFlight = useRef(false);\n  const [assignmentScope, setAssignmentScope] = useState(""); const [assignmentTemplateId, setAssignmentTemplateId] = useState("");
  async function change(work: () => Promise<unknown>, message: string) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try { await work(); setNotice(message); } catch (failure) { setError(questionnaireErrorMessage(failure)); }
    finally { await Promise.all([query.refetch(), assignments.refetch()]); inFlight.current = false; setBusy(false); }
  }
  function version(template: QuestionnaireTemplate) {
    setSourceId(template.id); setForm({ templateKey: template.templateKey, name: template.name, category: template.category, questions: template.questions.map(({ id: _id, sortOrder: _order, ...q }) => q) }); setError(null); setNotice("Modifie les champs ci-dessous pour créer une nouvelle version.");
  }
  const publishedTemplates = query.data?.templates.filter(template => template.status === "published") ?? [];
  const assignmentRows = assignments.data?.assignments ?? [];
  const selectedScope = assignmentRows.find(scope => `${scope.serviceId}:${scope.variantId ?? "service"}` === assignmentScope) ?? null;
  return <section className="questionnaire-templates"><section className="customers-panel"><h2>Modèles de questionnaires</h2><p>Les versions publiées sont conservées. Toute modification crée une nouvelle version.</p>
    {query.isPending ? <p role="status">Chargement des modèles…</p> : query.isError ? <div role="alert"><p className="error">{questionnaireErrorMessage(query.error)}</p><button type="button" onClick={() => void query.refetch()}>Réessayer</button></div>
      : query.data?.templates.length ? <ul className="onboarding-items">{query.data.templates.map(template => <li key={template.id}><strong>{template.name}</strong><p>Référence : {template.templateKey} · version {template.version} · {template.category === "health" ? "Santé" : "Évaluation"} · {template.status === "draft" ? "Brouillon" : template.status === "published" ? "Publié" : "Retiré"}</p>
        <details><summary>Voir les questions ({template.questions.length})</summary><ol>{template.questions.map(question => <li key={question.id}>{question.label} · {typeLabels[question.questionType]} · {question.required ? "Obligatoire" : "Facultative"}
          {question.optionsJson && <p>Choix : {question.optionsJson.map(o => `${o.label} (${o.value})`).join(", ")}</p>}
          {question.riskFlagRuleJson && <p>Signalement : {operatorLabels[question.riskFlagRuleJson.operator]} {Array.isArray(question.riskFlagRuleJson.value) ? question.riskFlagRuleJson.value.join(", ") : String(question.riskFlagRuleJson.value)}</p>}
        </li>)}</ol></details><div className="onboarding-actions">{template.status === "draft" ? <button type="button" disabled={busy} onClick={() => void change(() => questionnaireApi.publish(template.id), "Version publiée.")}>Publier cette version</button>
          : <button type="button" disabled={busy} onClick={() => version(template)}>Préparer une nouvelle version</button>}</div>
      </li>)}</ul> : <p>Aucun modèle créé.</p>}
  </section><section className="customers-panel"><h2>Affectation aux services</h2>
    <p>Associe un modèle publié à la politique d’un service ou d’une option. Une option sans affectation propre hérite du service.</p>
    {assignments.isPending ? <p role="status">Chargement des affectations…</p> : assignments.isError ? <div role="alert"><p className="error">Impossible de charger les affectations.</p><button type="button" onClick={() => void assignments.refetch()}>Réessayer</button></div> : <>
      <label>Service ou option<select value={assignmentScope} onChange={event => { const value = event.target.value; setAssignmentScope(value); const scope = assignmentRows.find(item => `${item.serviceId}:${item.variantId ?? "service"}` === value); setAssignmentTemplateId(scope?.questionnaireTemplateId ?? ""); }}>
        <option value="">Choisir…</option>{assignmentRows.map(scope => <option key={`${scope.serviceId}:${scope.variantId ?? "service"}`} value={`${scope.serviceId}:${scope.variantId ?? "service"}`}>{scope.serviceName}{scope.variantName ? ` — ${scope.variantName}` : " — Politique du service"}</option>)}
      </select></label>
      {selectedScope && <p className="muted">Affectation effective : {selectedScope.effectiveQuestionnaireTemplateId ? publishedTemplates.find(template => template.id === selectedScope.effectiveQuestionnaireTemplateId)?.name ?? selectedScope.effectiveQuestionnaireTemplateId : "Aucun questionnaire"}</p>}
      <label>Questionnaire<select value={assignmentTemplateId} disabled={!selectedScope || busy} onChange={event => setAssignmentTemplateId(event.target.value)}>
        <option value="">{selectedScope?.variantId ? "Hériter du service / aucun override" : "Aucun questionnaire"}</option>{publishedTemplates.map(template => <option key={template.id} value={template.id}>{template.name} · v{template.version} · {template.category === "health" ? "Santé" : "Évaluation"}</option>)}
      </select></label>
      <button type="button" disabled={!selectedScope || busy} onClick={() => selectedScope && void change(() => questionnaireApi.assign({ serviceId: selectedScope.serviceId, variantId: selectedScope.variantId, questionnaireTemplateId: assignmentTemplateId || null }), "Affectation du questionnaire enregistrée.")}>Enregistrer l’affectation</button>
    </>}
  </section><section className="customers-panel"><h2>{sourceId ? "Nouvelle version" : "Créer un modèle"}</h2>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="status" role="status">{notice}</p>}
    <form className="questionnaire-form" onSubmit={event => { event.preventDefault(); const parsed = parseQuestionnaireTemplate(form); if (!parsed) { setError("Vérifie les références uniques, les choix, les limites et les règles de chaque question."); return; }
      void change(async () => { if (sourceId) await questionnaireApi.newVersion(sourceId, parsed); else await questionnaireApi.create(parsed); setForm(blankTemplate()); setSourceId(null); }, "Brouillon créé. Vérifie-le dans la liste avant publication."); }}>
      <fieldset disabled={busy}><legend>Identité du modèle</legend><label>Référence du modèle<input required pattern="[a-z][a-z0-9_]*" maxLength={80} readOnly={!!sourceId} value={form.templateKey} onChange={event => setForm({ ...form, templateKey: event.target.value })} /></label>
        <label>Titre présenté au client<input required maxLength={300} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
        <label>Catégorie<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value === "health" ? "health" : "assessment" })}><option value="assessment">Évaluation</option><option value="health">Santé — consentement séparé requis</option></select></label>
      </fieldset>
      {form.questions.map((question, index) => <QuestionEditor key={index} question={question} disabled={busy} onChange={q => setForm({ ...form, questions: form.questions.map((old,i) => i === index ? q : old) })} onRemove={() => setForm({ ...form, questions: form.questions.filter((_,i) => i !== index) })} />)}
      <button type="button" disabled={busy || form.questions.length >= 100} onClick={() => { const keys = new Set(form.questions.map(q => q.questionKey)); let index = form.questions.length + 1; while (keys.has(`question_${index}`)) index++; setForm({ ...form, questions: [...form.questions, blankQuestion(index)] }); }}>Ajouter une question</button>
      <div className="onboarding-actions"><button type="submit" disabled={busy || form.questions.length === 0}>{busy ? "Enregistrement…" : "Créer le brouillon"}</button><button type="button" disabled={busy} onClick={() => { setForm(blankTemplate()); setSourceId(null); }}>Recommencer</button></div>
    </form>
  </section></section>;
}
