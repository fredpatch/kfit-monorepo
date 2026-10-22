import type { QuestionInput, QuestionType, QuestionnaireAssignmentScope, QuestionnaireTemplate, RiskRule } from "@kfit/shared";
import type { StatusDescriptor } from "../../lib/status-map.js";

export const typeLabels: Record<QuestionType, string> = {
  boolean: "Oui / Non",
  short_text: "Texte court",
  long_text: "Texte long",
  single_choice: "Choix unique",
  multi_choice: "Choix multiples",
  integer: "Nombre entier",
  decimal: "Nombre décimal",
  date: "Date",
};
export const operatorLabels: Record<RiskRule["operator"], string> = { equals: "est égale à", in: "fait partie de", gt: "est supérieure à", gte: "est supérieure ou égale à", lt: "est inférieure à", lte: "est inférieure ou égale à" };
export const categoryLabels = { health: "Santé", assessment: "Évaluation" } as const;
export const templateStatus: Record<QuestionnaireTemplate["status"], StatusDescriptor> = {
  draft: { label: "Brouillon", tone: "warning" },
  published: { label: "Publié", tone: "success" },
  retired: { label: "Retiré", tone: "neutral" },
};

/** One family = every version sharing a templateKey, newest first. */
export type TemplateFamily = { key: string; category: QuestionnaireTemplate["category"]; versions: QuestionnaireTemplate[] };
export function familiesOf(templates: QuestionnaireTemplate[]): TemplateFamily[] {
  const map = new Map<string, QuestionnaireTemplate[]>();
  for (const t of templates) map.set(t.templateKey, [...(map.get(t.templateKey) ?? []), t]);
  return [...map.entries()]
    .map(([key, versions]) => {
      const sorted = versions.sort((a, b) => b.version - a.version);
      return { key, category: sorted[0]!.category, versions: sorted };
    })
    .sort((a, b) => (a.versions[0]?.name ?? "").localeCompare(b.versions[0]?.name ?? "", "fr"));
}
/** Version currently used for new assignments: the newest published one. */
export const latestPublished = (f: TemplateFamily) => f.versions.find((v) => v.status === "published") ?? null;
export const openDraft = (f: TemplateFamily) => f.versions.find((v) => v.status === "draft") ?? null;

/** Scopes whose EFFECTIVE questionnaire is one of these template ids. */
export function scopesUsing(assignments: QuestionnaireAssignmentScope[], ids: string[]) {
  return assignments.filter((a) => a.effectiveQuestionnaireTemplateId !== null && ids.includes(a.effectiveQuestionnaireTemplateId));
}

export function questionSummary(q: QuestionInput): string {
  const parts: string[] = [typeLabels[q.questionType]];
  if (q.optionsJson?.length) parts.push(`${q.optionsJson.length} choix`);
  const v = q.validationJson;
  if (v && (v.min !== undefined || v.max !== undefined)) parts.push(`${v.min ?? "…"}–${v.max ?? "…"}`);
  return parts.join(" · ");
}
export function riskSummary(q: QuestionInput): string | null {
  const r = q.riskFlagRuleJson;
  if (!r) return null;
  const label = (value: unknown) => (typeof value === "boolean" ? (value ? "Oui" : "Non") : q.optionsJson?.find((o) => o.value === value)?.label ?? String(value));
  return `Signalé si ${operatorLabels[r.operator]} ${Array.isArray(r.value) ? r.value.map(label).join(", ") : label(r.value)}`;
}

/** Question-level diff between two versions, matched by questionKey. */
export type QuestionDiff = { key: string; label: string; change: "added" | "removed" | "changed" | "same" };
export function diffVersions(from: QuestionnaireTemplate, to: QuestionnaireTemplate): QuestionDiff[] {
  const strip = (q: QuestionInput) => JSON.stringify({ l: q.label, t: q.questionType, r: q.required, o: q.optionsJson, v: q.validationJson, k: q.riskFlagRuleJson });
  const before = new Map(from.questions.map((q) => [q.questionKey, q]));
  const after = new Map(to.questions.map((q) => [q.questionKey, q]));
  const rows: QuestionDiff[] = to.questions.map((q) => {
    const old = before.get(q.questionKey);
    return { key: q.questionKey, label: q.label, change: !old ? "added" : strip(old) === strip(q) ? "same" : "changed" };
  });
  for (const q of from.questions) if (!after.has(q.questionKey)) rows.push({ key: q.questionKey, label: q.label, change: "removed" });
  return rows;
}

export const blankQuestion = (index: number): QuestionInput => ({ questionKey: `question_${index}`, label: "", questionType: "boolean", required: true, optionsJson: null, validationJson: null, riskFlagRuleJson: null });
export function nextQuestionKey(questions: QuestionInput[], base = "question"): string {
  const keys = new Set(questions.map((q) => q.questionKey));
  let i = questions.length + 1;
  while (keys.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}
