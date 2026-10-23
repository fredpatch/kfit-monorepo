import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Plus } from "lucide-react";
import type { QuoteDetail, QuoteResponse, QuoteVersion } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Input, Textarea } from "../../components/ui/input.js";
import { Field } from "../../components/ui/field.js";
import { Card, CardHeader, CardTitle } from "../../components/ui/card.js";
import { Pill, StatusPill } from "../../components/ui/status-pill.js";
import { Dialog, DialogContent, Sheet, SheetContent } from "../../components/ui/dialog.js";
import { cn } from "../../lib/utils.js";
import { dateTimeFr, fromLocalInput, moneyXaf, shortDateFr, toLocalInput } from "../../lib/format.js";
import { downloadQuote, quoteErrorMessage, quotesApi } from "../../quotes/api/quotes-api.js";
import { OneTimeLink } from "./OneTimeLink.js";
import { quoteStatus } from "./payments-meta.js";

/** Quote = commercial step before the plan (boards 15a card, 15c sheet). Commands and server checks unchanged from S6.2. */
type Mode =
  | { kind: "create" }
  | { kind: "version"; quote: QuoteDetail }
  | { [K in "edit" | "issue" | "share" | "synchronize"]: { kind: K; version: QuoteVersion } }["edit" | "issue" | "share" | "synchronize"]
  | { kind: "revoke"; id: string }
  | { kind: "cancel"; quote: QuoteDetail };
const titles: Record<Mode["kind"], string> = {
  create: "Nouveau devis",
  version: "Créer une nouvelle version",
  edit: "Modifier le brouillon",
  issue: "Émettre le devis",
  share: "Partager le devis",
  synchronize: "Appliquer le montant à l'abonnement",
  revoke: "Révoquer le lien",
  cancel: "Annuler le devis",
};

const current = (q: QuoteDetail) => q.versions.find((v) => v.id === q.currentVersionId) ?? q.versions.at(-1);
const needsSync = (q: QuoteDetail) => {
  const v = current(q);
  return Boolean(v && q.status === "accepted" && v.response === "accepted" && !v.synchronized);
};
const responseLabel: Record<string, string> = { accepted: "acceptée", declined: "refusée", changes_requested: "modification demandée" };

function versionMeta(v: QuoteVersion): string {
  if (!v.issuedAt) return "Brouillon, pas encore émis";
  const parts = [`Émise le ${shortDateFr(v.issuedAt)}`];
  if (v.response) parts.push(`${responseLabel[v.response] ?? v.response} le ${shortDateFr(v.respondedAt)}`);
  if (v.synchronized) parts.push("appliquée à l'abonnement");
  return parts.join(" · ");
}

export function QuotesCard({ subscriptionId, agreedAmountXaf }: { subscriptionId: string; agreedAmountXaf: number }) {
  const client = useQueryClient(), queryKey = ["quotes", subscriptionId] as const;
  const query = useQuery({ queryKey, queryFn: () => quotesApi.list(subscriptionId), refetchInterval: 30000 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [amount, setAmount] = useState(""), [validity, setValidity] = useState(""), [terms, setTerms] = useState(""), [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<QuoteResponse["share"]>();
  const inFlight = useRef(false);

  function open(next: Mode) {
    const v = "version" in next ? next.version : next.kind === "version" ? current(next.quote) : undefined;
    setMode(next);
    setError(null);
    setAmount(v ? String(v.amountXaf) : "");
    setTerms(v?.terms ?? "");
    setValidity(v?.validUntil ? toLocalInput(new Date(v.validUntil)) : "");
    setExpires("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode || inFlight.current) return;
    let run: () => Promise<QuoteResponse>;
    if (mode.kind === "create" || mode.kind === "version" || mode.kind === "edit") {
      const validUntil = fromLocalInput(validity), amountXaf = Number(amount);
      if (!amount.trim() || !validUntil || !Number.isSafeInteger(amountXaf) || amountXaf < 0 || !terms.trim()) {
        setError("Renseigne un montant entier, la validité et les conditions commerciales.");
        return;
      }
      const input = { amountXaf, validUntil, terms };
      run = mode.kind === "create" ? () => quotesApi.create(subscriptionId, input) : mode.kind === "version" ? () => quotesApi.version(mode.quote.id, input) : () => quotesApi.edit(mode.version.id, input);
    } else if (mode.kind === "share") {
      const expiresAt = fromLocalInput(expires);
      if (!expiresAt) {
        setError("Renseigne l'expiration du lien.");
        return;
      }
      run = () => quotesApi.share(mode.version.id, expiresAt);
    } else {
      run = mode.kind === "issue" ? () => quotesApi.issue(mode.version.id)
        : mode.kind === "synchronize" ? () => quotesApi.synchronize(mode.version.id)
        : mode.kind === "revoke" ? () => quotesApi.revoke(mode.id)
        : () => quotesApi.cancel(mode.quote.id);
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await run();
      setShare(result.share);
      setMode(null);
      if (mode.kind === "create") setOpenId(result.quote.id);
      toast.success(mode.kind === "synchronize" ? "Montant appliqué à l'abonnement. L'échéancier peut maintenant être révisé." : "Devis mis à jour.");
      await client.invalidateQueries({ queryKey });
      if (mode.kind === "synchronize") {
        await client.invalidateQueries({ queryKey: ["finance", subscriptionId] });
        await client.invalidateQueries({ queryKey: ["customers", "detail"] });
      }
    } catch (failure) {
      setError(quoteErrorMessage(failure));
      await query.refetch();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function pdf(q: QuoteDetail, v: QuoteVersion) {
    try {
      downloadQuote(await quotesApi.pdf(v.id), `${q.quoteNumber ?? "devis"}-v${v.versionNumber}.pdf`);
    } catch (failure) {
      toast.error(quoteErrorMessage(failure));
    }
  }

  const quotes = [...(query.data?.quotes ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const opened = quotes.find((q) => q.id === openId) ?? null;

  return (
    <Card className="gap-3 p-5">
      <CardHeader className="items-center">
        <CardTitle className="text-[15px]">Devis</CardTitle>
        {query.data ? (
          <Button size="sm" variant="ghost" onClick={() => open({ kind: "create" })}>
            <Plus aria-hidden="true" />
            Nouveau devis
          </Button>
        ) : null}
      </CardHeader>
      {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Chargement des devis…</p> : null}
      {query.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-danger">{quoteErrorMessage(query.error)}</p>
          <Button size="sm" variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button>
        </div>
      ) : null}
      {query.data && quotes.length === 0 ? <p className="text-sm text-muted-foreground">Aucun devis. Crée un brouillon avec son montant, sa validité et ses conditions commerciales.</p> : null}
      {quotes.map((q) => {
        const v = current(q);
        return (
          <div key={q.id} className={cn("flex flex-col gap-2", q.status === "cancelled" && "opacity-70")}>
            <button type="button" onClick={() => setOpenId(q.id)} className="-mx-2 flex flex-col items-start gap-1 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="text-sm font-bold">{q.quoteNumber ?? "Brouillon sans numéro"}{v ? ` · version ${v.versionNumber}` : ""}</span>
              {v ? <span className="text-[13px] text-muted-foreground"><span className="tabular-nums">{moneyXaf(v.amountXaf)}</span>{v.validUntil ? ` · valable jusqu'au ${shortDateFr(v.validUntil)}` : ""}</span> : null}
              <StatusPill size="sm" status={quoteStatus[q.status]} />
            </button>
            {needsSync(q) && v ? (
              <div className="flex flex-col items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3">
                <p className="text-[13px] text-warning">Montant accepté pas encore appliqué à l'abonnement ({moneyXaf(agreedAmountXaf)} actuellement).</p>
                <Button size="sm" onClick={() => open({ kind: "synchronize", version: v })}>Appliquer {moneyXaf(v.amountXaf)} à l'abonnement</Button>
              </div>
            ) : null}
          </div>
        );
      })}

      <Sheet open={Boolean(opened)} onOpenChange={(value) => { if (!value) { setOpenId(null); setShare(undefined); } }}>
        {opened ? (
          <SheetContent
            title={`Devis ${opened.quoteNumber ?? "— brouillon"}`}
            description={`Créé le ${dateTimeFr(opened.createdAt)} · les états sont vérifiés par le serveur.`}
            className="max-w-[560px]"
            footer={
              <>
                {opened.status !== "cancelled" ? <Button variant="ghost" className="mr-auto text-danger hover:bg-danger-soft" onClick={() => open({ kind: "cancel", quote: opened })}>Annuler le devis</Button> : null}
                <Button variant="secondary" onClick={() => { setOpenId(null); setShare(undefined); }}>Fermer</Button>
              </>
            }
          >
            <QuoteSheetBody quote={opened} agreedAmountXaf={agreedAmountXaf} share={share} onHideShare={() => setShare(undefined)} onAction={open} onPdf={(v) => void pdf(opened, v)} />
          </SheetContent>
        ) : null}
      </Sheet>

      <Dialog open={Boolean(mode)} onOpenChange={(value) => { if (!value && !busy) setMode(null); }}>
        {mode ? (
          <DialogContent title={titles[mode.kind]} description="Les opérations et états sont vérifiés par le serveur." className="max-h-[90dvh] max-w-xl overflow-y-auto">
            <form onSubmit={submit}>
              <fieldset disabled={busy} className="flex flex-col gap-4">
                {mode.kind === "create" || mode.kind === "version" || mode.kind === "edit" ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Montant total (XAF)">{(p) => <Input {...p} type="number" required min="0" max="2147483647" step="1" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
                      <Field label="Valable jusqu'au (Libreville)">{(p) => <Input {...p} type="datetime-local" required value={validity} onChange={(e) => setValidity(e.target.value)} />}</Field>
                    </div>
                    <Field label="Conditions commerciales" hint="Le service, la formule et la durée sont figés depuis l'abonnement à l'émission. Aucune clause juridique n'est ajoutée automatiquement.">
                      {(p) => <Textarea {...p} required rows={6} maxLength={10000} value={terms} onChange={(e) => setTerms(e.target.value)} />}
                    </Field>
                  </>
                ) : null}
                {mode.kind === "share" ? (
                  <>
                    <p className="text-sm">Le lien vise exactement la version {mode.version.versionNumber}. Il permet une réponse explicite et expire au plus tard à la fin de validité du devis.</p>
                    <Field label="Expiration du lien (Libreville)">
                      {(p) => <Input {...p} type="datetime-local" required value={expires} max={mode.version.validUntil ? toLocalInput(new Date(mode.version.validUntil)) : undefined} onChange={(e) => setExpires(e.target.value)} />}
                    </Field>
                  </>
                ) : null}
                {mode.kind === "issue" ? <p className="text-sm">Émettre la version {mode.version.versionNumber} ? Le montant, les informations commerciales, les conditions, la validité et le PDF sont figés. Toute modification demandera une nouvelle version.</p> : null}
                {mode.kind === "synchronize" ? (
                  <p className="text-sm">
                    Appliquer {moneyXaf(mode.version.amountXaf)} comme montant convenu de l'abonnement (actuellement {moneyXaf(agreedAmountXaf)}) ? Si le montant diffère et qu'une activité financière existe, le serveur refuse l'opération. Le service, la formule, la durée et le statut restent inchangés.
                  </p>
                ) : null}
                {mode.kind === "revoke" ? <p className="text-sm">Révoquer ce lien ? Il ne permettra plus l'accès ni une nouvelle réponse. L'historique est conservé.</p> : null}
                {mode.kind === "cancel" ? <p className="text-sm">Annuler le devis ? Les versions, réponses et PDF restent conservés. L'abonnement et les paiements ne sont pas modifiés.</p> : null}
                {error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setMode(null)}>Retour</Button>
                  <Button type="submit" variant={mode.kind === "cancel" || mode.kind === "revoke" ? "destructive-solid" : "default"}>{busy ? "Enregistrement…" : "Confirmer"}</Button>
                </div>
              </fieldset>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  );
}

type BodyProps = {
  quote: QuoteDetail;
  agreedAmountXaf: number;
  share: QuoteResponse["share"];
  onHideShare: () => void;
  onAction: (mode: Mode) => void;
  onPdf: (v: QuoteVersion) => void;
};

function QuoteSheetBody({ quote: q, agreedAmountXaf, share, onHideShare, onAction, onPdf }: BodyProps) {
  const v = current(q);
  const live = q.status !== "cancelled";
  const hasDraft = q.versions.some((x) => !x.issuedAt);
  const canShare = Boolean(v?.issuedAt && q.status === "issued" && !v.response);
  const now = Date.now();
  return (
    <>
      <ol className="flex flex-col">
        {q.versions.map((x, index) => (
          <li key={x.id} className="flex gap-3">
            <span aria-hidden="true" className="flex flex-col items-center">
              <span className={cn("mt-1 size-3 rounded-full", x.response === "accepted" ? "bg-primary" : x.response ? "bg-warning" : x.issuedAt ? "bg-info" : "bg-border")} />
              {index < q.versions.length - 1 ? <span className="w-0.5 flex-1 bg-border" /> : null}
            </span>
            <span className="flex flex-1 flex-col gap-0.5 pb-3.5">
              <span className="text-sm font-bold">Version {x.versionNumber} · <span className="tabular-nums">{moneyXaf(x.amountXaf)}</span></span>
              <span className="text-[13px] text-muted-foreground">{versionMeta(x)}</span>
            </span>
            {x.pdfDocumentId && x.id !== v?.id ? (
              <Button size="icon-sm" variant="ghost" aria-label={`Télécharger le PDF de la version ${x.versionNumber}`} onClick={() => onPdf(x)}>
                <Download aria-hidden="true" />
              </Button>
            ) : null}
          </li>
        ))}
      </ol>

      {v ? (
        <section aria-label={`Version ${v.versionNumber}`} className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="flex-1 text-[15px] font-extrabold">Version {v.versionNumber} · {v.issuedAt ? "émise" : "brouillon"}</h3>
            {v.response ? <Pill tone={v.response === "accepted" ? "success" : v.response === "declined" ? "danger" : "warning"}>{v.response === "accepted" ? "Acceptée" : v.response === "declined" ? "Refusée" : "Modification demandée"} le {shortDateFr(v.respondedAt)}</Pill> : <StatusPill status={quoteStatus[q.status]} />}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Montant</dt><dd className="font-extrabold tabular-nums">{moneyXaf(v.amountXaf)}</dd>
            <dt className="text-muted-foreground">Validité</dt><dd className="font-semibold">{v.validUntil ? `jusqu'au ${dateTimeFr(v.validUntil)}` : "—"}</dd>
            {v.issuedAt ? <><dt className="text-muted-foreground">Émission</dt><dd className="font-semibold">{dateTimeFr(v.issuedAt)}</dd></> : null}
          </dl>
          <details>
            <summary className="cursor-pointer text-[13px] font-bold text-primary">Conditions commerciales</summary>
            <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-muted-foreground">{v.terms}</p>
          </details>
          {live ? (
            <div className="flex flex-wrap gap-2">
              {!v.issuedAt ? (
                <>
                  <Button size="sm" onClick={() => onAction({ kind: "issue", version: v })}>Émettre</Button>
                  <Button size="sm" variant="secondary" onClick={() => onAction({ kind: "edit", version: v })}>Modifier le brouillon</Button>
                </>
              ) : null}
              {v.pdfDocumentId ? <Button size="sm" variant="secondary" onClick={() => onPdf(v)}>Télécharger le PDF</Button> : null}
              <Button size="sm" variant="secondary" disabled={hasDraft} onClick={() => onAction({ kind: "version", quote: q })}>Créer une nouvelle version</Button>
            </div>
          ) : v.pdfDocumentId ? <Button size="sm" variant="secondary" className="self-start" onClick={() => onPdf(v)}>Télécharger le PDF</Button> : null}
        </section>
      ) : null}

      {needsSync(q) && v ? (
        <section className="flex flex-col gap-2.5 rounded-xl border border-warning/40 bg-warning-soft p-4 text-warning">
          <p className="text-sm font-extrabold">À synchroniser</p>
          <p className="text-[13px] leading-relaxed">La cliente a accepté {moneyXaf(v.amountXaf)}. Le montant convenu de l'abonnement reste {moneyXaf(agreedAmountXaf)} tant que tu ne l'appliques pas.</p>
          <Button className="self-start" onClick={() => onAction({ kind: "synchronize", version: v })}>Appliquer {moneyXaf(v.amountXaf)} à l'abonnement</Button>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <h3 className="flex-1 text-[15px] font-extrabold">Liens envoyés à la cliente</h3>
          {canShare && v ? <Button size="sm" variant="secondary" onClick={() => onAction({ kind: "share", version: v })}>Partager le devis</Button> : null}
        </div>
        {share ? <OneTimeLink url={`${window.location.origin}/devis/${share.token}`} label="Lien du devis" meta={`Expire le ${dateTimeFr(share.expiresAt)}`} onHide={onHideShare} /> : null}
        {q.links.length === 0 ? <p className="text-[13px] text-muted-foreground">Aucun lien envoyé.</p> : null}
        {q.links.map((link) => {
          const expired = Date.parse(link.expiresAt) <= now;
          const status = link.revokedAt ? { label: "Révoqué", tone: "neutral" as const } : link.usedAt ? { label: "Réponse enregistrée", tone: "success" as const } : expired ? { label: "Expiré", tone: "neutral" as const } : { label: "Disponible", tone: "info" as const };
          return (
            <div key={link.id} className="flex flex-wrap items-center gap-2.5 border-t border-border-subtle py-2 text-[13px]">
              <span className="flex-1">Version {q.versions.find((x) => x.id === link.versionId)?.versionNumber ?? "?"} · expire le {shortDateFr(link.expiresAt)}</span>
              <StatusPill size="sm" status={status} />
              {!link.revokedAt && !expired ? <Button size="sm" variant="ghost" onClick={() => onAction({ kind: "revoke", id: link.id })}>Révoquer</Button> : null}
            </div>
          );
        })}
      </section>
    </>
  );
}
