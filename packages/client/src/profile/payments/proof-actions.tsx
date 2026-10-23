import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PaymentProof } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Field } from "../../components/ui/field.js";
import { Card, CardHeader, CardTitle } from "../../components/ui/card.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
import { dateTimeFr, fromLocalInput, moneyXaf, shortDateFr } from "../../lib/format.js";
import { paymentProofsApi, paymentProofErrorMessage } from "../../payment-proofs/api/payment-proofs-api.js";
import { OneTimeLink } from "./OneTimeLink.js";
import { ProofReviewDialog } from "./ProofReviewDialog.js";
import { proofStatus } from "./payments-meta.js";

export function usePaymentProofs(subscriptionId: string) {
  return useQuery({ queryKey: ["payment-proofs", subscriptionId], queryFn: () => paymentProofsApi.list(subscriptionId), refetchInterval: 30000 });
}

/** Upload links and proof review (boards 15a, 15b). A proof is evidence; only a confirmation creates a payment (S6.4). */
export function useProofActions(subscriptionId: string, firstOpenInstallment: string | null) {
  const client = useQueryClient();
  const [reviewing, setReviewing] = useState<PaymentProof | null>(null);
  const [link, setLink] = useState<{ parent: string | null } | null>(null);
  const [expires, setExpires] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; meta: string } | null>(null);
  const opener = useRef<HTMLElement | null>(null), inFlight = useRef(false);

  const remember = () => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; };
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
  };

  function openLink(parent: string | null = null) {
    if (!reviewing) remember();
    setReviewing(null);
    setLink({ parent });
    setExpires("");
    setError(null);
    setCreated(null);
  }
  function openReview(proof: PaymentProof) {
    remember();
    setReviewing(proof);
  }
  const closeLink = () => { if (!busy) { setLink(null); setCreated(null); } };

  async function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!link || inFlight.current) return;
    const expiresAt = fromLocalInput(expires);
    if (!expiresAt) {
      setError("Renseigne une date d'expiration valide en heure de Libreville.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await paymentProofsApi.issue(subscriptionId, { expiresAt, supersedesProofId: link.parent });
      setCreated({ url: `${window.location.origin}/justificatif/${encodeURIComponent(result.token)}`, meta: `Un seul dépôt · expire le ${dateTimeFr(expiresAt)}` });
      toast.success("Lien de dépôt créé.");
    } catch (failure) {
      setError(paymentProofErrorMessage(failure));
    } finally {
      await client.invalidateQueries({ queryKey: ["payment-proofs", subscriptionId] });
      inFlight.current = false;
      setBusy(false);
    }
  }

  const element = (
    <>
      {reviewing ? (
        <ProofReviewDialog
          key={reviewing.id}
          subscriptionId={subscriptionId}
          proof={reviewing}
          firstOpenInstallment={firstOpenInstallment}
          onClose={() => setReviewing(null)}
          onCreateCorrectionLink={(proof) => openLink(proof.id)}
          onCloseAutoFocus={restoreFocus}
        />
      ) : null}
      <Dialog open={Boolean(link)} onOpenChange={(open) => { if (!open) closeLink(); }}>
        {link ? (
          <DialogContent
            title={link.parent ? "Créer le lien de correction" : "Lien de dépôt de justificatif"}
            description={link.parent ? "La cliente dépose un justificatif corrigé ; ton message de correction s'y affiche." : "La cliente dépose sa preuve de paiement. Un seul dépôt réussi par lien."}
            className="max-w-lg"
            onCloseAutoFocus={restoreFocus}
          >
            {created ? (
              <>
                <OneTimeLink url={created.url} label="Lien de dépôt" meta={created.meta} />
                <div className="flex justify-end"><Button variant="secondary" onClick={closeLink}>Fermer</Button></div>
              </>
            ) : (
              <form onSubmit={submitLink}>
                <fieldset disabled={busy} className="flex flex-col gap-4">
                  <Field label="Expiration (Libreville)">{(p) => <Input {...p} required type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />}</Field>
                  {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={closeLink}>Retour</Button>
                    <Button type="submit">{busy ? "Création…" : "Créer le lien"}</Button>
                  </div>
                </fieldset>
              </form>
            )}
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );

  return { openLink, openReview, element };
}

/** Right column of board 15a: proof history and the active upload links. */
export function ProofsCard({ subscriptionId, actions }: { subscriptionId: string; actions: ReturnType<typeof useProofActions> }) {
  const client = useQueryClient();
  const query = usePaymentProofs(subscriptionId);
  const [revoking, setRevoking] = useState<string | null>(null);
  const now = Date.now();
  const active = (query.data?.links ?? []).filter((l) => !l.revokedAt && !l.usedAt && Date.parse(l.expiresAt) > now);

  async function revoke(id: string) {
    setRevoking(id);
    try {
      await paymentProofsApi.revoke(id);
      toast.success("Lien révoqué.");
    } catch (failure) {
      toast.error(paymentProofErrorMessage(failure));
    } finally {
      await client.invalidateQueries({ queryKey: ["payment-proofs", subscriptionId] });
      setRevoking(null);
    }
  }

  return (
    <Card className="gap-3 p-5">
      <CardHeader>
        <CardTitle className="text-[15px]">Justificatifs</CardTitle>
      </CardHeader>
      {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Chargement des justificatifs…</p> : null}
      {query.isError ? <p role="alert" className="text-sm text-danger">{paymentProofErrorMessage(query.error)}</p> : null}
      {query.data?.proofs.length === 0 ? <p className="text-sm text-muted-foreground">Aucun justificatif déposé.</p> : null}
      {query.data && query.data.proofs.length > 0 ? (
        <ul className="-mx-2 flex flex-col">
          {query.data.proofs.map((proof) => (
            <li key={proof.id}>
              <button type="button" onClick={() => actions.openReview(proof)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{shortDateFr(proof.submittedAt)}</span> · <span className="tabular-nums">{moneyXaf(proof.claimedAmountXaf)}</span> déclarés
                </span>
                <StatusPill size="sm" status={proofStatus[proof.status]} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {query.data ? (
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-3 text-xs text-muted-foreground">
          <p>
            {active.length === 0 ? "Aucun lien de dépôt actif." : `${active.length} lien${active.length > 1 ? "s" : ""} de dépôt actif${active.length > 1 ? "s" : ""} · expire le ${shortDateFr(active[0]!.expiresAt)}`}
          </p>
          {query.data.links.length > 0 ? (
            <details>
              <summary className="cursor-pointer font-semibold text-foreground">Historique des liens</summary>
              <ul className="mt-2 flex flex-col gap-2">
                {query.data.links.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Expire le {dateTimeFr(l.expiresAt)} · {l.revokedAt ? "Révoqué" : l.usedAt ? "Utilisé" : Date.parse(l.expiresAt) <= now ? "Expiré" : "Non utilisé"}
                      {l.supersedesProofId ? " · correction" : ""}
                    </span>
                    {!l.revokedAt && !l.usedAt && Date.parse(l.expiresAt) > now ? (
                      <Button size="sm" variant="destructive" disabled={revoking === l.id} onClick={() => void revoke(l.id)}>Révoquer</Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
