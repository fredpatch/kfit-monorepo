import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { followUpsApi, followUpErrorMessage } from "../api/follow-ups-api.js";
import { activityTypes, cadenceSources, cadenceStates, followUpDate } from "./follow-up-labels.js";
export function AdminFollowUpQueuePage() {
  const [filter, setFilter] = useState<"all" | "overdue" | "upcoming">("all");
  const query = useQuery({ queryKey: ["follow-up-queue"], queryFn: () => followUpsApi.queue(), refetchInterval: 30000 });
  if (query.isPending) return <p role="status">Chargement de la file des suivis…</p>;
  if (query.isError || !query.data) return <section className="customers-panel"><p className="error" role="alert">{followUpErrorMessage(query.error)}</p><button type="button" onClick={() => void query.refetch()}>Réessayer</button></section>;
  const items = query.data.items.filter(item => filter === "all" || filter === "overdue" && item.cadenceState === "overdue" || filter === "upcoming" && item.cadenceState !== "overdue");
  return <section className="customers-panel"><h2>File des suivis</h2><p>Abonnements actifs avec cadence configurée. Les pauses et les autres états sont exclus. Les retards de prochaines actions sont affichés séparément.</p>
    <p className="muted">Calcul au {followUpDate(query.data.asOf)}.</p><div className="onboarding-actions"><button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tous</button><button type="button" aria-pressed={filter === "overdue"} onClick={() => setFilter("overdue")}>En retard</button><button type="button" aria-pressed={filter === "upcoming"} onClick={() => setFilter("upcoming")}>À suivre</button><button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>Actualiser</button></div>
    {items.length === 0 ? <p>Aucun abonnement dans cette vue.</p> : <ol className="onboarding-items">{items.map(item => <li key={item.subscriptionId}><h3>{item.customer.fullName}</h3><p>{item.reference} · <strong>{item.cadenceState ? cadenceStates[item.cadenceState] : "Non applicable"}</strong></p>
      <p>Tous les {item.effectiveCadenceDays} jours · {cadenceSources[item.cadenceSource]}</p><p>Prochain suivi : {followUpDate(item.nextFollowUpDueAt)}</p><p>Dernière activité : {followUpDate(item.latestMeaningfulActivityAt)}{item.latestActivityType ? ` · ${activityTypes[item.latestActivityType]}` : ""}</p>
      {item.overdueByDays !== null && <p className="error">Retard en temps actif : {item.overdueByDays === 0 ? "moins d’un jour" : `${item.overdueByDays} jour(s)`}.</p>}<p>{item.openFollowUpCount} action(s) ouverte(s) · {item.overdueNextActionCount} prochaine(s) action(s) en retard</p><a href={`/admin/abonnements/${item.subscriptionId}#follow-ups`}>Ouvrir les suivis de l’abonnement</a>
    </li>)}</ol>}
  </section>;
}
