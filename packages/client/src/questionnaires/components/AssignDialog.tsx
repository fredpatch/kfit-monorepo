import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { QuestionnaireAssignmentScope, QuestionnaireTemplate } from "@kfit/shared";
import { questionnaireApi, questionnaireErrorMessage } from "../api/questionnaire-api.js";
import { categoryLabels } from "../lib/questionnaire-meta.js";
import { Dialog, DialogClose, DialogContent } from "../../components/ui/dialog.js";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { NativeSelect } from "../../components/ui/input.js";

const scopeKey = (s: Pick<QuestionnaireAssignmentScope, "serviceId" | "variantId">) => `${s.serviceId}:${s.variantId ?? "service"}`;

/**
 * Assign a PUBLISHED version to an offer or a variant (existing POST /admin/questionnaire-assignments).
 * Same rules as before: a variant without its own assignment inherits the offer's questionnaire.
 */
export function AssignDialog({ open, onOpenChange, scopes, published, defaultTemplateId }: {
  open: boolean; onOpenChange: (open: boolean) => void; scopes: QuestionnaireAssignmentScope[]; published: QuestionnaireTemplate[]; defaultTemplateId: string | null;
}) {
  const client = useQueryClient();
  const [scope, setScope] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = scopes.find((s) => scopeKey(s) === scope) ?? null;

  useEffect(() => {
    if (open) {
      setScope("");
      setTemplateId(defaultTemplateId ?? "");
      setError(null);
    }
  }, [open, defaultTemplateId]);

  async function save() {
    if (!selected) return setError("Choisis une offre ou une variante.");
    setBusy(true);
    setError(null);
    try {
      await questionnaireApi.assign({ serviceId: selected.serviceId, variantId: selected.variantId, questionnaireTemplateId: templateId || null });
      await client.invalidateQueries({ queryKey: ["questionnaire-assignments"] });
      toast.success("Affectation enregistrée.");
      onOpenChange(false);
    } catch (failure) {
      setError(questionnaireErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const effective = selected?.effectiveQuestionnaireTemplateId ? published.find((t) => t.id === selected.effectiveQuestionnaireTemplateId) : null;

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent
        title="Affecter un questionnaire"
        description="Une variante sans affectation propre hérite du questionnaire de son offre."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={busy}>Retour</Button>
            </DialogClose>
            <Button disabled={busy || !selected} onClick={() => void save()}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Offre ou variante">
            {(p) => (
              <NativeSelect {...p} value={scope} onChange={(e) => { setScope(e.target.value); const s = scopes.find((x) => scopeKey(x) === e.target.value); if (s && !defaultTemplateId) setTemplateId(s.questionnaireTemplateId ?? ""); }}>
                <option value="">Choisir…</option>
                {scopes.map((s) => <option key={scopeKey(s)} value={scopeKey(s)}>{s.serviceName}{s.variantName ? ` — ${s.variantName}` : " — toute l'offre"}</option>)}
              </NativeSelect>
            )}
          </Field>
          {selected ? (
            <p className="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
              Actuellement : {effective ? `${effective.name} · v${effective.version}` : selected.effectiveQuestionnaireTemplateId ? "un modèle non publié" : "aucun questionnaire"}
              {selected.variantId && !selected.questionnaireTemplateId && selected.effectiveQuestionnaireTemplateId ? " (hérité de l'offre)" : ""}
            </p>
          ) : null}
          <Field label="Questionnaire">
            {(p) => (
              <NativeSelect {...p} value={templateId} disabled={!selected} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">{selected?.variantId ? "Hériter de l'offre (aucune affectation propre)" : "Aucun questionnaire"}</option>
                {published.map((t) => <option key={t.id} value={t.id}>{t.name} · v{t.version} · {categoryLabels[t.category]}</option>)}
              </NativeSelect>
            )}
          </Field>
          {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger">{error}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
