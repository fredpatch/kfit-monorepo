import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import axios, { AxiosHeaders } from "axios";
import { toast } from "sonner";
import {
  authCsrfHeaderName,
  devToolsApiRoutes,
  testDataKinds,
  testDataTotal,
  type DevToolsErrorCode,
  type TestDataAnalysisResponse,
  type TestDataCounts,
  type TestDataKeptKind,
  type TestDataPurgeResponse,
} from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../auth/api/csrf.js";
import { Button } from "../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { Dialog, DialogClose, DialogContent } from "../components/ui/dialog.js";
import { EmptyState } from "../components/ui/empty-state.js";

/*
 * TEST-01 D4/D6: « Données de test » card, loaded only when import.meta.env.DEV (NotificationSettingsPage), so it never reaches
 * the production bundle. The server refuses these routes outside local kfit_dev anyway.
 */
const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  withCredentials: true,
  headers: { accept: "application/json" },
});
http.interceptors.request.use((config) => {
  if (requiresCsrfHeader(config.method)) {
    const headers = AxiosHeaders.from(config.headers),
      token = buildCsrfHeaders(config.method)[authCsrfHeaderName];
    if (token) headers.set(authCsrfHeaderName, token);
    config.headers = headers;
  }
  return config;
});

const labels: Record<TestDataKeptKind, string> = {
  external_access_events: "Accès aux liens",
  questionnaire_answers: "Réponses de questionnaire",
  questionnaire_submissions: "Questionnaires remplis",
  questionnaire_questions: "Questions de questionnaire",
  questionnaire_templates: "Modèles de questionnaire",
  notification_email_outbox: "E-mails de notification",
  notifications: "Notifications",
  appointment_events: "Historique des rendez-vous",
  appointments: "Rendez-vous",
  component_events: "Historique des prestations",
  follow_up_events: "Historique des suivis",
  follow_ups: "Suivis",
  goal_events: "Historique des objectifs",
  goals: "Objectifs",
  medical_clearance_records: "Avis médicaux",
  onboarding_items: "Éléments de préparation",
  consent_records: "Consentements",
  payment_allocations: "Affectations de paiement",
  receipts: "Reçus",
  payment_proofs: "Preuves de paiement",
  payment_events: "Paiements",
  installments: "Échéances",
  payment_plans: "Échéanciers",
  progress_photos: "Photos de progression",
  progress_measurements: "Mesures",
  subscription_follow_up_cadence_history: "Historique de cadence",
  subscription_pauses: "Pauses",
  subscription_status_history: "Historique de statut",
  subscription_components: "Prestations d'abonnement",
  quote_versions: "Versions de devis",
  quotes: "Devis",
  document_versions: "Versions de document",
  documents: "Documents",
  secure_access_tokens: "Liens sécurisés",
  retention_holds: "Blocages de conservation",
  subscriptions: "Abonnements",
  qualification_reviews: "Qualifications",
  waitlist_entries: "Liste d'attente",
  contact_attempts: "Prises de contact",
  service_requests: "Demandes",
  customers: "Clientes",
  prospects: "Prospects",
  consent_definitions: "Textes de consentement",
  service_policies: "Règles d'offre",
  service_components: "Prestations d'offre",
  service_variants: "Formules",
  services: "Offres",
  users: "Comptes de test conservés",
};
const errors: Record<DevToolsErrorCode, string> = {
  DEV_TOOLS_UNAVAILABLE:
    "Outil disponible seulement en développement, sur la base locale kfit_dev.",
  DEV_TEST_DATA_CHANGED:
    "Les données ont changé depuis l'analyse. Relance « Analyser ».",
  DEV_TOOLS_INVALID_INPUT: "Analyse invalide. Relance « Analyser ».",
  DEV_TOOLS_ADMIN_FORBIDDEN: "Réservé aux administrateurs.",
  DEV_TOOLS_ROUTE_UNEXPECTED_FAILURE:
    "Échec inattendu. Réessaie dans un instant.",
};
function errorMessage(error: unknown): string {
  const code: unknown = axios.isAxiosError<{ error?: unknown }>(error)
    ? error.response?.data?.error
    : undefined;
  return typeof code === "string" && code in errors
    ? errors[code as DevToolsErrorCode]
    : "Échec inattendu. Réessaie dans un instant.";
}
const plural = (count: number) => `${count} ligne${count > 1 ? "s" : ""}`;
const keptOrder: readonly TestDataKeptKind[] = [...testDataKinds, "users"];

function CountTable({
  counts,
  caption,
}: {
  counts: TestDataCounts<TestDataKeptKind>;
  caption: string;
}) {
  const rows = keptOrder.filter((kind) => counts[kind]);
  return (
    <table className="w-full text-sm">
      <caption className="pb-1.5 text-left text-xs font-semibold text-muted-foreground">
        {caption}
      </caption>
      <tbody>
        {rows.map((kind) => (
          <tr key={kind} className="border-t border-border-subtle">
            <td className="py-1.5">{labels[kind]}</td>
            <td className="py-1.5 text-right font-semibold tabular-nums">
              {counts[kind]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TestDataCard() {
  const [analysis, setAnalysis] = useState<TestDataAnalysisResponse | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const analyse = useMutation({
    mutationFn: async () =>
      (await http.get<TestDataAnalysisResponse>(devToolsApiRoutes.testData))
        .data,
    onSuccess: setAnalysis,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const purge = useMutation({
    mutationFn: async (fingerprint: string) =>
      (
        await http.post<TestDataPurgeResponse>(
          devToolsApiRoutes.testDataPurge,
          { fingerprint },
        )
      ).data,
    onSuccess: (result) => {
      setConfirming(false);
      setAnalysis(null);
      toast.success(
        `Données de test supprimées : ${plural(testDataTotal(result.counts))}.`,
      );
    },
    onError: (error) => {
      setConfirming(false);
      setAnalysis(null);
      toast.error(errorMessage(error));
    },
  });

  const total = analysis ? testDataTotal(analysis.counts) : 0;
  const kept = analysis ? testDataTotal(analysis.kept) : 0;
  const busy = analyse.isPending || purge.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Données de test</CardTitle>
        <CardDescription>
          Développement uniquement. Repère les fixtures d'intégration restées
          dans kfit_dev (noms « [TEST] … » et anciens marqueurs) et ce qui en
          dépend. Ce qui touche une vraie cliente est conservé.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => analyse.mutate()}
          >
            {analyse.isPending ? "Analyse…" : "Analyser"}
          </Button>
          {analysis && total > 0 ? (
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              Supprimer les données de test
            </Button>
          ) : null}
        </div>
        {analysis && total === 0 ? (
          <EmptyState
            title="Aucune donnée de test"
            {...(kept
              ? {
                  description: `${plural(kept)} conservée(s), liée(s) à de vraies données.`,
                }
              : {})}
          />
        ) : null}
        {analysis && total > 0 ? (
          <CountTable
            counts={analysis.counts}
            caption={`À supprimer : ${plural(total)}`}
          />
        ) : null}
        {analysis && kept > 0 ? (
          <CountTable
            counts={analysis.kept}
            caption={`Conservé : ${plural(kept)}`}
          />
        ) : null}
      </CardContent>
      <Dialog
        open={confirming}
        onOpenChange={(open) =>
          !open && !purge.isPending ? setConfirming(false) : undefined
        }
      >
        {confirming && analysis ? (
          <DialogContent
            title="Supprimer les données de test"
            description={`${plural(total)} seront supprimées définitivement de kfit_dev${kept ? ` ; ${plural(kept)} conservée(s)` : ""}. Les journaux d'audit et les comptes ne sont jamais supprimés.`}
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="secondary" disabled={purge.isPending}>
                    Retour
                  </Button>
                </DialogClose>
                <Button
                  variant="destructive-solid"
                  disabled={purge.isPending}
                  onClick={() => purge.mutate(analysis.fingerprint)}
                >
                  {purge.isPending ? "Suppression…" : "Supprimer"}
                </Button>
              </>
            }
          >
            <CountTable
              counts={analysis.counts}
              caption={`À supprimer : ${plural(total)}`}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  );
}
