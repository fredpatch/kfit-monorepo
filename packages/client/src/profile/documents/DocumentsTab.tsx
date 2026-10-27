import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Copy,
  FilePlus2,
  Lock,
  MoreHorizontal,
  Share2,
  ShieldCheck,
} from "lucide-react";
import type {
  DocumentStatus,
  PersonalizedDocument,
  PersonalizedDocumentType,
} from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, NativeSelect } from "../../components/ui/input.js";
import { Field } from "../../components/ui/field.js";
import { Card, CardHeader, CardTitle } from "../../components/ui/card.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { Pill } from "../../components/ui/status-pill.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.js";
import { cn } from "../../lib/utils.js";
import { focusReturnTarget } from "../../lib/focus.js";
import { dateTimeFr, shortDateFr } from "../../lib/format.js";
import {
  documentErrorMessage,
  documentsApi,
} from "../../documents/api/documents-api.js";
import { progressApi } from "../../progress/api/progress-api.js";
import { OneTimeLink } from "../payments/OneTimeLink.js";

/**
 * « Documents » tab (board 15d, UX-15b). Rules unchanged from S5.5: every file is versioned and scanned,
 * a link targets one version (24 h, 3 openings), sensitive documents need a separate code, progress photos are never shared by link.
 */
const labels: Record<PersonalizedDocumentType, string> = {
  meal_plan: "Plan alimentaire",
  workout_plan: "Plan d'entraînement",
  progress_summary: "Bilan de progression",
  progress_photo: "Photo de progression",
  other_personalized: "Document personnalisé",
};
const statusLabels: Record<DocumentStatus, string> = {
  draft: "Brouillon",
  available: "Disponible",
  revoked: "Révoqué",
  archived: "Archivé",
  pending_purge: "Suppression programmée",
  purged: "Supprimé",
};
type UploadType = "meal_plan" | "workout_plan" | "other_personalized";
const accept = ".pdf,.jpg,.jpeg,.png,.webp";
const LINK_HOURS = 24,
  LINK_USES = 3;

const extension = (mime: string) =>
  mime === "application/pdf"
    ? "pdf"
    : mime === "image/png"
      ? "png"
      : mime === "image/webp"
        ? "webp"
        : "jpg";
const size = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`
    : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
const currentOf = (doc: PersonalizedDocument) =>
  doc.versions.find((v) => v.id === doc.currentVersionId) ??
  doc.versions.at(-1);
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** POL-01 D4: one subtitle per creation dialog. */
const newDocumentDescriptions = {
  upload:
    "PDF, JPG, PNG ou WebP · 10 Mo maximum · analyse antivirus avant enregistrement.",
  summary:
    "PDF généré à partir des mesures et objectifs enregistrés · lien protégé par un code.",
  photo: "JPG, PNG ou WebP · 10 Mo maximum · consentement photos requis.",
} as const;

type Dialogs =
  | { kind: "upload" }
  | { kind: "summary" }
  | { kind: "photo" }
  | { kind: "version"; doc: PersonalizedDocument }
  | { kind: "links"; doc: PersonalizedDocument }
  | { kind: "revoke" | "archive"; doc: PersonalizedDocument };

type Issued = {
  docId: string;
  versionNumber: number;
  url: string;
  code?: string;
};

export function DocumentsTab({ subscriptionId }: { subscriptionId: string }) {
  const client = useQueryClient(),
    key = ["documents", subscriptionId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => documentsApi.list(subscriptionId),
  });
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: key });

  function open(next: Dialogs) {
    opener.current = focusReturnTarget();
    setDialog(next);
  }
  const close = () => setDialog(null);
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
  };

  async function share(doc: PersonalizedDocument, versionId: string) {
    setSharing(doc.id);
    try {
      const version = doc.versions.find((v) => v.id === versionId);
      const r = await documentsApi.issueLink(versionId, {
        expiresAt: new Date(Date.now() + LINK_HOURS * 3_600_000).toISOString(),
        maxUses: LINK_USES,
      });
      setIssued({
        docId: doc.id,
        versionNumber: version?.versionNumber ?? 0,
        url: `${window.location.origin}/document/${r.token}`,
        ...(r.verificationCode !== undefined
          ? { code: r.verificationCode }
          : {}),
      });
      await refresh();
    } catch (failure) {
      toast.error(documentErrorMessage(failure));
    } finally {
      setSharing(null);
    }
  }

  async function download(doc: PersonalizedDocument) {
    const v = currentOf(doc);
    if (!v) return;
    try {
      saveBlob(
        await documentsApi.adminDownload(v.id),
        `${labels[doc.documentType]} v${v.versionNumber}.${extension(v.mimeType)}`,
      );
    } catch (failure) {
      toast.error(documentErrorMessage(failure));
    }
  }

  if (query.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Chargement des documents…
      </p>
    );
  if (query.isError)
    return (
      <EmptyState
        title="Documents indisponibles"
        description={documentErrorMessage(query.error)}
        action={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Réessayer
          </Button>
        }
      />
    );

  const all = query.data.documents;
  const files = all.filter((d) => d.documentType !== "progress_photo");
  const live = files.filter(
    (d) => d.status === "available" || d.status === "draft",
  );
  const past = files.filter((d) => !live.includes(d));
  const photos = all.filter(
    (d) => d.documentType === "progress_photo" && d.status === "available",
  );

  const row = (doc: PersonalizedDocument) => {
    const v = currentOf(doc);
    const available = doc.status === "available";
    const activeLink = doc.deliveryLinks
      .filter((l) => l.state === "available")
      .sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt))[0];
    const isPdf = v?.mimeType === "application/pdf";
    return (
      <li key={doc.id} className="flex flex-col gap-3 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold",
              doc.sensitivity === "sensitive_health"
                ? "bg-warning-soft text-warning"
                : isPdf
                  ? "bg-info-soft text-info"
                  : "bg-success-soft text-success",
            )}
          >
            {isPdf ? "PDF" : "IMG"}
          </span>
          <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
            <p className="text-sm font-bold">{labels[doc.documentType]}</p>
            <p className="text-[13px] text-muted-foreground">
              {v
                ? `Version ${v.versionNumber} · ${shortDateFr(v.createdAt)} · ${size(v.sizeBytes)}`
                : "Aucune version"}
              {doc.documentType === "progress_summary"
                ? " · généré à partir des mesures"
                : ""}
            </p>
            <span className="flex flex-wrap gap-1.5">
              {doc.sensitivity === "sensitive_health" ? (
                <Pill size="sm" tone="warning">
                  Donnée sensible · code obligatoire
                </Pill>
              ) : null}
              {available ? (
                activeLink ? (
                  <Pill size="sm" tone="info">
                    Lien actif · expire {dateTimeFr(activeLink.expiresAt)}
                  </Pill>
                ) : (
                  <Pill size="sm" tone="neutral">
                    Privé
                  </Pill>
                )
              ) : (
                <Pill
                  size="sm"
                  tone={doc.status === "revoked" ? "danger" : "neutral"}
                >
                  {statusLabels[doc.status]}
                </Pill>
              )}
            </span>
          </div>
          {available && v ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={sharing === doc.id}
              onClick={() => void share(doc, v.id)}
            >
              <Share2 aria-hidden="true" />
              {sharing === doc.id ? "Création…" : "Partager"}
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Plus d'actions sur ${labels[doc.documentType]}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {v ? (
                <DropdownMenuItem onSelect={() => void download(doc)}>
                  Télécharger
                </DropdownMenuItem>
              ) : null}
              {available && doc.documentType !== "progress_summary" ? (
                <DropdownMenuItem
                  onSelect={() => open({ kind: "version", doc })}
                >
                  Ajouter une version
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => open({ kind: "links", doc })}>
                Versions et liens ({doc.deliveryLinks.length})
              </DropdownMenuItem>
              {available ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => open({ kind: "archive", doc })}
                  >
                    Archiver
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    destructive
                    onSelect={() => open({ kind: "revoke", doc })}
                  >
                    Révoquer le document
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {issued?.docId === doc.id ? (
          <IssuedLink issued={issued} onHide={() => setIssued(null)} />
        ) : null}
      </li>
    );
  };

  return (
    <section aria-labelledby="documents-title" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 basis-full flex-col gap-0.5 sm:basis-auto">
          <h2
            id="documents-title"
            className="text-xl font-extrabold tracking-tight"
          >
            Documents
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Chaque document est versionné. Un lien partagé vise une version
            précise.
          </p>
        </div>
        <Button variant="secondary" onClick={() => open({ kind: "summary" })}>
          <ShieldCheck aria-hidden="true" />
          Générer le bilan de progression
        </Button>
        <Button onClick={() => open({ kind: "upload" })}>
          <FilePlus2 aria-hidden="true" />
          Ajouter un document
        </Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="gap-1 p-5">
          {live.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun document. Ajoute un plan ou génère un bilan de progression.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {live.map(row)}
            </ul>
          )}
          {past.length > 0 ? (
            <details className="border-t border-border-subtle pt-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Documents révoqués ou archivés ({past.length})
              </summary>
              <ul className="flex flex-col divide-y divide-border-subtle">
                {past.map(row)}
              </ul>
            </details>
          ) : null}
        </Card>

        <Card className="gap-3 p-5">
          <CardHeader className="items-center justify-start gap-2">
            <Lock className="size-4" aria-hidden="true" />
            <CardTitle className="text-[15px]">Photos de progression</CardTitle>
          </CardHeader>
          <p className="text-[13px] text-muted-foreground">
            Privées : visibles uniquement ici, jamais partagées par lien.
            Nécessite l'accord « stockage des photos » de la cliente.
          </p>
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune photo.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <PhotoTile key={p.id} doc={p} onOpen={() => void download(p)} />
              ))}
            </ul>
          )}
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => open({ kind: "photo" })}
          >
            Ajouter une photo
          </Button>
        </Card>
      </div>

      {dialog ? (
        <DocumentDialog
          subscriptionId={subscriptionId}
          dialog={dialog}
          onClose={close}
          onDone={refresh}
          onShare={share}
          restoreFocus={restoreFocus}
          issued={issued}
          onHideIssued={() => setIssued(null)}
        />
      ) : null}
    </section>
  );
}

function IssuedLink({
  issued,
  onHide,
}: {
  issued: Issued;
  onHide: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <OneTimeLink
        url={issued.url}
        label="Lien du document"
        meta={`Version ${issued.versionNumber} · valable ${LINK_HOURS} h, ${LINK_USES} ouvertures`}
        onHide={onHide}
      />
      {issued.code ? (
        <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-warning/40 bg-warning-soft p-3 text-[13px]">
          <span>Code à envoyer séparément :</span>
          <strong className="font-mono text-base tracking-widest">
            {issued.code}
          </strong>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void navigator.clipboard.writeText(issued.code!).then(
                () => toast.success("Code copié."),
                () => toast.error("Copie impossible."),
              )
            }
          >
            <Copy aria-hidden="true" />
            Copier le code
          </Button>
          <span className="basis-full text-xs">
            Envoie le code par un autre message que le lien. Ni l'un ni l'autre
            ne sera plus affiché.
          </span>
        </div>
      ) : null}
    </div>
  );
}

function PhotoTile({
  doc,
  onOpen,
}: {
  doc: PersonalizedDocument;
  onOpen: () => void;
}) {
  const v = currentOf(doc);
  const blob = useQuery({
    queryKey: ["document-file", v?.id],
    queryFn: () => documentsApi.adminDownload(v!.id),
    enabled: Boolean(v),
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob.data) return;
    const u = URL.createObjectURL(blob.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob.data]);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
          {url ? (
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
        </span>
        <span className="text-xs font-semibold">
          {v ? shortDateFr(v.createdAt) : "-"}
          <span className="sr-only"> · télécharger la photo</span>
        </span>
      </button>
    </li>
  );
}

type DialogProps = {
  subscriptionId: string;
  dialog: Dialogs;
  onClose: () => void;
  onDone: () => Promise<unknown>;
  onShare: (doc: PersonalizedDocument, versionId: string) => Promise<void>;
  restoreFocus: (event: Event) => void;
  issued: Issued | null;
  onHideIssued: () => void;
};

const titles: Record<Dialogs["kind"], string> = {
  upload: "Ajouter un document",
  summary: "Générer le bilan de progression",
  photo: "Ajouter une photo de progression",
  version: "Ajouter une version",
  links: "Versions et liens",
  revoke: "Révoquer le document",
  archive: "Archiver le document",
};

function DocumentDialog({
  subscriptionId,
  dialog,
  onClose,
  onDone,
  onShare,
  restoreFocus,
  issued,
  onHideIssued,
}: DialogProps) {
  const [type, setType] = useState<UploadType>("meal_plan");
  const [file, setFile] = useState<File | null>(null);
  const [measurementId, setMeasurementId] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [linkVersion, setLinkVersion] = useState(() =>
    "doc" in dialog ? (currentOf(dialog.doc)?.id ?? "") : "",
  );
  const progress = useQuery({
    queryKey: ["progress", subscriptionId],
    queryFn: () => progressApi.progress(subscriptionId),
    enabled: dialog.kind === "photo",
  });
  const docs = useQuery({
    queryKey: ["documents", subscriptionId],
    queryFn: () => documentsApi.list(subscriptionId),
    enabled: dialog.kind === "links",
  });
  const doc =
    "doc" in dialog
      ? (docs.data?.documents.find((d) => d.id === dialog.doc.id) ?? dialog.doc)
      : null;

  async function run(operation: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    try {
      await operation();
      await onDone();
      toast.success(success);
      onClose();
    } catch (failure) {
      setError(documentErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (dialog.kind === "upload") {
      if (!file) return setError("Choisis un fichier.");
      void run(
        () => documentsApi.upload(subscriptionId, type, file),
        "Document enregistré.",
      );
    } else if (dialog.kind === "version") {
      if (!file) return setError("Choisis un fichier.");
      void run(
        () => documentsApi.addVersion(dialog.doc.id, file),
        "Nouvelle version enregistrée.",
      );
    } else if (dialog.kind === "photo") {
      if (!file || !measurementId)
        return setError("Choisis une mesure et une photo.");
      void run(
        () =>
          documentsApi.addPhoto(measurementId, file, { photoType: "progress" }),
        "Photo privée enregistrée.",
      );
    } else if (dialog.kind === "summary") {
      void run(
        () => documentsApi.generateSummary(subscriptionId),
        "Bilan PDF généré.",
      );
    } else if (dialog.kind === "revoke") {
      void run(() => documentsApi.revoke(dialog.doc.id), "Document révoqué.");
    } else if (dialog.kind === "archive") {
      void run(() => documentsApi.archive(dialog.doc.id), "Document archivé.");
    }
  }

  async function revokeLink(id: string) {
    try {
      await documentsApi.revokeLink(id);
      toast.success("Lien révoqué.");
      await onDone();
    } catch (failure) {
      toast.error(documentErrorMessage(failure));
    }
  }

  const fileField = (label: string, accepted: string, hint: string) => (
    <Field label={label} hint={hint}>
      {(p) => (
        <Input
          {...p}
          required
          type="file"
          accept={accepted}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      )}
    </Field>
  );
  const destructive = dialog.kind === "revoke";
  const submitLabel = {
    upload: "Enregistrer",
    summary: "Générer le PDF",
    photo: "Stocker la photo",
    version: "Enregistrer la version",
    revoke: "Révoquer",
    archive: "Archiver",
    links: "",
  }[dialog.kind];

  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent
        title={titles[dialog.kind]}
        description={
          doc
            ? `${labels[doc.documentType]} · ${statusLabels[doc.status]}`
            : newDocumentDescriptions[
                dialog.kind as keyof typeof newDocumentDescriptions
              ]
        }
        className="max-h-[90dvh] max-w-lg overflow-y-auto"
        onCloseAutoFocus={restoreFocus}
      >
        {dialog.kind === "links" && doc ? (
          <div className="flex flex-col gap-4">
            <ul className="flex flex-col gap-1.5">
              {[...doc.versions].reverse().map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-[13px]"
                >
                  <span>
                    Version {v.versionNumber}
                    {v.isCurrent ? " · actuelle" : ""} · {size(v.sizeBytes)} ·{" "}
                    {dateTimeFr(v.createdAt)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-success">
                    <ShieldCheck className="size-3.5" aria-hidden="true" />
                    Analysé
                  </span>
                </li>
              ))}
            </ul>
            {doc.status === "available" ? (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Version à partager" className="min-w-0 flex-1">
                  {(p) => (
                    <NativeSelect
                      {...p}
                      value={linkVersion}
                      onChange={(e) => setLinkVersion(e.target.value)}
                    >
                      {doc.versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          Version {v.versionNumber}
                          {v.isCurrent ? " · actuelle" : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
                <Button
                  disabled={!linkVersion}
                  onClick={() => void onShare(doc, linkVersion)}
                >
                  Créer un lien {LINK_HOURS} h · {LINK_USES} ouvertures
                </Button>
              </div>
            ) : null}
            {issued?.docId === doc.id ? (
              <IssuedLink issued={issued} onHide={onHideIssued} />
            ) : null}
            <div className="flex flex-col">
              <p className="pb-1 text-sm font-bold">Liens émis</p>
              {doc.deliveryLinks.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  Aucun lien émis.
                </p>
              ) : (
                doc.deliveryLinks.map((l) => (
                  <div
                    key={l.id}
                    className="flex flex-wrap items-center gap-2 border-t border-border-subtle py-2 text-[13px]"
                  >
                    <span className="flex-1">
                      Version{" "}
                      {doc.versions.find((v) => v.id === l.versionId)
                        ?.versionNumber ?? "?"}{" "}
                      · {l.useCount}/{l.maxUses ?? "∞"} ouvertures · expire{" "}
                      {dateTimeFr(l.expiresAt)}
                    </span>
                    <Pill
                      size="sm"
                      tone={l.state === "available" ? "info" : "neutral"}
                    >
                      {
                        {
                          available: "Actif",
                          expired: "Expiré",
                          revoked: "Révoqué",
                          exhausted: "Épuisé",
                        }[l.state]
                      }
                    </Pill>
                    {l.state === "available" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void revokeLink(l.id)}
                      >
                        Révoquer
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <fieldset disabled={busy} className="flex flex-col gap-4">
              {dialog.kind === "upload" ? (
                <>
                  <Field label="Type de document">
                    {(p) => (
                      <NativeSelect
                        {...p}
                        value={type}
                        onChange={(e) => setType(e.target.value as UploadType)}
                      >
                        <option value="meal_plan">Plan alimentaire</option>
                        <option value="workout_plan">
                          Plan d'entraînement
                        </option>
                        <option value="other_personalized">
                          Autre document
                        </option>
                      </NativeSelect>
                    )}
                  </Field>
                  {fileField(
                    "Fichier",
                    accept,
                    "PDF, JPG, PNG ou WebP · 10 Mo maximum.",
                  )}
                </>
              ) : null}
              {dialog.kind === "version"
                ? fileField(
                    "Nouveau fichier",
                    accept,
                    "La version actuelle reste conservée ; les liens existants visent toujours leur version.",
                  )
                : null}
              {dialog.kind === "photo" ? (
                <>
                  <Field
                    label="Mesure associée"
                    hint={
                      progress.data &&
                      progress.data.progress.measurements.length === 0
                        ? "Enregistre d'abord une mesure dans Progression."
                        : undefined
                    }
                  >
                    {(p) => (
                      <NativeSelect
                        {...p}
                        required
                        value={measurementId}
                        onChange={(e) => setMeasurementId(e.target.value)}
                      >
                        <option value="">
                          {progress.isPending
                            ? "Chargement…"
                            : "Choisir une mesure…"}
                        </option>
                        {(progress.data?.progress.measurements ?? []).map(
                          (m) => (
                            <option key={m.id} value={m.id}>
                              {dateTimeFr(m.measuredAt)}
                            </option>
                          ),
                        )}
                      </NativeSelect>
                    )}
                  </Field>
                  {fileField(
                    "Photo",
                    ".jpg,.jpeg,.png,.webp",
                    "JPG, PNG ou WebP. Nécessite l'accord « stockage des photos » ; aucune publication n'est créée.",
                  )}
                </>
              ) : null}
              {dialog.kind === "summary" ? (
                <p className="text-sm">
                  Générer un PDF à partir des mesures et objectifs enregistrés ?
                  Le consentement santé de la cliente doit être actuellement
                  accordé. Le bilan est une donnée sensible : son lien exige un
                  code séparé.
                </p>
              ) : null}
              {dialog.kind === "archive" ? (
                <p className="text-sm">
                  Archiver ce document ? Il sort de la liste active et ses liens
                  actifs sont révoqués. Ses versions restent conservées. Action
                  définitive.
                </p>
              ) : null}
              {dialog.kind === "revoke" ? (
                <p className="text-sm">
                  Révoquer ce document ? Tous ses liens sont révoqués et la
                  cliente ne peut plus l'ouvrir. Les versions restent dans
                  l'historique. Action définitive.
                </p>
              ) : null}
              {error ? (
                <p
                  role="alert"
                  className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
                >
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Retour
                </Button>
                <Button
                  type="submit"
                  variant={destructive ? "destructive-solid" : "default"}
                >
                  {busy ? "Enregistrement…" : submitLabel}
                </Button>
              </div>
            </fieldset>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
