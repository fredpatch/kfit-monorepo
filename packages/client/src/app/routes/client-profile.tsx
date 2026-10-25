import { lazy, Suspense, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, useParams, useSearchParams } from "react-router";
import { isAxiosError } from "axios";
import { Mail, MapPin, MessageCircle, Phone, Plus } from "lucide-react";
import { consentScopeAllows, customerAnalyticsPeriods, type AdminCustomerSubscriptionSummary, type CustomerAnalyticsPeriod } from "@kfit/shared";
import { customersApi } from "../../customers/api/customers-api.js";
import { isOnboardingEditable } from "../../profile/preparation/editable.js";
import { OverviewTab } from "../../profile/overview/OverviewTab.js";
import { Avatar } from "../../components/ui/avatar.js";
import { Button } from "../../components/ui/button.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs.js";
import { paymentProofsApi } from "../../payment-proofs/api/payment-proofs-api.js";
import { Tooltip } from "../../components/ui/tooltip.js";
import { cn } from "../../lib/utils.js";
import { dateFr } from "../../lib/format.js";
import { describeStatus, subscriptionStatus } from "../../lib/status-map.js";
import { familyMeta, familyOfSlug } from "../../lib/families.js";
import { defaultSubscription, deriveClientStatus } from "../../lib/client-status.js";
import { AdminPage } from "../layout/AdminPage.js";

/* Charts (Recharts) load only when the Progression tab is opened. */
const AnalysisTab = lazy(() => import("../../profile/analysis/AnalysisTab.js").then((m) => ({ default: m.AnalysisTab })));
const ProgressTab = lazy(() => import("../../profile/progress/ProgressTab.js").then((m) => ({ default: m.ProgressTab })));
const DocumentsTab = lazy(() => import("../../profile/documents/DocumentsTab.js").then((m) => ({ default: m.DocumentsTab })));
const AppointmentsTab = lazy(() => import("../../profile/appointments/AppointmentsTab.js").then((m) => ({ default: m.AppointmentsTab })));
const FollowUpsTab = lazy(() => import("../../profile/follow-ups/FollowUpsTab.js").then((m) => ({ default: m.FollowUpsTab })));
const PreparationTab = lazy(() => import("../../profile/preparation/PreparationTab.js").then((m) => ({ default: m.PreparationTab })));
const HealthTab = lazy(() => import("../../profile/health/HealthTab.js").then((m) => ({ default: m.HealthTab })));
const PaymentsTab = lazy(() => import("../../profile/payments/PaymentsTab.js").then((m) => ({ default: m.PaymentsTab })));

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tabs of the client profile (board 03). « Analyse » arrives in a later step. */
export const profileTabs = [
  { value: "apercu", label: "Aperçu" },
  { value: "analyse", label: "Analyse" },
  { value: "rendez-vous", label: "Rendez-vous" },
  { value: "suivis", label: "Suivis" },
  { value: "preparation", label: "Préparation" },
  { value: "progression", label: "Progression" },
  { value: "documents", label: "Documents" },
  { value: "paiements", label: "Paiements" },
  { value: "sante", label: "Santé et consentements" },
] as const;
type ProfileTab = (typeof profileTabs)[number]["value"];
/** Former tab ids (UX-15a merged Finance + Devis): deep links from alerts and notifications keep landing on « Paiements ». */
const tabAliases: Record<string, ProfileTab> = { finance: "paiements", devis: "paiements" };


const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;

function SubscriptionChip({ subscription, selected, onSelect }: { subscription: AdminCustomerSubscriptionSummary; selected: boolean; onSelect: () => void }) {
  const family = familyOfSlug(subscription.serviceSlug);
  const status = describeStatus(subscriptionStatus, subscription.status);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-9 items-center gap-2 rounded-md border px-3 py-1.5 text-left text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-brand-50 ring-1 ring-primary" : "border-border bg-card hover:bg-muted",
      )}
    >
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-[2px]", familyMeta[family].dotClass)} />
      <span className="whitespace-nowrap tabular-nums">{subscription.reference.length > 16 ? subscription.reference.slice(0, 12) + "…" : subscription.reference}</span>
      <span className="text-muted-foreground">·</span>
      <span>
        {subscription.serviceName}
        {subscription.variantName ? ` · ${subscription.variantName}` : ""}
      </span>
      <StatusPill size="sm" status={status} />
    </button>
  );
}

export function ClientProfilePage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const valid = uuidPattern.test(id);
  const query = useQuery({ queryKey: ["customers", "detail", id], queryFn: () => customersApi.detail(id), enabled: valid });

  const subscriptions = query.data?.subscriptions ?? [];
  const requested = params.get("abonnement");
  const selected = subscriptions.find((s) => s.id === requested) ?? defaultSubscription(subscriptions);
  const period = customerAnalyticsPeriods.find((p) => p === params.get("periode")) ?? "30j";
  const requestedTab = params.get("onglet") ?? "";
  const tab = (tabAliases[requestedTab] ?? (profileTabs.some((t) => t.value === requestedTab) ? requestedTab : "apercu")) as ProfileTab;

  /** « nouveau=suivi » (Suivis page, Aujourd'hui) opens the follow-up form once, then leaves the URL. */
  const clearNew = useCallback(() => {
    setParams((current) => { const next = new URLSearchParams(current); next.delete("nouveau"); return next; }, { replace: true });
  }, [setParams]);

  const update = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) merged.set(k, v);
    setParams(merged, { replace: true });
  };

  // Keep the selected subscription in the URL so links and reloads land on the same one.
  useEffect(() => {
    if (selected && requested !== selected.id) update({ abonnement: selected.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  if (!valid || (query.isError && isAxiosError(query.error) && (query.error.response?.status === 404 || query.error.response?.status === 400))) {
    return (
      <AdminPage title="Fiche client">
        <EmptyState
          title="Client introuvable"
          description="Ce lien ne correspond à aucune fiche active."
          action={
            <Button asChild variant="secondary">
              <NavLink to="/admin/clients">Voir les clients</NavLink>
            </Button>
          }
        />
      </AdminPage>
    );
  }
  if (query.isError) {
    return (
      <AdminPage title="Fiche client">
        <EmptyState title="Impossible de charger la fiche" description="Vérifie ta connexion puis réessaie." action={<Button variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button>} />
      </AdminPage>
    );
  }
  if (query.isPending || !query.data) {
    return (
      <AdminPage title="Fiche client">
        <p role="status" className="text-sm text-muted-foreground">
          Chargement de la fiche…
        </p>
      </AdminPage>
    );
  }

  const { customer } = query.data;
  const clientStatus = deriveClientStatus(subscriptions);
  const place = [customer.city, customer.country].filter(Boolean).join(", ");

  return (
    <AdminPage
      title={customer.fullName}
      breadcrumb={
        <nav aria-label="Fil d'Ariane" className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <NavLink to="/admin/clients" className="font-semibold text-primary hover:underline">
            Clients
          </NavLink>
          <span aria-hidden="true">/</span>
          <span className="font-semibold text-foreground">{customer.fullName}</span>
        </nav>
      }
    >

      {/* Header (board 03) */}
      <section className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={customer.fullName} size="lg" />
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusPill status={clientStatus} />
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
              <li className="flex items-center gap-1.5 tabular-nums">
                <Phone className="size-3.5" aria-hidden="true" />
                {customer.whatsapp}
                {customer.preferredContactChannel === "whatsapp" ? " · WhatsApp préféré" : ""}
              </li>
              {customer.email ? (
                <li className="flex items-center gap-1.5">
                  <Mail className="size-3.5" aria-hidden="true" />
                  {customer.email}
                </li>
              ) : null}
              {place ? (
                <li className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {place}
                </li>
              ) : null}
              <li>Fiche créée le {dateFr(customer.createdAt)}</li>
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="whatsapp">
              <a href={waLink(customer.whatsapp)} target="_blank" rel="noreferrer">
                <MessageCircle aria-hidden="true" />
                WhatsApp
              </a>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
          <span className="mr-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Abonnements</span>
          {subscriptions.map((s) => (
            <SubscriptionChip key={s.id} subscription={s} selected={s.id === selected?.id} onSelect={() => update({ abonnement: s.id })} />
          ))}
          <Tooltip content="Création depuis la fiche : bientôt. Pour l'instant, convertis une demande.">
            <span>
              <Button variant="secondary" size="sm" className="border-dashed" disabled>
                <Plus aria-hidden="true" />
                Nouvel abonnement
              </Button>
            </span>
          </Tooltip>
        </div>
      </section>

        <Tabs value={tab} onValueChange={(value) => update({ onglet: value })}>
          <TabsList aria-label="Sections de la fiche" className="overflow-x-auto">
            {profileTabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {t.value === "paiements" && selected ? <PendingProofsBadge subscriptionId={selected.id} /> : null}
              </TabsTrigger>
            ))}
          </TabsList>
          {!selected ? (
            <TabsContent value={tab}>
              <EmptyState
                title={tab === "documents" ? "Documents indisponibles" : "Aucun abonnement"}
                description={tab === "documents"
                  ? "Cette fiche n'a pas encore d'abonnement auquel associer des documents. Convertis une demande, puis sélectionne l'abonnement à consulter."
                  : "Cette fiche n'a pas encore d'abonnement. Il apparaîtra ici après la conversion d'une demande."}
              />
            </TabsContent>
          ) : <>
          {/* Aperçu and Progression use the new design (board 03); the other tabs keep their current look until their own step. */}
          <TabsContent value="apercu">
            <OverviewTab key={selected.id} subscriptionId={selected.id} openTab={(onglet) => update({ onglet })} />
          </TabsContent>
          <TabsContent value="analyse">
            <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Chargement de l'analyse…</p>}>
              <AnalysisTab
                customerId={id}
                subscriptionId={selected.id}
                period={period}
                onPeriodChange={(periode: CustomerAnalyticsPeriod) => update({ periode })}
                onSelectSubscription={(abonnement) => update({ abonnement })}
                openProgress={() => update({ onglet: "progression" })}
              />
            </Suspense>
          </TabsContent>
          <TabsContent value="rendez-vous">
            <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Chargement des rendez-vous…</p>}>
              <AppointmentsTab key={selected.id} subscriptionId={selected.id} />
            </Suspense>
          </TabsContent>
          <TabsContent value="suivis">
            <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Chargement des suivis…</p>}>
              <FollowUpsTab key={selected.id} subscriptionId={selected.id} openRecord={params.get("nouveau") === "suivi"} onRecordOpened={clearNew} />
            </Suspense>
          </TabsContent>
          <TabsContent value="preparation">
            <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Chargement de la préparation…</p>}>
              <PreparationTab key={selected.id} subscriptionId={selected.id} openHealth={() => update({ onglet: "sante" })} />
            </Suspense>
          </TabsContent>
          <TabsContent value="progression">
            <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Chargement de la progression…</p>}>
              <ProgressTab key={selected.id} subscriptionId={selected.id} />
            </Suspense>
          </TabsContent>
          <TabsContent value="documents">
            <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Chargement des documents…</p>}>
              <DocumentsTab key={selected.id} subscriptionId={selected.id} />
            </Suspense>
          </TabsContent>
          <TabsContent value="paiements">
            <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Chargement des paiements…</p>}>
              <PaymentsTab key={selected.id} subscriptionId={selected.id} />
            </Suspense>
          </TabsContent>
          <TabsContent value="sante">
            <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Chargement…</p>}>
              <HealthTab key={selected.id} subscriptionId={selected.id} editable={isOnboardingEditable(selected.status)} optionalEditable={consentScopeAllows("optional", selected.status)} />
            </Suspense>
          </TabsContent>
          </>}
        </Tabs>
    </AdminPage>
  );
}

/** Count of payment proofs waiting for the coach (board 15a tab badge). Shares the proof list query of the tab. */
function PendingProofsBadge({ subscriptionId }: { subscriptionId: string }) {
  const query = useQuery({ queryKey: ["payment-proofs", subscriptionId], queryFn: () => paymentProofsApi.list(subscriptionId), refetchInterval: 30000 });
  const count = query.data?.proofs.filter((p) => p.status === "pending_review").length ?? 0;
  if (count === 0) return null;
  return (
    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-waitlist px-1.5 text-[11px] font-bold text-white">
      {count}
      <span className="sr-only"> justificatif{count > 1 ? "s" : ""} à vérifier</span>
    </span>
  );
}
