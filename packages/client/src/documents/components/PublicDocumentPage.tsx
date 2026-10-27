import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileText, LockKeyhole } from "lucide-react";
import { useParams } from "react-router";
import { Button } from "../../components/ui/button.js";
import {
  PublicCard,
  PublicLoading,
  PublicNote,
  PublicShell,
  PublicTitle,
  PublicUnavailable,
  publicPrimaryClass,
} from "../../components/public/PublicShell.js";
import { OtpCodeInput } from "../../auth/components/OtpCodeInput.js";
import { dateFr } from "../../lib/format.js";
import { documentErrorMessage, documentsApi } from "../api/documents-api.js";

const labels: Record<string, string> = {
  meal_plan: "Plan alimentaire",
  workout_plan: "Plan d'entraînement",
  progress_summary: "Bilan de progression",
  progress_photo: "Photo de progression",
  other_personalized: "Document personnalisé",
};
const titles: Record<string, string> = {
  meal_plan: "Ton plan alimentaire",
  workout_plan: "Ton plan d'entraînement",
  progress_summary: "Ton bilan de progression",
  progress_photo: "Ta photo de progression",
  other_personalized: "Ton document",
};

function save(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kfit-document";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Personal document link (board 11e): optional code check, then download. Logic unchanged from S5.5. */
export function PublicDocumentPage() {
  const { token = "" } = useParams();
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = useQuery({
    queryKey: ["public-document", token],
    queryFn: () => documentsApi.publicMeta(token),
    enabled: Boolean(token),
    retry: false,
  });
  const verify = useMutation({
    mutationFn: () => documentsApi.verify(token, code),
    onSuccess: () => {
      setVerified(true);
      setError(null);
    },
    onError: (e) => setError(documentErrorMessage(e, "public")),
  });
  const download = useMutation({
    mutationFn: () => documentsApi.publicDownload(token),
    onSuccess: (b) => {
      save(b);
      setError(null);
    },
    onError: (e) => setError(documentErrorMessage(e, "public")),
  });

  const tag = "Document personnel";
  if (meta.isPending)
    return <PublicLoading label="Chargement du document…" tag={tag} />;
  if (meta.isError || !meta.data)
    return (
      <PublicUnavailable
        title="Lien indisponible"
        message={documentErrorMessage(meta.error, "public")}
        tag={tag}
      />
    );

  const d = meta.data.document;
  const needsCode = d.requiresVerification && !verified;

  if (needsCode) {
    const submit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (code.length === 6 && !verify.isPending) verify.mutate();
    };
    return (
      <PublicShell
        tag={tag}
        actions={
          <Button
            type="submit"
            form="document-code"
            className={publicPrimaryClass}
            disabled={code.length !== 6 || verify.isPending}
          >
            {verify.isPending ? "Vérification…" : "Ouvrir le document"}
          </Button>
        }
      >
        <span
          aria-hidden="true"
          className="flex size-[52px] items-center justify-center rounded-2xl bg-success-soft text-success"
        >
          <LockKeyhole className="size-6" />
        </span>
        <PublicTitle>Un document t'attend</PublicTitle>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Saisis le code que ton coach t'a envoyé séparément pour l'ouvrir.
        </p>
        <form
          id="document-code"
          noValidate
          onSubmit={submit}
          className="flex flex-col gap-2"
        >
          <label
            htmlFor="document-code-input"
            className="text-[13px] font-semibold"
          >
            Code de vérification
          </label>
          <OtpCodeInput
            id="document-code-input"
            value={code}
            onValueChange={setCode}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "document-error" : undefined}
          />
        </form>
        {error ? (
          <p
            id="document-error"
            role="alert"
            className="text-sm font-medium text-danger"
          >
            {error}
          </p>
        ) : null}
        <PublicNote>
          Tu n'as pas le code ? Demande-le à ton coach : il n'est jamais envoyé
          avec le lien.
        </PublicNote>
      </PublicShell>
    );
  }

  return (
    <PublicShell
      tag={tag}
      actions={
        <Button
          className={publicPrimaryClass}
          disabled={download.isPending}
          onClick={() => download.mutate()}
        >
          <Download aria-hidden="true" />
          {download.isPending ? "Téléchargement…" : "Télécharger le document"}
        </Button>
      }
    >
      <PublicTitle>{titles[d.documentType] ?? "Ton document"}</PublicTitle>
      <PublicCard className="flex-row items-center gap-3.5">
        <span
          aria-hidden="true"
          className="flex h-14 w-12 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-primary"
        >
          <FileText className="size-6" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-base font-extrabold">
            {labels[d.documentType] ?? "Document K'FIT"}
          </span>
          <span className="text-[13px] text-muted-foreground">
            Version {d.versionNumber}
          </span>
        </span>
      </PublicCard>
      <PublicCard className="gap-1">
        <span className="text-[13px] font-bold">Ce lien est personnel</span>
        <span className="text-[13px] leading-relaxed text-muted-foreground">
          Valable jusqu'au {dateFr(d.expiresAt)}. Ne le transfère pas : ton
          coach peut le désactiver à tout moment.
        </span>
      </PublicCard>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </PublicShell>
  );
}
