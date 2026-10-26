import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, Check, Clock, MessageCircle, MoreHorizontal, PhoneCall } from "lucide-react";
import { adminRequestAllowedTransitions, prospectPrivacyMenu, subjectMode, type AdminServiceRequestDetail, type PrivacyMenuAction, type ServiceRequestStatus } from "@kfit/shared";
import { AnonymizeDialog, ArchiveDialog, PrivacyMenuItems, UnarchiveDialog, usePrivacyDialog } from "../../privacy/components/SubjectPrivacyDialogs.js";
import { adminRequestsApiClient } from "../api/admin-requests-api.js";
import { requestErrorMessage } from "../lib/request-error-messages.js";
import { channelLabels, directionLabels, outcomeLabels, qualificationOutcomeLabels, requestSteps, transitionLabels, waitlistEntryStatusLabels } from "../lib/request-labels.js";
import { ConfirmDialog, ContactAttemptSheet, ConversionDialog, QualificationSheet, WaitlistDialog, conversionState, useRequestRefresh } from "./request-actions.js";
import { Avatar } from "../../components/ui/avatar.js";
import { Button } from "../../components/ui/button.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/ui/dropdown-menu.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { cn } from "../../lib/utils.js";
import { requestStatus } from "../../lib/status-map.js";
import { dateFr, dateTimeFr, moneyXaf } from "../../lib/format.js";

const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;

type Action = "attempt" | "qualification" | "waitlist" | "conversion" | "withdraw" | ServiceRequestStatus;

function Steps({ status }: { status: ServiceRequestStatus }) {
  const current = requestSteps.findIndex((s) => (s.statuses as readonly string[]).includes(status));
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Étapes de la demande">
      {requestSteps.map((step, i) => (
        <li key={step.label} aria-current={i === current ? "step" : undefined} className="flex min-w-0 flex-col gap-1.5">
          <span className={cn("h-1.5 rounded-full", i < current ? "bg-primary" : i === current ? "bg-lime" : "bg-border")} />
          <span className={cn("truncate text-xs", i === current ? "font-bold" : "font-semibold", i > current ? "text-muted-foreground" : "")}>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** One next step per status (board 05: « une seule action principale »). Rules stay on the server. */
function nextStep(request: AdminServiceRequestDetail): { title: string; detail: string; primary: Action | null; secondary: Action | null } {
  const lastAttempt = request.contactAttempts[0];
  const attempts = request.contactAttempts.length;
  const attemptsText = attempts ? `${attempts} tentative(s) · dernière : ${outcomeLabels[lastAttempt!.outcome].toLowerCase()}` : "Aucune tentative enregistrée";
  const next = request.nextActionAt ? ` · relance prévue ${dateTimeFr(request.nextActionAt)}` : "";
  const { eligible, consistent } = conversionState(request);
  switch (request.status) {
    case "submitted":
      return { title: "Prochaine étape : contacter le prospect", detail: attemptsText + next, primary: "contacting", secondary: "attempt" };
    case "contacting":
      return { title: "Prochaine étape : joindre puis qualifier", detail: attemptsText + next, primary: "qualification_in_progress", secondary: "attempt" };
    case "qualification_in_progress":
      return request.qualificationReviews.length === 0
        ? { title: "Prochaine étape : décider de la qualification", detail: "Valide l'option, le prix et la date cible, ou rejette la demande.", primary: "qualification", secondary: "attempt" }
        : { title: "Décision enregistrée", detail: "Actualise la demande si le statut n'a pas changé.", primary: null, secondary: "attempt" };
    case "qualified":
    case "qualified_with_conditions":
      return eligible && consistent
        ? { title: "Prochaine étape : convertir en abonnement", detail: "L'abonnement sera créé en préparation.", primary: "conversion", secondary: "attempt" }
        : { title: "Qualification à vérifier", detail: "La qualification actuelle est incomplète ou incohérente.", primary: null, secondary: "attempt" };
    case "waitlisted":
      return { title: "En liste d'attente", detail: "La demande attend qu'une place se libère.", primary: null, secondary: "attempt" };
    case "abandoned":
      return { title: "Demande abandonnée", detail: "Elle peut être reprise en qualification.", primary: "qualification_in_progress", secondary: null };
    case "converted":
      return { title: "Demande convertie", detail: "L'abonnement est en préparation sur la fiche client.", primary: null, secondary: null };
    default:
      return { title: "Demande clôturée", detail: "Aucune action disponible.", primary: null, secondary: null };
  }
}

const actionLabels: Record<string, string> = {
  attempt: "Enregistrer une tentative",
  qualification: "Enregistrer la décision",
  waitlist: "Ajouter à la liste d'attente",
  conversion: "Convertir en abonnement",
  withdraw: "Retirer de la liste d'attente",
};
const labelOf = (action: Action) => actionLabels[action] ?? transitionLabels[action as ServiceRequestStatus] ?? action;

export function RequestDetail({ requestId, onBack }: { requestId: string; onBack?: () => void }) {
  const query = useQuery({ queryKey: ["requests", "admin-detail", requestId], queryFn: () => adminRequestsApiClient.getDetail(requestId) });
  const refresh = useRequestRefresh(requestId);
  const [open, setOpen] = useState<Action | null>(null);
  const privacyDialog = usePrivacyDialog<PrivacyMenuAction>();

  if (query.isPending) return <p role="status" className="p-6 text-sm text-muted-foreground">Chargement de la demande…</p>;
  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert" className="text-sm text-danger">{requestErrorMessage(query.error)}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button>
      </div>
    );
  }

  const request = query.data.request;
  const step = nextStep(request);
  // S7.3b-2 D8: an archived or anonymized prospect is frozen (ARCH-01): no decision is offered, only its privacy actions.
  const mode = subjectMode(request.prospect.privacy);
  const frozen = mode !== "active";
  const privacyMenu = prospectPrivacyMenu(request.prospect.privacy);
  const allowed = frozen ? [] : adminRequestAllowedTransitions[request.status] ?? [];
  const activeWaitlist = request.waitlistEntries.find((e) => e.status === "active" && e.leftAt === null);
  const canWaitlist = !frozen && ["submitted", "contacting", "qualification_in_progress"].includes(request.status) && !activeWaitlist;
  const canWithdraw = !frozen && Boolean(activeWaitlist) && request.status === "waitlisted";
  // « ⋯ » holds every other allowed decision; abandon and withdraw are destructive and confirmed.
  const menu: Action[] = [
    ...allowed.filter((t) => t !== step.primary && t !== "abandoned"),
    ...(canWaitlist ? (["waitlist"] as const) : []),
  ];
  const destructiveMenu: Action[] = [...(allowed.includes("abandoned") ? (["abandoned"] as const) : []), ...(canWithdraw ? (["withdraw"] as const) : [])];
  const review = request.qualificationReviews.find((r) => r.supersededAt === null);

  const run = (action: Action) => {
    if (action === "attempt" || action === "qualification" || action === "waitlist" || action === "conversion" || action === "withdraw" || action === "abandoned") setOpen(action);
    else void transition(action);
  };
  async function transition(toStatus: ServiceRequestStatus) {
    try {
      await adminRequestsApiClient.transitionStatus(request.id, toStatus);
      await refresh();
      toast.success("Statut mis à jour.");
    } catch (failure) {
      toast.error(requestErrorMessage(failure));
      await refresh();
    }
  }

  const info: Array<[string, string | null]> = [
    ["Offre demandée", `${request.service.name}${request.requestedVariant ? ` · ${request.requestedVariant.name}` : ""}`],
    ["Début souhaité", request.preferredStartDate ? dateFr(request.preferredStartDate) : null],
    ["Objectif", request.objective],
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
      {onBack ? (
        <button type="button" onClick={onBack} className="-mb-2 flex items-center gap-1.5 self-start text-[13px] font-semibold text-primary lg:hidden">
          <ArrowLeft className="size-4" aria-hidden="true" /> Demandes
        </button>
      ) : null}

      <div className="flex flex-wrap items-start gap-3.5">
        <Avatar name={request.prospect.fullName} size="lg" className="size-12 text-base" />
        <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-extrabold leading-tight">{request.prospect.fullName}</h2>
            <StatusPill size="sm" status={requestStatus[request.status]} />
            {request.duplicateOfRequestId ? <StatusPill size="sm" status={{ label: "Doublon possible", tone: "warning" }} /> : null}
            {mode === "archived" ? <StatusPill size="sm" status={{ label: "Prospect archivé", tone: "neutral" }} /> : null}
            {mode === "anonymized" ? <StatusPill size="sm" status={{ label: "Prospect anonymisé", tone: "warning" }} /> : null}
          </span>
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {request.reference}
            {mode === "anonymized" ? "" : ` · ${request.prospect.whatsapp}${request.prospect.email ? ` · ${request.prospect.email}` : ""}`} · reçue le {dateTimeFr(request.submittedAt)}
          </span>
        </div>
        <div className="flex gap-2">
          {mode === "anonymized" ? null : (
            <Button asChild variant="secondary" size="sm" className="h-9">
              <a href={waLink(request.prospect.whatsapp)} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          )}
          {menu.length + destructiveMenu.length + privacyMenu.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button ref={privacyDialog.trigger} variant="secondary" size="icon-sm" className="size-9" aria-label={frozen ? "Actions sur le prospect" : "Autres décisions"}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {menu.map((a) => <DropdownMenuItem key={a} onSelect={() => run(a)}>{labelOf(a)}</DropdownMenuItem>)}
                {destructiveMenu.length ? (
                  <>
                    {menu.length ? <DropdownMenuSeparator /> : null}
                    {destructiveMenu.map((a) => <DropdownMenuItem key={a} destructive onSelect={() => run(a)}>{labelOf(a)}</DropdownMenuItem>)}
                  </>
                ) : null}
                <PrivacyMenuItems menu={privacyMenu} subjectType="prospect" onSelect={privacyDialog.open} separatorBefore={menu.length > 0 && destructiveMenu.length === 0} />
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <Steps status={request.status} />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-[#f7f8f5] p-4">
        <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
          <strong className="text-sm">{step.title}</strong>
          <span className="text-[13px] text-muted-foreground">{step.detail}</span>
        </span>
        <span className="flex flex-wrap gap-2">
          {step.secondary && !frozen ? <Button variant="secondary" onClick={() => run(step.secondary!)}><PhoneCall /> {labelOf(step.secondary)}</Button> : null}
          {step.primary && !frozen ? <Button onClick={() => run(step.primary!)}>{labelOf(step.primary)}</Button> : null}
          {request.status === "converted" && request.convertedSubscriptionId ? (
            <Button asChild>
              <NavLink to={`/admin/abonnements/${encodeURIComponent(request.convertedSubscriptionId)}`}>Ouvrir la fiche client</NavLink>
            </Button>
          ) : null}
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
        {info.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold">{value ?? "—"}</dd>
          </div>
        ))}
        {request.message ? (
          <div className="flex flex-col gap-0.5 sm:col-span-3">
            <dt className="text-muted-foreground">Message</dt>
            <dd className="rounded-lg bg-muted px-3.5 py-3 leading-relaxed">« {request.message} »</dd>
          </div>
        ) : null}
      </dl>

      {review ? (
        <section className="flex flex-col gap-2 rounded-xl border border-border p-4">
          <h3 className="text-sm font-bold">Qualification</h3>
          <p className="text-[13px]">
            <strong>{qualificationOutcomeLabels[review.outcome]}</strong>
            {review.agreedPriceXaf !== null ? ` · ${moneyXaf(review.agreedPriceXaf)}` : ""}
            {review.targetStartDate ? ` · début ${dateFr(review.targetStartDate)}` : ""}
            <span className="text-muted-foreground"> · v{review.version}, {dateFr(review.createdAt)}</span>
          </p>
          {review.conditions?.length ? <ul className="list-disc pl-5 text-[13px]">{review.conditions.map((c) => <li key={c}>{c}</li>)}</ul> : null}
          {review.suitabilityNote ? <p className="text-[13px] text-muted-foreground">{review.suitabilityNote}</p> : null}
          {review.blockers?.length ? <p className="text-[13px] text-warning">Blocages : {review.blockers.join(" · ")}</p> : null}
        </section>
      ) : null}

      {request.waitlistEntries.length ? (
        <section className="flex flex-col gap-2 rounded-xl border border-border p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Clock className="size-4 text-waitlist" aria-hidden="true" /> Liste d'attente</h3>
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {request.waitlistEntries.map((e) => (
              <li key={e.id}>
                <strong>{waitlistEntryStatusLabels[e.status]}</strong> · entrée le {dateFr(e.enteredAt)}
                {e.leftAt ? ` · sortie le ${dateFr(e.leftAt)}` : ""}
                {e.priorityNote ? <span className="text-muted-foreground"> · {e.priorityNote}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">Tentatives de contact</h3>
          {!frozen && step.secondary !== "attempt" && !["converted", "rejected", "closed_duplicate"].includes(request.status) ? (
            <Button variant="ghost" size="sm" onClick={() => setOpen("attempt")}>+ Tentative</Button>
          ) : null}
        </div>
        {request.contactAttempts.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Aucune tentative enregistrée.</p>
        ) : (
          <ol className="flex flex-col">
            {request.contactAttempts.map((a) => (
              <li key={a.id} className="flex gap-3 border-l-2 border-border pb-4 pl-4 last:pb-0">
                <span aria-hidden="true" className={cn("-ml-[23px] mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full", a.outcome === "reached" ? "bg-primary text-white" : "border-2 border-input bg-card")}>
                  {a.outcome === "reached" ? <Check className="size-2.5" strokeWidth={4} /> : null}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5 text-[13px]">
                  <span>
                    <strong>{channelLabels[a.channel]}</strong> · {directionLabels[a.direction].toLowerCase()} · {outcomeLabels[a.outcome]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dateTimeFr(a.occurredAt)}
                    {a.nextActionAt ? ` · prochaine action ${dateTimeFr(a.nextActionAt)}` : ""}
                  </span>
                  {a.note ? <span className="text-muted-foreground">{a.note}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <ContactAttemptSheet request={request} open={open === "attempt"} onOpenChange={(o) => setOpen(o ? "attempt" : null)} />
      <QualificationSheet request={request} open={open === "qualification"} onOpenChange={(o) => setOpen(o ? "qualification" : null)} />
      <WaitlistDialog request={request} open={open === "waitlist"} onOpenChange={(o) => setOpen(o ? "waitlist" : null)} />
      <ConversionDialog
        request={request}
        open={open === "conversion"}
        onOpenChange={(o) => setOpen(o ? "conversion" : null)}
        onConverted={(reference) => toast.success(`Abonnement ${reference} créé, en préparation.`)}
      />
      <ConfirmDialog
        open={open === "abandoned"}
        onOpenChange={(o) => setOpen(o ? "abandoned" : null)}
        title="Abandonner la demande"
        description="La demande sort de la file active. Elle pourra être reprise en qualification."
        confirmLabel="Abandonner"
        destructive
        onConfirm={async () => {
          await adminRequestsApiClient.transitionStatus(request.id, "abandoned");
          await refresh();
          toast.success("Demande abandonnée.");
        }}
      />
      <ConfirmDialog
        open={open === "withdraw"}
        onOpenChange={(o) => setOpen(o ? "withdraw" : null)}
        title="Retirer de la liste d'attente"
        description="L'entrée est retirée et la demande passe en « Abandonnée »."
        confirmLabel="Retirer"
        destructive
        onConfirm={async () => {
          await adminRequestsApiClient.withdrawWaitlistEntry(request.id);
          await refresh();
          toast.success("Demande retirée de la liste d'attente.");
        }}
      />
      {privacyDialog.dialog === "archive" ? <ArchiveDialog subjectType="prospect" subjectId={request.prospect.id} name={request.prospect.fullName} onClose={privacyDialog.close} restoreFocus={privacyDialog.restoreFocus} /> : null}
      {privacyDialog.dialog === "unarchive" ? <UnarchiveDialog subjectType="prospect" subjectId={request.prospect.id} name={request.prospect.fullName} onClose={privacyDialog.close} restoreFocus={privacyDialog.restoreFocus} /> : null}
      {privacyDialog.dialog === "anonymize" ? <AnonymizeDialog subjectType="prospect" subjectId={request.prospect.id} name={request.prospect.fullName} activeHolds={0} onClose={privacyDialog.close} restoreFocus={privacyDialog.restoreFocus} /> : null}
    </div>
  );
}
