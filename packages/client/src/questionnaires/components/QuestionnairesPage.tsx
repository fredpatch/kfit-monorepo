import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, GitCompare, Plus } from "lucide-react";
import type { QuestionnaireTemplate } from "@kfit/shared";
import {
  questionnaireApi,
  questionnaireErrorMessage,
} from "../api/questionnaire-api.js";
import {
  categoryLabels,
  diffVersions,
  familiesOf,
  latestPublished,
  openDraft,
  questionSummary,
  riskSummary,
  scopesUsing,
  templateStatus,
  type TemplateFamily,
} from "../lib/questionnaire-meta.js";
import { QuestionPreview } from "./QuestionPreview.js";
import { TemplateEditor } from "./TemplateEditor.js";
import { AssignDialog } from "./AssignDialog.js";
import { AdminPage } from "../../app/layout/AdminPage.js";
import { Button } from "../../components/ui/button.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
} from "../../components/ui/dialog.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { cn } from "../../lib/utils.js";
import { dateFr } from "../../lib/format.js";
import { familyMeta, familyOfSlug } from "../../lib/families.js";

const diffTone = {
  added: { label: "Ajoutée", tone: "success" },
  changed: { label: "Modifiée", tone: "warning" },
  removed: { label: "Retirée", tone: "danger" },
  same: null,
} as const;
const nameSlug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

/** Questionnaires (board 07). Existing endpoints only; a draft is created complete and published as is (backlog « brouillon modifiable »). */
export function QuestionnairesPage() {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const templatesQuery = useQuery({
    queryKey: ["questionnaire-templates"],
    queryFn: questionnaireApi.templates,
  });
  const assignmentsQuery = useQuery({
    queryKey: ["questionnaire-assignments"],
    queryFn: questionnaireApi.assignments,
  });
  const [editor, setEditor] = useState<{
    source: QuestionnaireTemplate | null;
  } | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [compare, setCompare] = useState(false);
  const [confirm, setConfirm] = useState<{
    kind: "publish" | "migrate";
    template: QuestionnaireTemplate;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const families = useMemo(
    () => familiesOf(templatesQuery.data?.templates ?? []),
    [templatesQuery.data],
  );
  const assignments = assignmentsQuery.data?.assignments ?? [];
  const published = (templatesQuery.data?.templates ?? []).filter(
    (t) => t.status === "published",
  );
  const family =
    families.find((f) => f.key === params.get("modele")) ?? families[0] ?? null;
  const version =
    family?.versions.find((v) => String(v.version) === params.get("v")) ??
    (family ? (openDraft(family) ?? family.versions[0]) : null) ??
    null;
  const previous =
    family && version
      ? (family.versions.find(
          (v) => v.version < version.version && v.status !== "draft",
        ) ?? null)
      : null;
  const draft = family ? openDraft(family) : null;
  const latest = family ? latestPublished(family) : null;
  const familyIds = family?.versions.map((v) => v.id) ?? [];
  const usage = scopesUsing(assignments, familyIds);
  const outdated = latest
    ? usage.filter(
        (s) =>
          s.questionnaireTemplateId !== null &&
          s.questionnaireTemplateId !== latest.id &&
          familyIds.includes(s.questionnaireTemplateId),
      )
    : [];
  const diff =
    compare && version && previous ? diffVersions(previous, version) : null;

  const select = (f: TemplateFamily, v?: number) => {
    const merged = new URLSearchParams(params);
    merged.set("modele", f.key);
    if (v) merged.set("v", String(v));
    else merged.delete("v");
    setParams(merged, { replace: true });
    setCompare(false);
  };
  const back = () => {
    const merged = new URLSearchParams(params);
    merged.delete("modele");
    merged.delete("v");
    setParams(merged, { replace: true });
  };

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === "publish") {
        await questionnaireApi.publish(confirm.template.id);
        toast.success(`Version ${confirm.template.version} publiée.`);
      } else {
        // Explicit coach action: move OWN assignments of older versions to the newest published one. Inherited variants follow their offer.
        for (const scope of outdated)
          await questionnaireApi.assign({
            serviceId: scope.serviceId,
            variantId: scope.variantId,
            questionnaireTemplateId: confirm.template.id,
          });
        toast.success(
          `${outdated.length} affectation(s) passée(s) à la v${confirm.template.version}.`,
        );
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: ["questionnaire-templates"] }),
        client.invalidateQueries({ queryKey: ["questionnaire-assignments"] }),
      ]);
      setConfirm(null);
    } catch (failure) {
      toast.error(questionnaireErrorMessage(failure));
      await client.invalidateQueries({
        queryKey: ["questionnaire-assignments"],
      });
    } finally {
      setBusy(false);
    }
  }

  const groups = (["health", "assessment"] as const)
    .map((category) => ({
      category,
      items: families.filter((f) => f.category === category),
    }))
    .filter((g) => g.items.length);

  return (
    <AdminPage
      title="Questionnaires"
      description="Les versions publiées sont figées : toute modification prépare une nouvelle version."
      actions={
        <Button onClick={() => setEditor({ source: null })}>
          <Plus /> Nouveau modèle
        </Button>
      }
    >
      {templatesQuery.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Chargement des modèles…
        </p>
      ) : templatesQuery.isError ? (
        <EmptyState
          title="Impossible de charger les modèles"
          description={questionnaireErrorMessage(templatesQuery.error)}
          action={
            <Button
              variant="secondary"
              onClick={() => void templatesQuery.refetch()}
            >
              Réessayer
            </Button>
          }
        />
      ) : families.length === 0 ? (
        <EmptyState
          title="Aucun modèle"
          description="Crée un premier questionnaire : il sera envoyé aux clients des offres auxquelles tu l'affectes."
          action={
            <Button onClick={() => setEditor({ source: null })}>
              <Plus /> Nouveau modèle
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          {/* Families */}
          <nav
            aria-label="Modèles"
            className={cn(
              "flex flex-col gap-4 rounded-xl border border-border bg-card p-3",
              params.get("modele") ? "hidden lg:flex" : "",
            )}
          >
            {groups.map((g) => (
              <div key={g.category} className="flex flex-col gap-1">
                <span className="px-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {categoryLabels[g.category]}
                </span>
                {g.items.map((f) => {
                  const head = f.versions[0]!;
                  const inUse = scopesUsing(
                    assignments,
                    f.versions.map((v) => v.id),
                  ).length;
                  const selected = f.key === family?.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => select(f)}
                      aria-current={selected ? "true" : undefined}
                      className={cn(
                        "flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-[#b9d7ac] bg-[#f5faf2]"
                          : "border-transparent hover:bg-muted",
                      )}
                    >
                      <span className="text-sm font-bold">{head.name}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>v{head.version}</span>
                        <StatusPill
                          size="sm"
                          status={templateStatus[head.status]}
                        />
                        <span>
                          {inUse ? `${inUse} affectation(s)` : "Non affecté"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Selected version */}
          {family && version ? (
            <section
              className={cn(
                "flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6",
                params.get("modele") ? "" : "hidden lg:flex",
              )}
            >
              <button
                type="button"
                onClick={back}
                className="-mb-1 flex items-center gap-1.5 self-start text-[13px] font-semibold text-primary lg:hidden"
              >
                <ArrowLeft className="size-4" aria-hidden="true" /> Modèles
              </button>
              <div className="flex flex-col gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="text-xl font-extrabold leading-tight">
                    {version.name}
                  </h2>
                  <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    <StatusPill
                      size="sm"
                      status={templateStatus[version.status]}
                    />
                    <span>
                      v{version.version} · {categoryLabels[version.category]} ·
                      clé <code className="text-xs">{version.templateKey}</code>
                    </span>
                    {version.publishedAt ? (
                      <span>· publiée le {dateFr(version.publishedAt)}</span>
                    ) : previous ? (
                      <span>· basée sur la v{previous.version}</span>
                    ) : null}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {previous ? (
                    <Button
                      variant="ghost"
                      onClick={() => setCompare((c) => !c)}
                      aria-pressed={compare}
                    >
                      <GitCompare />{" "}
                      {compare
                        ? "Masquer la comparaison"
                        : `Comparer avec v${previous.version}`}
                    </Button>
                  ) : null}
                  {version.status === "draft" ? (
                    <Button
                      onClick={() =>
                        setConfirm({ kind: "publish", template: version })
                      }
                    >
                      Publier la v{version.version}
                    </Button>
                  ) : draft ? (
                    <Button
                      variant="secondary"
                      onClick={() => select(family, draft.version)}
                    >
                      Ouvrir le brouillon v{draft.version}
                    </Button>
                  ) : (
                    <Button onClick={() => setEditor({ source: version })}>
                      Préparer une nouvelle version
                    </Button>
                  )}
                </div>
              </div>

              {family.versions.length > 1 ? (
                <div
                  role="group"
                  aria-label="Versions"
                  className="flex flex-wrap gap-1.5"
                >
                  {family.versions.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={v.id === version.id}
                      onClick={() => select(family, v.version)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-bold",
                        v.id === version.id
                          ? "border-primary bg-primary text-white"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      v{v.version} · {templateStatus[v.status].label}
                    </button>
                  ))}
                </div>
              ) : null}

              {version.status === "draft" ? (
                <p className="rounded-lg bg-info-soft px-3.5 py-2.5 text-[13px] text-info">
                  Brouillon : vérifie les questions et l'aperçu, puis publie.
                  Une fois publiée, la version est figée. Les réponses déjà
                  reçues restent liées à leur version.
                </p>
              ) : null}
              {latest && version.id === latest.id && outdated.length ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-warning-soft px-3.5 py-2.5">
                  <span className="flex-[1_1_240px] text-[13px] text-warning">
                    {outdated.length} affectation(s) utilisent encore une
                    ancienne version : les nouveaux liens y restent tant
                    qu'elles ne passent pas à la v{latest.version}.
                  </span>
                  <Button
                    size="sm"
                    className="bg-warning hover:bg-warning/90"
                    onClick={() =>
                      setConfirm({ kind: "migrate", template: latest })
                    }
                  >
                    Passer à la v{latest.version}
                  </Button>
                </div>
              ) : null}

              <ol className="flex flex-col gap-2">
                {(
                  diff ??
                  version.questions.map((q) => ({
                    key: q.questionKey,
                    label: q.label,
                    change: "same" as const,
                  }))
                ).map((row, i) => {
                  const q =
                    version.questions.find((x) => x.questionKey === row.key) ??
                    previous?.questions.find((x) => x.questionKey === row.key);
                  if (!q) return null;
                  const badge = diffTone[row.change];
                  const risk = riskSummary(q);
                  return (
                    <li
                      key={row.key}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border border-border px-3.5 py-3",
                        row.change === "removed"
                          ? "bg-danger-soft/40 opacity-80"
                          : "",
                      )}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">
                        {row.change === "removed" ? "-" : i + 1}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span
                          className={cn(
                            "text-sm font-bold",
                            row.change === "removed" ? "line-through" : "",
                          )}
                        >
                          {q.label}
                        </span>
                        <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                          <span>{questionSummary(q)}</span>
                          <span>
                            {q.required ? "Obligatoire" : "Facultative"}
                          </span>
                          {risk ? (
                            <span className="font-semibold text-warning">
                              {risk}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      {badge ? <StatusPill size="sm" status={badge} /> : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          {/* Preview + usage */}
          {family && version ? (
            <aside
              className={cn(
                "flex min-w-0 flex-col gap-5 lg:col-start-2 xl:col-start-auto",
                params.get("modele") ? "" : "hidden lg:flex",
              )}
            >
              <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
                <h2 className="text-base font-bold">Aperçu client</h2>
                <QuestionPreview
                  key={version.id}
                  questions={version.questions}
                  title={version.name}
                />
              </section>
              <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold">Utilisé par</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!latest}
                    onClick={() => setAssigning(true)}
                  >
                    <Plus /> Affecter
                  </Button>
                </div>
                {!latest ? (
                  <p className="text-[13px] text-muted-foreground">
                    Publie une version pour pouvoir l'affecter à une offre.
                  </p>
                ) : null}
                {usage.length === 0 ? (
                  latest ? (
                    <p className="text-[13px] text-muted-foreground">
                      Aucune offre n'utilise ce questionnaire.
                    </p>
                  ) : null
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {usage.map((s) => {
                      const used = family.versions.find(
                        (v) => v.id === s.effectiveQuestionnaireTemplateId,
                      );
                      return (
                        <li
                          key={`${s.serviceId}:${s.variantId ?? "service"}`}
                          className="flex items-start gap-2.5 text-[13px]"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "mt-1.5 size-2 shrink-0 rounded-[2px]",
                              familyMeta[familyOfSlug(nameSlug(s.serviceName))]
                                .dotClass,
                            )}
                          />
                          <span className="flex flex-col">
                            <span className="font-semibold">
                              {s.serviceName}
                              {s.variantName ? ` - ${s.variantName}` : ""}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {s.variantId && !s.questionnaireTemplateId
                                ? "hérite de l'offre"
                                : s.variantId
                                  ? "affectation propre à la variante"
                                  : "toute l'offre"}{" "}
                              · v{used?.version ?? "?"}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  Une variante sans affectation propre hérite du questionnaire
                  de son offre.
                </p>
              </section>
            </aside>
          ) : null}
        </div>
      )}

      <TemplateEditor
        open={editor !== null}
        onOpenChange={(o) => (o ? undefined : setEditor(null))}
        source={editor?.source ?? null}
        {...(editor?.source && family
          ? {
              nextVersion:
                Math.max(...family.versions.map((v) => v.version)) + 1,
            }
          : {})}
        onCreated={(t) => {
          const merged = new URLSearchParams(params);
          merged.set("modele", t.templateKey);
          merged.set("v", String(t.version));
          setParams(merged, { replace: true });
        }}
      />
      <AssignDialog
        open={assigning}
        onOpenChange={setAssigning}
        scopes={assignments}
        published={published}
        defaultTemplateId={latest?.id ?? null}
      />
      <Dialog
        open={confirm !== null}
        onOpenChange={(o) => (!o && !busy ? setConfirm(null) : undefined)}
      >
        {confirm ? (
          <DialogContent
            title={
              confirm.kind === "publish"
                ? `Publier la v${confirm.template.version}`
                : `Passer les affectations à la v${confirm.template.version}`
            }
            description={
              confirm.kind === "publish"
                ? "La version devient figée et peut être affectée aux offres. Les affectations existantes ne changent pas automatiquement."
                : `${outdated.length} affectation(s) utiliseront la v${confirm.template.version} pour les nouveaux liens. Les réponses déjà reçues restent liées à leur version.`
            }
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="secondary" disabled={busy}>
                    Retour
                  </Button>
                </DialogClose>
                <Button disabled={busy} onClick={() => void runConfirm()}>
                  {busy ? "Enregistrement…" : "Confirmer"}
                </Button>
              </>
            }
          />
        ) : null}
      </Dialog>
    </AdminPage>
  );
}
