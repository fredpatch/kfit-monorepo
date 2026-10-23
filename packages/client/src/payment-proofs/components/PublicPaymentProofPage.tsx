import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Upload } from "lucide-react";
import { paymentProofMaxBytes, paymentProofMimeTypes, type FinancePaymentMethod } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input } from "../../components/ui/input.js";
import { PublicLoading, PublicNote, PublicShell, PublicTitle, PublicUnavailable, publicPrimaryClass } from "../../components/public/PublicShell.js";
import { cn } from "../../lib/utils.js";
import { dateTimeFr, fromLocalInput } from "../../lib/format.js";
import { paymentProofsApi, paymentProofErrorMessage } from "../api/payment-proofs-api.js";

/** Board 11h order: the most common method first and preselected. */
const methodOptions: ReadonlyArray<{ value: FinancePaymentMethod; label: string }> = [
  { value: "mobile_money", label: "Mobile Money" },
  { value: "bank_transfer", label: "Virement" },
  { value: "cash", label: "Espèces" },
];

/** Payment-proof upload link (board 11h). Validation, upload and single-use behaviour unchanged from S6.3. */
export function PublicPaymentProofPage() {
  const { token = "" } = useParams();
  const [submittedToken, setSubmittedToken] = useState<string | null>(null);
  const submitted = submittedToken === token;
  const query = useQuery({ queryKey: ["public-payment-proof", token], queryFn: () => paymentProofsApi.metadata(token), enabled: Boolean(token) && !submitted, retry: false, refetchOnWindowFocus: false });
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FinancePaymentMethod>("mobile_money");
  const [occurred, setOccurred] = useState("");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const success = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { if (submitted) success.current?.focus(); }, [submitted]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || submitted) return;
    const claimedAmountXaf = Number(amount);
    const claimedOccurredAt = fromLocalInput(occurred);
    if (!Number.isSafeInteger(claimedAmountXaf) || claimedAmountXaf <= 0 || !claimedOccurredAt) { setError("Renseigne un montant entier positif et une date valide."); return; }
    if (!file || file.size === 0 || file.size > paymentProofMaxBytes || !paymentProofMimeTypes.some((value) => value === file.type)) { setError("Choisis un fichier PDF, JPEG, PNG ou WebP non vide, de 10 Mo maximum."); return; }
    inFlight.current = true; setBusy(true); setError(null);
    try {
      await paymentProofsApi.upload(token, file, { claimedAmountXaf, claimedPaymentMethod: method, claimedOccurredAt, claimedExternalReference: reference.trim() || null });
      setSubmittedToken(token);
      setFile(null);
    } catch (failure) {
      setError(paymentProofErrorMessage(failure));
    } finally {
      inFlight.current = false; setBusy(false);
    }
  }

  const tag = "Justificatif";
  if (submitted) {
    return (
      <PublicShell tag={tag} className="items-center justify-center gap-4 py-10 text-center">
        <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-[20px] bg-success-soft text-success"><Check className="size-8" /></span>
        <h1 ref={success} tabIndex={-1} className="text-2xl font-extrabold tracking-tight focus:outline-none">Justificatif envoyé</h1>
        <p role="status" className="text-[15px] leading-relaxed text-muted-foreground">Merci ! Ton coach va le vérifier. L'envoi ne confirme pas encore le paiement : il sera confirmé après cette vérification.</p>
        <p className="text-[13px] text-muted-foreground">Tu peux fermer cette page.</p>
      </PublicShell>
    );
  }
  if (token && query.isPending) return <PublicLoading label="Chargement du lien de dépôt…" tag={tag} />;
  if (!token || query.isError || !query.data) return <PublicUnavailable title="Lien de dépôt indisponible" message={paymentProofErrorMessage(query.error)} tag={tag} onRetry={() => void query.refetch()} />;

  const data = query.data;
  return (
    <PublicShell
      tag={tag}
      actions={<Button type="submit" form="payment-proof-form" className={publicPrimaryClass} disabled={busy}>{busy ? "Envoi et vérification du fichier…" : "Envoyer le justificatif"}</Button>}
    >
      <PublicTitle>Envoyer un justificatif</PublicTitle>
      <p className="text-[15px] leading-relaxed text-muted-foreground">Indique ton paiement et joins la preuve. Ton coach vérifiera avant de le confirmer.</p>

      {data.customerMessage ? (
        <section className="flex flex-col gap-1 rounded-[14px] bg-warning-soft px-3.5 py-3">
          <h2 className="text-xs font-extrabold">Message de ton coach</h2>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{data.customerMessage}</p>
        </section>
      ) : null}

      <form id="payment-proof-form" noValidate onSubmit={submit}>
        <fieldset disabled={busy} className="flex flex-col gap-4">
          <Field label="Montant payé">
            {(control) => (
              <span className="relative block">
                <Input {...control} required type="number" min="1" max="2147483647" step="1" inputMode="numeric" className="h-12 pr-16 text-base font-bold" value={amount} onChange={(event) => setAmount(event.target.value)} />
                <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">FCFA</span>
              </span>
            )}
          </Field>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="pb-1.5 text-[13px] font-semibold">Moyen de paiement</legend>
            <div className="grid grid-cols-3 gap-1.5">
              {methodOptions.map((option) => (
                <label key={option.value} className={cn("flex h-12 cursor-pointer items-center justify-center rounded-xl border bg-card px-1 text-center text-[13px] font-bold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", method === option.value ? "border-primary bg-accent" : "border-input")}>
                  <input type="radio" name="payment-method" value={option.value} checked={method === option.value} onChange={() => setMethod(option.value)} className="sr-only" />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <Field label="Date et heure du paiement" hint="Heure de Libreville.">
            {(control) => <Input {...control} required type="datetime-local" className="h-12" value={occurred} onChange={(event) => setOccurred(event.target.value)} />}
          </Field>

          <Field label="Référence de la transaction" optionalHint="(facultatif)">
            {(control) => <Input {...control} maxLength={200} className="h-12" placeholder="Ex. le numéro du SMS de confirmation" value={reference} onChange={(event) => setReference(event.target.value)} />}
          </Field>

          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-primary/40 bg-card px-4 py-5 text-center has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-xl bg-success-soft text-success"><Upload className="size-5" /></span>
            <span className="text-[15px] font-bold">{file ? file.name : "Prendre une photo ou choisir un fichier"}</span>
            <span id="proof-file-help" className="text-xs text-muted-foreground">{file ? "Touche pour changer de fichier" : "PDF, JPEG, PNG ou WebP · 10 Mo maximum"}</span>
            <input type="file" required accept={paymentProofMimeTypes.join(",")} aria-describedby="proof-file-help" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>

          {error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
        </fieldset>
      </form>

      <PublicNote>Le fichier est contrôlé par un antivirus et reste visible uniquement par ton coach. Lien personnel à usage unique, valable jusqu'au {dateTimeFr(data.expiresAt)} (heure de Libreville). Ne le partage pas.</PublicNote>
    </PublicShell>
  );
}
