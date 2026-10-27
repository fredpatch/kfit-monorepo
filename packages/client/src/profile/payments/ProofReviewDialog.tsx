import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, ShieldCheck } from "lucide-react";
import {
  financePaymentMethods,
  type FinancePaymentMethod,
  type PaymentProof,
} from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, NativeSelect, Textarea } from "../../components/ui/input.js";
import { Field } from "../../components/ui/field.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
import { cn } from "../../lib/utils.js";
import {
  dateTimeFr,
  fromLocalInput,
  moneyXaf,
  toLocalInput,
} from "../../lib/format.js";
import {
  paymentProofsApi,
  paymentProofErrorMessage,
  type ProofReviewAction,
} from "../../payment-proofs/api/payment-proofs-api.js";
import {
  fileKind,
  paymentMethods,
  proofStatus,
  sizeKo,
} from "./payments-meta.js";

/** Board 15b: file on the left, what the client declared and the coach's decision on the right. */
const decisions: Array<{
  action: ProofReviewAction;
  label: string;
  cta: string;
  tone: string;
}> = [
  {
    action: "confirm",
    label: "Confirmer",
    cta: "Confirmer et créer le paiement",
    tone: "border-primary text-primary",
  },
  {
    action: "partiallyConfirm",
    label: "Confirmer partiellement",
    cta: "Confirmer partiellement",
    tone: "border-primary text-primary",
  },
  {
    action: "requestCorrection",
    label: "Demander une correction",
    cta: "Enregistrer la demande de correction",
    tone: "border-warning text-warning",
  },
  {
    action: "reject",
    label: "Rejeter",
    cta: "Rejeter le justificatif",
    tone: "border-danger text-danger",
  },
  {
    action: "markDuplicate",
    label: "Doublon",
    cta: "Marquer comme doublon",
    tone: "border-neutral text-neutral",
  },
];
const noMoneyNote: Partial<Record<ProofReviewAction, string>> = {
  requestCorrection:
    "Tu pourras ensuite créer le lien de correction ; ton message s'y affichera.",
  reject: "Les déclarations de la cliente restent conservées.",
  markDuplicate: "Le justificatif reste dans l'historique.",
};

const extension = (mime: string) =>
  mime === "application/pdf"
    ? "pdf"
    : mime === "image/png"
      ? "png"
      : mime === "image/webp"
        ? "webp"
        : "jpg";

function useProofFile(proof: PaymentProof) {
  const query = useQuery({
    queryKey: ["payment-proof-file", proof.id],
    queryFn: () => paymentProofsApi.document(proof.id),
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data) return;
    const objectUrl = URL.createObjectURL(query.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [query.data]);
  return { query, url };
}

type Props = {
  subscriptionId: string;
  proof: PaymentProof;
  /** « échéance 3 » - the first open installment, so the coach sees where the money will land. */
  firstOpenInstallment: string | null;
  onClose: () => void;
  onCreateCorrectionLink: (proof: PaymentProof) => void;
  onCloseAutoFocus: (event: Event) => void;
};

export function ProofReviewDialog({
  subscriptionId,
  proof,
  firstOpenInstallment,
  onClose,
  onCreateCorrectionLink,
  onCloseAutoFocus,
}: Props) {
  const client = useQueryClient();
  const file = useProofFile(proof);
  const pending = proof.status === "pending_review";
  const [action, setAction] = useState<ProofReviewAction>("confirm");
  const [amount, setAmount] = useState(String(proof.claimedAmountXaf));
  const [method, setMethod] = useState<FinancePaymentMethod>(
    proof.claimedPaymentMethod,
  );
  const [occurred, setOccurred] = useState(() =>
    toLocalInput(new Date(proof.claimedOccurredAt)),
  );
  const [reference, setReference] = useState(
    proof.claimedExternalReference ?? "",
  );
  const [note, setNote] = useState(""),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const confirming = action === "confirm" || action === "partiallyConfirm";
  const decision = decisions.find((d) => d.action === action)!;

  function pick(next: ProofReviewAction) {
    setAction(next);
    setError(null);
    // Full confirmation must equal the declaration; a partial one is typed by the coach.
    if (next === "confirm") setAmount(String(proof.claimedAmountXaf));
    if (next === "partiallyConfirm") setAmount("");
  }

  async function download() {
    try {
      const blob =
        file.query.data ?? (await paymentProofsApi.document(proof.id));
      const objectUrl = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `justificatif-${proof.id}.${extension(proof.mimeType)}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (failure) {
      toast.error(paymentProofErrorMessage(failure));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    let run: () => Promise<unknown>;
    if (confirming) {
      const confirmedAmountXaf = Number(amount),
        confirmedOccurredAt = fromLocalInput(occurred);
      const amountOk =
        Number.isSafeInteger(confirmedAmountXaf) &&
        confirmedAmountXaf > 0 &&
        (action === "confirm"
          ? confirmedAmountXaf === proof.claimedAmountXaf
          : confirmedAmountXaf < proof.claimedAmountXaf);
      if (!confirmedOccurredAt || !amountOk) {
        setError(
          action === "confirm"
            ? "Une confirmation complète égale le montant déclaré. Pour un autre montant, choisis « Confirmer partiellement »."
            : `Le montant partiel doit être positif et inférieur à ${moneyXaf(proof.claimedAmountXaf)}.`,
        );
        return;
      }
      run = () =>
        paymentProofsApi.review(proof.id, action, {
          confirmedAmountXaf,
          confirmedOccurredAt,
          confirmedPaymentMethod: method,
          externalReference: reference.trim() || null,
          reviewNote: note.trim() || null,
        });
    } else {
      run = () =>
        paymentProofsApi.review(proof.id, action, {
          reviewNote: note.trim() || null,
          ...(action === "requestCorrection"
            ? { customerMessage: message.trim() || null }
            : {}),
        });
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await run();
      onClose();
      toast.success(
        confirming
          ? "Paiement confirmé et réparti par le serveur."
          : "Décision enregistrée. Aucun paiement n'a été créé.",
      );
    } catch (failure) {
      setError(paymentProofErrorMessage(failure));
    } finally {
      await Promise.allSettled([
        client.invalidateQueries({
          queryKey: ["payment-proofs", subscriptionId],
        }),
        client.invalidateQueries({ queryKey: ["finance", subscriptionId] }),
      ]);
      inFlight.current = false;
      setBusy(false);
    }
  }

  const preview = (
    <div className="flex min-w-0 flex-1 basis-[340px] flex-col gap-3 bg-muted/60 p-5">
      <div className="flex h-[420px] items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
        {file.query.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Chargement du fichier…
          </p>
        ) : null}
        {file.query.isError ? (
          <p role="alert" className="px-6 text-center text-sm text-danger">
            {paymentProofErrorMessage(file.query.error)}
          </p>
        ) : null}
        {file.url && proof.mimeType.startsWith("image/") ? (
          <img
            src={file.url}
            alt="Justificatif déposé par la cliente"
            className="max-h-full max-w-full object-contain"
          />
        ) : null}
        {file.url && proof.mimeType === "application/pdf" ? (
          <iframe
            src={file.url}
            title="Justificatif PDF"
            className="size-full"
          />
        ) : null}
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <FileText className="size-3.5" aria-hidden="true" />
          {fileKind(proof.mimeType)} · {sizeKo(proof.sizeBytes)}
        </span>
        {/* Uploads are stored only after a clean antivirus scan (S6.4). */}
        <span className="inline-flex items-center gap-1 text-success">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Antivirus : aucun problème détecté
        </span>
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => void download()}
      >
        <Download aria-hidden="true" />
        Télécharger le justificatif
      </Button>
    </div>
  );

  const declared = (
    <div className="flex flex-col gap-2 rounded-lg bg-muted p-4">
      <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
        Déclaré par la cliente
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Montant</dt>
        <dd className="font-bold tabular-nums">
          {moneyXaf(proof.claimedAmountXaf)}
        </dd>
        <dt className="text-muted-foreground">Moyen</dt>
        <dd className="font-bold">
          {paymentMethods[proof.claimedPaymentMethod]}
        </dd>
        <dt className="text-muted-foreground">Date</dt>
        <dd className="font-bold">{dateTimeFr(proof.claimedOccurredAt)}</dd>
        {proof.claimedExternalReference ? (
          <>
            <dt className="text-muted-foreground">Référence</dt>
            <dd className="break-all font-bold">
              {proof.claimedExternalReference}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        title={pending ? "Vérifier le justificatif" : "Justificatif"}
        description={`Déposé le ${dateTimeFr(proof.submittedAt)}${proof.supersedesProofId ? " · remplace un justificatif à corriger" : ""}`}
        className="max-h-[92dvh] max-w-[1040px] gap-0 overflow-y-auto p-0 [&>div:first-child]:border-b [&>div:first-child]:border-border-subtle [&>div:first-child]:px-6 [&>div:first-child]:py-4"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="flex flex-wrap">
          {preview}
          <div className="flex min-w-0 flex-1 basis-[420px] flex-col gap-4 p-5">
            {declared}
            {pending ? (
              <form id="proof-review" onSubmit={submit}>
                <fieldset disabled={busy} className="flex flex-col gap-4">
                  <fieldset className="flex flex-col gap-2">
                    <legend className="pb-2 text-sm font-bold">
                      Ta décision
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {decisions.map((d) => {
                        const disabled =
                          d.action === "partiallyConfirm" &&
                          proof.claimedAmountXaf < 2;
                        return (
                          <label
                            key={d.action}
                            className={cn(
                              "relative inline-flex h-9 cursor-pointer items-center rounded-md border bg-card px-3 text-[13px] font-bold transition-colors focus-within:ring-2 focus-within:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
                              action === d.action
                                ? cn("border-[1.5px] bg-muted", d.tone)
                                : "border-input text-foreground hover:bg-muted",
                            )}
                          >
                            <input
                              type="radio"
                              name="decision"
                              value={d.action}
                              checked={action === d.action}
                              disabled={disabled}
                              onChange={() => pick(d.action)}
                              className="sr-only"
                            />
                            {d.label}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {confirming ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Montant confirmé (XAF)"
                          hint={
                            action === "confirm"
                              ? "Égal au montant déclaré."
                              : `Inférieur à ${moneyXaf(proof.claimedAmountXaf)}.`
                          }
                        >
                          {(p) => (
                            <Input
                              {...p}
                              required
                              type="number"
                              inputMode="numeric"
                              step="1"
                              min="1"
                              max={
                                action === "confirm"
                                  ? proof.claimedAmountXaf
                                  : proof.claimedAmountXaf - 1
                              }
                              readOnly={action === "confirm"}
                              value={amount}
                              onChange={(e) => setAmount(e.target.value)}
                            />
                          )}
                        </Field>
                        <Field label="Moyen de paiement confirmé">
                          {(p) => (
                            <NativeSelect
                              {...p}
                              value={method}
                              onChange={(e) => {
                                const selected = financePaymentMethods.find(
                                  (m) => m === e.target.value,
                                );
                                if (selected) setMethod(selected);
                              }}
                            >
                              {financePaymentMethods.map((m) => (
                                <option key={m} value={m}>
                                  {paymentMethods[m]}
                                </option>
                              ))}
                            </NativeSelect>
                          )}
                        </Field>
                        <Field label="Date du paiement (Libreville)">
                          {(p) => (
                            <Input
                              {...p}
                              required
                              type="datetime-local"
                              value={occurred}
                              onChange={(e) => setOccurred(e.target.value)}
                            />
                          )}
                        </Field>
                        <Field
                          label="Référence externe"
                          optionalHint="(facultatif)"
                        >
                          {(p) => (
                            <Input
                              {...p}
                              maxLength={200}
                              value={reference}
                              onChange={(e) => setReference(e.target.value)}
                            />
                          )}
                        </Field>
                      </div>
                      <p className="rounded-lg bg-brand-50 p-3 text-[13px] text-brand-950">
                        Cette confirmation crée un paiement
                        {Number(amount) > 0
                          ? ` de ${moneyXaf(Number(amount))}`
                          : ""}{" "}
                        et le répartit sur les échéances dans l'ordre
                        {firstOpenInstallment
                          ? ` (${firstOpenInstallment} d'abord)`
                          : ""}
                        . Vérifie le fichier avant de confirmer.
                      </p>
                    </>
                  ) : (
                    <>
                      {action === "requestCorrection" ? (
                        <Field
                          label="Message à la cliente"
                          optionalHint="(facultatif, visible par la cliente)"
                        >
                          {(p) => (
                            <Textarea
                              {...p}
                              rows={3}
                              maxLength={2000}
                              value={message}
                              placeholder="Ex. : la capture est illisible, peux-tu renvoyer le reçu Mobile Money ?"
                              onChange={(e) => setMessage(e.target.value)}
                            />
                          )}
                        </Field>
                      ) : null}
                      <p className="rounded-lg bg-muted p-3 text-[13px]">
                        Cette décision ne crée aucun paiement.{" "}
                        {noMoneyNote[action]}
                      </p>
                    </>
                  )}

                  <Field
                    label="Note privée"
                    optionalHint="(facultatif, jamais visible par la cliente)"
                  >
                    {(p) => (
                      <Input
                        {...p}
                        maxLength={2000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    )}
                  </Field>
                  {error ? (
                    <p
                      role="alert"
                      className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
                    >
                      {error}
                    </p>
                  ) : null}
                </fieldset>
              </form>
            ) : (
              <ProofOutcome proof={proof} />
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle px-6 py-4">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {pending ? "Annuler" : "Fermer"}
          </Button>
          {pending ? (
            <Button
              type="submit"
              form="proof-review"
              disabled={busy}
              variant={action === "reject" ? "destructive-solid" : "default"}
            >
              {busy ? "Enregistrement…" : decision.cta}
            </Button>
          ) : null}
          {proof.status === "correction_requested" ? (
            <Button onClick={() => onCreateCorrectionLink(proof)}>
              Créer le lien de correction
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProofOutcome({ proof }: { proof: PaymentProof }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={proofStatus[proof.status]} />
        {proof.reviewedAt ? (
          <span className="text-muted-foreground">
            Décision du {dateTimeFr(proof.reviewedAt)}
          </span>
        ) : null}
      </div>
      {proof.paymentEventId ? (
        <p className="rounded-lg bg-success-soft p-3">
          Paiement créé :{" "}
          <strong className="tabular-nums">
            {moneyXaf(proof.confirmedAmountXaf ?? 0)}
          </strong>
          {proof.confirmedPaymentMethod
            ? ` · ${paymentMethods[proof.confirmedPaymentMethod]}`
            : ""}
          {proof.confirmedOccurredAt
            ? ` · ${dateTimeFr(proof.confirmedOccurredAt)}`
            : ""}
        </p>
      ) : null}
      {proof.customerMessage ? (
        <p className="whitespace-pre-wrap break-words">
          <strong>Message à la cliente :</strong> {proof.customerMessage}
        </p>
      ) : null}
      {proof.reviewNote ? (
        <p className="whitespace-pre-wrap break-words">
          <strong>Note privée :</strong> {proof.reviewNote}
        </p>
      ) : null}
    </div>
  );
}
