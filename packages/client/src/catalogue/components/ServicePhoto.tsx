import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Upload } from "lucide-react";
import {
  catalogueImageMimeTypes,
  catalogueImageRules,
  catalogueImageSrcSet,
  normalizeCatalogueImageAlt,
  type CatalogueAdminServiceOverview,
} from "@kfit/shared";
import {
  catalogueApiClient,
  catalogueErrorMessage,
} from "../api/catalogue-api.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
} from "../../components/ui/dialog.js";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input } from "../../components/ui/input.js";
import { dateFr } from "../../lib/format.js";
import { catalogueKeys } from "../queries/catalogue-keys.js";

/* CAT-04 board 3 (« Photo de l'offre », states A and B) and board 4 (upload dialog). The server re-checks everything. */

const rightsLabel =
  "J'ai le droit d'utiliser cette photo pour promouvoir K'FIT (photo prise par moi, ou achetée sous licence). Aucune cliente n'y est reconnaissable.";
const { minWidth, minHeight, maxBytes, altMaxLength } = catalogueImageRules;

type Picked = {
  file: File;
  url: string;
  width: number | null;
  height: number | null;
  error: string | null;
};

const megabytes = (bytes: number) =>
  `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;

/** Quick checks before sending, so the coach sees the problem at once. */
function readPicked(file: File): Promise<Picked> {
  const url = URL.createObjectURL(file);
  const picked = { file, url, width: null, height: null };
  if (!(catalogueImageMimeTypes as readonly string[]).includes(file.type))
    return Promise.resolve({
      ...picked,
      error: "Format non pris en charge. Utilise une photo JPG, PNG ou WebP.",
    });
  if (file.size > maxBytes)
    return Promise.resolve({ ...picked, error: "La photo dépasse 10 Mo." });
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth,
        height = image.naturalHeight;
      resolve({
        ...picked,
        width,
        height,
        error:
          width < minWidth || height < minHeight
            ? `Photo trop petite : ${minWidth} × ${minHeight} px minimum.`
            : null,
      });
    };
    image.onerror = () =>
      resolve({
        ...picked,
        error:
          "Ce fichier n'est pas une photo lisible. Choisis une photo JPG, PNG ou WebP.",
      });
    image.src = url;
  });
}

export function ServicePhoto({
  service,
  disabled,
}: {
  service: CatalogueAdminServiceOverview;
  disabled: boolean;
}) {
  const client = useQueryClient();
  // Admin lists, the sheet, « Avant publication » and the public catalogue.
  const refresh = () =>
    client.invalidateQueries({ queryKey: catalogueKeys.all });
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [alt, setAlt] = useState("");
  const [rights, setRights] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const image = service.image;
  // C5: the same rule as the public image route (published, public, not archived).
  const publiclyListed =
    service.isPublic &&
    service.publishedAt !== null &&
    service.archivedAt === null &&
    service.availabilityStatus !== "archived";

  useEffect(
    () => () => {
      if (picked) URL.revokeObjectURL(picked.url);
    },
    [picked],
  );

  const choose = () => input.current?.click();
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setServerError(null);
    setPicked(await readPicked(file));
  };
  const close = () => {
    setPicked(null);
    setAlt("");
    setRights(false);
    setServerError(null);
  };

  const save = useMutation({
    mutationFn: () =>
      catalogueApiClient.uploadImage(
        service.id,
        picked!.file,
        normalizeCatalogueImageAlt(alt)!,
      ),
    onSuccess: async () => {
      await refresh();
      toast.success("Photo enregistrée.");
      close();
    },
    onError: (error) => setServerError(catalogueErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => catalogueApiClient.removeImage(service.id),
    onSuccess: async () => {
      await refresh();
      toast.success("Photo retirée.");
      setConfirmRemove(false);
    },
    onError: (error) => toast.error(catalogueErrorMessage(error)),
  });

  const altLength = [...alt.trim()].length;
  const ready =
    picked !== null &&
    picked.error === null &&
    normalizeCatalogueImageAlt(alt) !== null &&
    rights &&
    !save.isPending;

  return (
    <section
      className="flex flex-col gap-3.5 border-b border-border-subtle pb-4"
      aria-labelledby="photo-title"
    >
      <input
        ref={input}
        type="file"
        accept={catalogueImageMimeTypes.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="photo-title" className="text-sm font-bold">
          Photo de l'offre
        </h3>
        {image && publiclyListed ? (
          <span className="text-xs text-muted-foreground">
            Visible sur le catalogue public
          </span>
        ) : null}
      </div>
      {image ? (
        <>
          <img
            src={image.urls.card}
            srcSet={catalogueImageSrcSet(image)}
            sizes="450px"
            width={image.width}
            height={image.height}
            alt={image.altText}
            loading="lazy"
            decoding="async"
            className="aspect-16/10 w-full rounded-xl object-cover"
          />
          <p className="text-xs text-muted-foreground">
            WebP · {image.width} × {image.height} · ajoutée le{" "}
            {dateFr(image.updatedAt)} · droits confirmés
          </p>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold">
              Description de la photo
            </span>
            <p className="text-sm">{image.altText}</p>
            <span className="text-xs text-muted-foreground">
              Lue par les lecteurs d'écran. Pour la changer, remplace la photo.
            </span>
          </div>
          {disabled ? null : (
            <div className="flex flex-wrap gap-2.5">
              <Button variant="secondary" onClick={choose}>
                Remplacer
              </Button>
              <Button
                variant="destructive"
                onClick={() => setConfirmRemove(true)}
              >
                Retirer la photo
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={choose}
            className="flex aspect-16/10 w-full flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-input bg-muted/40 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-success-soft text-primary">
              <Upload aria-hidden="true" className="size-6" />
            </span>
            <span className="text-[15px] font-bold">Ajouter une photo</span>
            <span className="text-xs text-muted-foreground">
              JPG, PNG ou WebP · 10 Mo max · {minWidth} × {minHeight} px minimum
            </span>
          </button>
          <p className="text-xs text-muted-foreground">
            Sans photo, le catalogue affiche la couleur et l'icône de la
            famille.
          </p>
        </>
      )}

      <Dialog
        open={picked !== null}
        onOpenChange={(open) => (open || save.isPending ? undefined : close())}
      >
        <DialogContent
          title={image ? "Remplacer la photo" : "Ajouter une photo"}
          description={service.name}
          className="max-w-xl"
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary" disabled={save.isPending}>
                  Annuler
                </Button>
              </DialogClose>
              <Button disabled={!ready} onClick={() => save.mutate()}>
                {save.isPending ? "Enregistrement…" : "Enregistrer la photo"}
              </Button>
            </>
          }
        >
          {picked ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <img
                  src={picked.url}
                  alt=""
                  className="aspect-16/10 w-full rounded-xl bg-muted object-cover"
                />
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span className="min-w-0 truncate">
                    {picked.file.name} · {megabytes(picked.file.size)}
                    {picked.width
                      ? ` · ${picked.width} × ${picked.height}`
                      : ""}
                  </span>
                  <button
                    type="button"
                    onClick={choose}
                    disabled={save.isPending}
                    className="font-bold text-primary underline-offset-2 hover:underline"
                  >
                    Choisir une autre photo
                  </button>
                </div>
              </div>
              <p className="flex gap-2.5 rounded-xl bg-success-soft px-3.5 py-3 text-[13px] leading-snug text-foreground">
                <ShieldCheck
                  aria-hidden="true"
                  className="mt-px size-4.5 shrink-0 text-primary"
                />
                La photo est recadrée, compressée et nettoyée : la position GPS
                et les infos de l'appareil sont supprimées avant publication.
              </p>
              <Field
                label={
                  <>
                    Description de la photo{" "}
                    <span className="text-danger" aria-hidden="true">
                      *
                    </span>
                  </>
                }
                hint={`Décris ce qu'on voit, en une phrase. ${altLength} / ${altMaxLength}`}
              >
                {(p) => (
                  <Input
                    {...p}
                    required
                    maxLength={altMaxLength}
                    value={alt}
                    onChange={(event) => setAlt(event.target.value)}
                  />
                )}
              </Field>
              <label className="flex items-start gap-3 rounded-xl border border-border p-3.5 text-[13px] leading-normal">
                <input
                  type="checkbox"
                  required
                  className="mt-0.5 size-5 shrink-0 accent-primary"
                  checked={rights}
                  onChange={(event) => setRights(event.target.checked)}
                />
                <span>
                  {rightsLabel}{" "}
                  <span className="text-danger" aria-hidden="true">
                    *
                  </span>
                </span>
              </label>
              {picked.error || serverError ? (
                <p
                  role="alert"
                  className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger"
                >
                  {picked.error ?? serverError}
                </p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmRemove}
        onOpenChange={(open) =>
          remove.isPending ? undefined : setConfirmRemove(open)
        }
      >
        <DialogContent
          title="Retirer la photo ?"
          description="Le catalogue affichera la couleur et l'icône de la famille. La photo est supprimée."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary" disabled={remove.isPending}>
                  Annuler
                </Button>
              </DialogClose>
              <Button
                variant="destructive-solid"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {remove.isPending ? "Retrait…" : "Retirer la photo"}
              </Button>
            </>
          }
        />
      </Dialog>
    </section>
  );
}
