import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronDown, Copy, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { parseQuestionnaireTemplate, questionTypes, type QuestionInput, type QuestionnaireTemplate, type QuestionnaireTemplateInput, type RiskRule } from "@kfit/shared";
import { questionnaireApi, questionnaireErrorMessage } from "../api/questionnaire-api.js";
import { blankQuestion, nextQuestionKey, operatorLabels, questionSummary, riskSummary, typeLabels } from "../lib/questionnaire-meta.js";
import { QuestionPreview } from "./QuestionPreview.js";
import { Sheet, SheetClose, SheetContent } from "../../components/ui/dialog.js";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input, NativeSelect, Textarea } from "../../components/ui/input.js";
import { Switch } from "../../components/ui/switch.js";
import { SegmentedControl } from "../../components/ui/segmented-control.js";
import { cn } from "../../lib/utils.js";

/*
 * Draft editor (board 07). V1 creates a COMPLETE draft in one request (POST create / new-version) —
 * saving question by question waits for the backlog item « brouillon modifiable ».
 * Validation = the shared parser used by the server (parseQuestionnaireTemplate); same per-question
 * rules as the former editor (type change resets options, bounds and risk rule).
 */

const boundLabels = { minLength: "Longueur minimale", maxLength: "Longueur maximale", min: "Valeur minimale", max: "Valeur maximale", minSelections: "Choix minimum", maxSelections: "Choix maximum" } as const;

function QuestionFields({ question, onChange }: { question: QuestionInput; onChange: (q: QuestionInput) => void }) {
  const choice = question.questionType === "single_choice" || question.questionType === "multi_choice";
  const numeric = question.questionType === "integer" || question.questionType === "decimal";
  const text = question.questionType === "short_text" || question.questionType === "long_text";
  const constraints = question.validationJson;
  const boundKeys: (keyof NonNullable<QuestionInput["validationJson"]>)[] = text ? ["minLength", "maxLength"] : numeric || question.questionType === "date" ? ["min", "max"] : question.questionType === "multi_choice" ? ["minSelections", "maxSelections"] : [];
  const operators: RiskRule["operator"][] = question.questionType === "multi_choice" ? ["in"] : numeric || question.questionType === "date" ? ["equals", "in", "gt", "gte", "lt", "lte"] : ["equals", "in"];
  const rule = question.riskFlagRuleJson;
  const riskValue = (raw: string): string | number | boolean => (numeric ? (raw.trim() ? Number(raw) : "") : question.questionType === "boolean" ? (raw === "true" ? true : raw === "false" ? false : raw) : raw);

  return (
    <div className="flex flex-col gap-4">
      <Field label="Libellé présenté au client">{(p) => <Input {...p} maxLength={1000} value={question.label} onChange={(e) => onChange({ ...question, label: e.target.value })} />}</Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Type de réponse" hint="Changer le type réinitialise les choix, les limites et le signalement.">
          {(p) => (
            <NativeSelect {...p} value={question.questionType} onChange={(e) => {
              const type = questionTypes.find((t) => t === e.target.value)!;
              onChange({ ...question, questionType: type, optionsJson: type.endsWith("choice") ? [{ value: "", label: "" }] : null, validationJson: null, riskFlagRuleJson: null });
            }}>
              {questionTypes.map((t) => <option key={t} value={t}>{typeLabels[t]}</option>)}
            </NativeSelect>
          )}
        </Field>
        <Field label="Clé technique" hint="Minuscules, chiffres et _ ; unique dans le modèle.">
          {(p) => <Input {...p} maxLength={80} value={question.questionKey} onChange={(e) => onChange({ ...question, questionKey: e.target.value })} />}
        </Field>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
        <span className="text-sm font-semibold">Réponse obligatoire</span>
        <Switch checked={question.required} onCheckedChange={(v) => onChange({ ...question, required: v })} aria-label="Réponse obligatoire" />
      </label>

      {choice ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-semibold">Choix proposés</legend>
          {question.optionsJson?.map((option, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <Input aria-label={`Libellé du choix ${i + 1}`} placeholder="Libellé" maxLength={300} value={option.label} onChange={(e) => onChange({ ...question, optionsJson: question.optionsJson!.map((o, j) => (j === i ? { ...o, label: e.target.value } : o)) })} />
              <Input aria-label={`Référence du choix ${i + 1}`} placeholder="référence" maxLength={100} value={option.value} onChange={(e) => onChange({ ...question, optionsJson: question.optionsJson!.map((o, j) => (j === i ? { ...o, value: e.target.value } : o)) })} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Retirer le choix ${i + 1}`} onClick={() => onChange({ ...question, optionsJson: question.optionsJson!.filter((_, j) => j !== i) })}><Trash2 /></Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" className="self-start" disabled={(question.optionsJson?.length ?? 0) >= 100} onClick={() => onChange({ ...question, optionsJson: [...(question.optionsJson ?? []), { value: "", label: "" }] })}>
            <Plus /> Ajouter un choix
          </Button>
        </fieldset>
      ) : null}

      {boundKeys.length ? (
        <div className="grid grid-cols-2 gap-3">
          {boundKeys.map((key) => (
            <Field key={key} label={boundLabels[key]} optionalHint="(facultatif)">
              {(p) => (
                <Input {...p} type={question.questionType === "date" ? "date" : "number"} step={question.questionType === "decimal" ? "any" : 1} value={constraints?.[key] ?? ""}
                  onChange={(e) => {
                    const next = { ...constraints };
                    const raw = e.target.value;
                    if (raw === "") delete next[key];
                    else if (key === "min" || key === "max") next[key] = question.questionType === "date" ? raw : Number(raw);
                    else next[key] = Number(raw);
                    onChange({ ...question, validationJson: Object.keys(next).length ? next : null });
                  }} />
              )}
            </Field>
          ))}
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-3 rounded-lg bg-warning-soft/60 p-3">
        <legend className="sr-only">Signalement à la coach</legend>
        <span className="flex items-center gap-2 text-[13px] font-semibold"><ShieldAlert className="size-4 text-warning" aria-hidden="true" /> Signalement à la coach</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <NativeSelect aria-label="Condition de signalement" value={rule?.operator ?? ""} onChange={(e) => {
            const operator = operators.find((op) => op === e.target.value);
            onChange({ ...question, riskFlagRuleJson: operator ? { operator, value: operator === "in" ? [] : question.questionType === "boolean" ? true : numeric ? 0 : "" } : null });
          }}>
            <option value="">Aucun signalement</option>
            {operators.map((op) => <option key={op} value={op}>Si la réponse {operatorLabels[op]}</option>)}
          </NativeSelect>
          {rule ? (
            rule.operator === "in" ? (
              <Textarea aria-label="Valeurs déclenchant le signalement (une par ligne)" placeholder={choice ? "Références des choix, une par ligne" : "Une valeur par ligne"} rows={2}
                value={Array.isArray(rule.value) ? rule.value.map(String).join("\n") : ""} onChange={(e) => onChange({ ...question, riskFlagRuleJson: { operator: "in", value: e.target.value.split("\n").map(riskValue) } })} />
            ) : question.questionType === "boolean" ? (
              <NativeSelect aria-label="Réponse déclenchant le signalement" value={String(rule.value)} onChange={(e) => onChange({ ...question, riskFlagRuleJson: { ...rule, value: e.target.value === "true" } })}>
                <option value="true">Oui</option>
                <option value="false">Non</option>
              </NativeSelect>
            ) : choice ? (
              <NativeSelect aria-label="Choix déclenchant le signalement" value={String(rule.value)} onChange={(e) => onChange({ ...question, riskFlagRuleJson: { ...rule, value: e.target.value } })}>
                <option value="">Choisir</option>
                {question.optionsJson?.map((o, i) => <option key={i} value={o.value}>{o.label || o.value}</option>)}
              </NativeSelect>
            ) : (
              <Input aria-label="Seuil ou valeur" type={numeric ? "number" : question.questionType === "date" ? "date" : "text"} step={question.questionType === "integer" ? 1 : "any"} value={String(rule.value)}
                onChange={(e) => onChange({ ...question, riskFlagRuleJson: { ...rule, value: riskValue(e.target.value) } })} />
            )
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">Le signalement apparaît sur la fiche client. La réponse détaillée reste dans le questionnaire.</p>
      </fieldset>
    </div>
  );
}

type EditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = new template; otherwise the published/retired version to start from. */
  source: QuestionnaireTemplate | null;
  nextVersion?: number;
  onCreated: (template: QuestionnaireTemplate) => void;
};

export function TemplateEditor({ open, onOpenChange, source, nextVersion, onCreated }: EditorProps) {
  const client = useQueryClient();
  const [form, setForm] = useState<QuestionnaireTemplateInput>({ templateKey: "", name: "", category: "assessment", questions: [blankQuestion(1)] });
  const [expanded, setExpanded] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(source
      ? { templateKey: source.templateKey, name: source.name, category: source.category, questions: source.questions.map(({ id: _id, sortOrder: _order, ...q }) => q) }
      : { templateKey: "", name: "", category: "assessment", questions: [blankQuestion(1)] });
    setExpanded(0);
    setError(null);
  }, [open, source]);

  const setQuestion = (i: number, q: QuestionInput) => setForm((f) => ({ ...f, questions: f.questions.map((old, j) => (j === i ? q : old)) }));
  const move = (i: number, delta: number) => setForm((f) => {
    const qs = [...f.questions];
    const to = i + delta;
    if (to < 0 || to >= qs.length) return f;
    qs.splice(to, 0, ...qs.splice(i, 1));
    setExpanded(to);
    return { ...f, questions: qs };
  });

  async function submit() {
    const parsed = parseQuestionnaireTemplate(form);
    if (!parsed) return setError("Vérifie la référence du modèle, les clés uniques, les choix (libellé et référence uniques), les limites et les règles de signalement de chaque question.");
    setBusy(true);
    setError(null);
    try {
      const response = source ? await questionnaireApi.newVersion(source.id, parsed) : await questionnaireApi.create(parsed);
      await Promise.all([client.invalidateQueries({ queryKey: ["questionnaire-templates"] }), client.invalidateQueries({ queryKey: ["questionnaire-assignments"] })]);
      toast.success(`Brouillon v${response.template.version} créé. Vérifie-le avant publication.`);
      onOpenChange(false);
      onCreated(response.template);
    } catch (failure) {
      setError(questionnaireErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <SheetContent
        className="max-w-[1080px]"
        title={source ? `Nouvelle version · v${nextVersion ?? source.version + 1}` : "Nouveau modèle"}
        description={source ? `Basée sur la v${source.version}. Les réponses déjà reçues restent liées à leur version.` : "Le modèle est créé en brouillon ; il devient utilisable une fois publié et affecté à une offre."}
        footer={
          <>
            <SheetClose asChild>
              <Button variant="secondary" disabled={busy}>Annuler</Button>
            </SheetClose>
            <Button onClick={() => void submit()} disabled={busy || form.questions.length === 0}>{busy ? "Création…" : "Créer le brouillon"}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-5">
            <fieldset disabled={busy} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Titre présenté au client" className="sm:col-span-2">{(p) => <Input {...p} maxLength={300} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
              <Field label="Référence du modèle" hint={source ? "Identique pour toutes les versions." : "Minuscules, chiffres et _ ; ex. bilan_nutrition."}>
                {(p) => <Input {...p} maxLength={80} readOnly={Boolean(source)} disabled={Boolean(source)} value={form.templateKey} onChange={(e) => setForm({ ...form, templateKey: e.target.value })} />}
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">Catégorie</span>
                <SegmentedControl aria-label="Catégorie" size="sm" value={form.category} onValueChange={(category) => setForm({ ...form, category })} options={[{ value: "assessment", label: "Évaluation" }, { value: "health", label: "Santé" }]} />
                {form.category === "health" ? <span className="text-xs text-muted-foreground">Consentement séparé aux données de santé requis.</span> : null}
              </div>
            </fieldset>

            <ol className="flex flex-col gap-2">
              {form.questions.map((q, i) => {
                const open = expanded === i;
                const risk = riskSummary(q);
                return (
                  <li key={i} className={cn("rounded-xl border bg-card", open ? "border-primary ring-1 ring-primary" : "border-border")}>
                    <div className="flex items-center gap-2 p-3">
                      <button type="button" onClick={() => setExpanded(open ? -1 : i)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">{i + 1}</span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-bold">{q.label || <span className="text-muted-foreground">Nouvelle question</span>}</span>
                          <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                            <span>{questionSummary(q)}</span>
                            <span>{q.required ? "Obligatoire" : "Facultative"}</span>
                            {risk ? <span className="font-semibold text-warning">{risk}</span> : null}
                          </span>
                        </span>
                        <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform", open ? "rotate-180" : "")} aria-hidden="true" />
                      </button>
                    </div>
                    {open ? (
                      <div className="flex flex-col gap-4 border-t border-border-subtle p-4">
                        <QuestionFields question={q} onChange={(next) => setQuestion(i, next)} />
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="ghost" size="sm" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /> Monter</Button>
                          <Button type="button" variant="ghost" size="sm" disabled={i === form.questions.length - 1} onClick={() => move(i, 1)}><ArrowDown /> Descendre</Button>
                          <Button type="button" variant="ghost" size="sm" disabled={form.questions.length >= 100} onClick={() => {
                            setForm((f) => ({ ...f, questions: [...f.questions.slice(0, i + 1), { ...q, questionKey: nextQuestionKey(f.questions, q.questionKey.replace(/_\d+$/, "")) }, ...f.questions.slice(i + 1)] }));
                            setExpanded(i + 1);
                          }}><Copy /> Dupliquer</Button>
                          <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => { setForm((f) => ({ ...f, questions: f.questions.filter((_, j) => j !== i) })); setExpanded(-1); }}><Trash2 /> Retirer</Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <Button type="button" variant="secondary" className="self-start" disabled={busy || form.questions.length >= 100} onClick={() => {
              setForm((f) => ({ ...f, questions: [...f.questions, { ...blankQuestion(f.questions.length + 1), questionKey: nextQuestionKey(f.questions) }] }));
              setExpanded(form.questions.length);
            }}>
              <Plus /> Ajouter une question
            </Button>
            {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger">{error}</p> : null}
          </div>
          <aside className="hidden lg:block">
            <div className="sticky top-0 flex flex-col gap-2">
              <h3 className="text-sm font-bold">Aperçu client</h3>
              <QuestionPreview questions={form.questions} title={form.name} focusIndex={expanded} />
            </div>
          </aside>
        </div>
      </SheetContent>
    </Sheet>
  );
}
