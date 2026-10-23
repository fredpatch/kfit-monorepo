import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { FinancePaymentEvent, Receipt } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, Textarea } from "../../components/ui/input.js";
import { Field } from "../../components/ui/field.js";
import { Dialog, DialogContent } from "../../components/ui/dialog.js";
import { dateTimeFr, fromLocalInput, moneyXaf } from "../../lib/format.js";
import { downloadReceipt, receiptErrorMessage, receiptsApi } from "../../receipts/api/receipts-api.js";
import { focusReturnTarget } from "../../lib/focus.js";
import { OneTimeLink } from "./OneTimeLink.js";

/** Receipts live on their payment row (board 15a): one official receipt per confirmed payment (S6.3). */
export function useReceipts(subscriptionId: string) {
  return useQuery({ queryKey: ["receipts", subscriptionId], queryFn: () => receiptsApi.list(subscriptionId), refetchInterval: 30000 });
}

export function IssueReceiptButton({ subscriptionId, payment, ready }: { subscriptionId: string; payment: FinancePaymentEvent; ready: boolean }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function issue() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await receiptsApi.issue(payment.id);
      setOpen(false);
      toast.success(`Reçu ${result.receipt.receiptNumber} émis.`);
    } catch (failure) {
      setError(receiptErrorMessage(failure));
    } finally {
      await client.invalidateQueries({ queryKey: ["receipts", subscriptionId] });
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Button size="sm" variant="secondary" disabled={busy || !ready} onClick={() => { setOpen(true); setError(null); }}>Émettre le reçu</Button>
      <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
        <DialogContent title="Émettre le reçu" description="Un seul reçu officiel peut être émis pour ce paiement confirmé.">
          <p className="text-sm">
            Émettre un reçu de <strong className="tabular-nums">{moneyXaf(payment.amountXaf)}</strong>, paiement du {dateTimeFr(payment.occurredAt)} ? Son numéro, ses informations et son PDF sont conservés. Cette action ne crée aucun nouveau paiement.
          </p>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Retour</Button>
            <Button disabled={busy} onClick={() => void issue()}>{busy ? "Émission du PDF…" : "Confirmer l'émission"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Mode = { kind: "share" | "void" | "links"; receipt: Receipt };

/** Share, void and link history of a receipt, opened from the payment row's buttons and « ⋯ » menu. */
export function useReceiptActions(subscriptionId: string) {
  const client = useQueryClient();
  const [mode, setMode] = useState<Mode | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [expires, setExpires] = useState(""), [maxUses, setMaxUses] = useState("3"), [reason, setReason] = useState("");
  const [created, setCreated] = useState<{ url: string; meta: string } | null>(null);
  const inFlight = useRef(false), opener = useRef<HTMLElement | null>(null);

  function open(kind: Mode["kind"], receipt: Receipt) {
    opener.current = focusReturnTarget();
    setMode({ kind, receipt });
    setExpires("");
    setMaxUses("3");
    setReason("");
    setError(null);
    setCreated(null);
  }
  const close = () => { if (!busy) { setMode(null); setCreated(null); } };

  async function perform(operation: () => Promise<unknown>, success?: string) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
      if (success) toast.success(success);
      return true;
    } catch (failure) {
      setError(receiptErrorMessage(failure));
      return false;
    } finally {
      await client.invalidateQueries({ queryKey: ["receipts", subscriptionId] });
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function download(receipt: Receipt) {
    try {
      downloadReceipt(await receiptsApi.pdf(receipt.id), receipt.receiptNumber);
    } catch (failure) {
      toast.error(receiptErrorMessage(failure));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode) return;
    if (mode.kind === "share") {
      const expiresAt = fromLocalInput(expires), uses = Number(maxUses);
      if (!expiresAt || !Number.isSafeInteger(uses) || uses < 1 || uses > 20) {
        setError("Renseigne une expiration valide et entre 1 et 20 téléchargements.");
        return;
      }
      await perform(async () => {
        const r = await receiptsApi.share(mode.receipt.id, { expiresAt, maxUses: uses });
        setCreated({ url: `${window.location.origin}/recu/${encodeURIComponent(r.share.token)}`, meta: `${mode.receipt.receiptNumber} · expire le ${dateTimeFr(expiresAt)} · ${uses} téléchargement${uses > 1 ? "s" : ""}` });
      });
    } else if (mode.kind === "void") {
      if (await perform(() => receiptsApi.void(mode.receipt.id, reason), "Reçu annulé. Son numéro et son PDF historique restent conservés.")) setMode(null);
    }
  }

  // Keep the dialog in sync with refreshed receipt data (link revoked, etc.).
  const receipts = useReceipts(subscriptionId).data?.receipts;
  const current = mode ? receipts?.find((r) => r.id === mode.receipt.id) ?? mode.receipt : null;

  let body: ReactNode = null;
  if (mode && current) {
    if (mode.kind === "links") {
      body = current.links.length === 0 ? <p className="text-sm text-muted-foreground">Aucun lien de partage.</p> : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {current.links.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span>Expire le {dateTimeFr(link.expiresAt)} · {link.useCount}/{link.maxUses} téléchargements{link.revokedAt ? " · Révoqué" : ""}</span>
              {!link.revokedAt ? <Button size="sm" variant="destructive" disabled={busy} onClick={() => void perform(() => receiptsApi.revoke(link.id), "Lien révoqué.")}>Révoquer</Button> : null}
            </li>
          ))}
        </ul>
      );
    } else if (mode.kind === "share" && created) {
      body = <OneTimeLink url={created.url} label="Lien du reçu" meta={created.meta} />;
    } else {
      body = (
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="flex flex-col gap-4">
            {mode.kind === "share" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Expiration (Libreville)">{(p) => <Input {...p} required type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />}</Field>
                <Field label="Téléchargements maximum">{(p) => <Input {...p} required type="number" min="1" max="20" step="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />}</Field>
              </div>
            ) : (
              <>
                <p className="rounded-lg bg-warning-soft p-3 text-[13px]">Le numéro {current.receiptNumber} est conservé et ne sera jamais réutilisé. Le PDF reste historique et accessible par les liens encore valides. Cette action ne rembourse pas et ne corrige pas le paiement.</p>
                <Field label="Motif privé">{(p) => <Textarea {...p} required maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
              </>
            )}
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>Retour</Button>
              <Button type="submit" variant={mode.kind === "void" ? "destructive-solid" : "default"}>{busy ? "Enregistrement…" : mode.kind === "share" ? "Créer le lien" : "Confirmer l'annulation"}</Button>
            </div>
          </fieldset>
        </form>
      );
    }
  }

  const titles: Record<Mode["kind"], string> = { share: "Partager le reçu", void: "Annuler le reçu", links: "Liens du reçu" };
  const element = (
    <Dialog open={Boolean(mode)} onOpenChange={(value) => { if (!value) close(); }}>
      {mode && current ? (
        <DialogContent
          title={`${titles[mode.kind]} ${current.receiptNumber}`}
          description={mode.kind === "share" ? "Un lien personnel, temporaire et révocable vers le PDF historique." : mode.kind === "void" ? "Possible seulement quand le paiement source est entièrement corrigé." : `${moneyXaf(current.snapshot.amountXaf)} · émis le ${dateTimeFr(current.issuedAt)}`}
          className="max-w-lg"
          onCloseAutoFocus={(event) => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus(); }}
        >
          {body}
          {mode.kind === "links" || created ? <div className="flex justify-end"><Button variant="secondary" onClick={close}>Fermer</Button></div> : null}
        </DialogContent>
      ) : null}
    </Dialog>
  );

  return { open, download, element };
}
