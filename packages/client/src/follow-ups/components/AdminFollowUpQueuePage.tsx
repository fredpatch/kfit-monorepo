import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router";
import type { FollowUpQueueItem } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Avatar } from "../../components/ui/avatar.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { SegmentedControl } from "../../components/ui/segmented-control.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { cadenceState, overdueLabel, type StatusDescriptor } from "../../lib/status-map.js";
import { dateTimeFr, shortDateFr } from "../../lib/format.js";
import { followUpsApi, followUpErrorMessage } from "../api/follow-ups-api.js";
import { activityTypes } from "./follow-up-labels.js";

/** « Suivis » page (board 14e, UX-14a). Same queue rules as S4.4: active subscriptions with a rhythm, pauses excluded. */
type Filter = "all" | "overdue" | "upcoming";
const profileLink = (i: FollowUpQueueItem) => `/admin/clients/${i.customer.id}?abonnement=${i.subscriptionId}&onglet=suivis&nouveau=suivi`;
const stateOf = (i: FollowUpQueueItem): StatusDescriptor => (i.cadenceState === "overdue" ? { label: overdueLabel(i.overdueByDays), tone: "danger" } : i.cadenceState ? cadenceState[i.cadenceState] : { label: "Non applicable", tone: "neutral" });
const actionsLabel = (i: FollowUpQueueItem) => (i.openFollowUpCount === 0 ? "—" : `${i.openFollowUpCount}${i.overdueNextActionCount ? ` dont ${i.overdueNextActionCount} en retard` : ""}`);

export function AdminFollowUpQueuePage() {
  const [filter, setFilter] = useState<Filter>("all");
  const query = useQuery({ queryKey: ["follow-up-queue"], queryFn: () => followUpsApi.queue(), refetchInterval: 30000 });
  if (query.isPending) return <p role="status" className="text-sm text-muted-foreground">Chargement des suivis…</p>;
  if (query.isError) return <EmptyState title="Suivis indisponibles" description={followUpErrorMessage(query.error)} action={<Button variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button>} />;

  const all = [...query.data.items].sort((a, b) => (b.overdueByDays ?? -1) - (a.overdueByDays ?? -1) || Date.parse(a.nextFollowUpDueAt ?? "") - Date.parse(b.nextFollowUpDueAt ?? ""));
  const overdue = all.filter((i) => i.cadenceState === "overdue").length;
  const items = all.filter((i) => filter === "all" || (filter === "overdue" ? i.cadenceState === "overdue" : i.cadenceState !== "overdue"));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label="Filtrer les suivis"
          value={filter}
          onValueChange={(v) => setFilter(v as Filter)}
          options={[
            { value: "all", label: `Tous · ${all.length}` },
            { value: "overdue", label: `En retard · ${overdue}` },
            { value: "upcoming", label: `À suivre · ${all.length - overdue}` },
          ]}
        />
        <p className="text-xs text-muted-foreground">Calcul au {dateTimeFr(query.data.asOf)}</p>
      </div>

      {items.length === 0 ? <EmptyState title="Aucune cliente dans cette vue" description="Les abonnements actifs avec un rythme de suivi apparaissent ici. Les pauses ne comptent pas." /> : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-semibold">Cliente</th>
                  <th scope="col" className="px-3 py-3 font-semibold">État</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Dernier contact</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Suivi attendu</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Actions ouvertes</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.subscriptionId} className="border-t border-border-subtle">
                    <th scope="row" className="px-5 py-3 font-normal">
                      <NavLink to={`/admin/clients/${i.customer.id}?abonnement=${i.subscriptionId}&onglet=suivis`} className="group flex items-center gap-2.5">
                        <Avatar name={i.customer.fullName} size="sm" />
                        <span className="flex flex-col">
                          <span className="font-bold group-hover:underline">{i.customer.fullName}</span>
                          <span className="text-xs text-muted-foreground">{i.reference}</span>
                        </span>
                      </NavLink>
                    </th>
                    <td className="px-3 py-3"><StatusPill size="sm" status={stateOf(i)} /></td>
                    <td className="px-3 py-3"><span className="font-semibold">{shortDateFr(i.latestMeaningfulActivityAt)}</span>{i.latestActivityType ? <span className="block text-xs text-muted-foreground">{activityTypes[i.latestActivityType]}</span> : null}</td>
                    <td className="px-3 py-3"><span className="font-semibold">{shortDateFr(i.nextFollowUpDueAt)}</span><span className="block text-xs text-muted-foreground">tous les {i.effectiveCadenceDays} j</span></td>
                    <td className="px-3 py-3 text-[13px]">{actionsLabel(i)}</td>
                    <td className="px-5 py-3 text-right"><Button asChild size="sm" variant="secondary"><NavLink to={profileLink(i)}>Enregistrer le suivi</NavLink></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2.5 md:hidden">
            {items.map((i) => (
              <li key={i.subscriptionId} className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5">
                <div className="flex items-center gap-2.5">
                  <Avatar name={i.customer.fullName} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold">{i.customer.fullName}</span>
                    <span className="text-xs text-muted-foreground">{i.reference}</span>
                  </span>
                  <StatusPill size="sm" status={stateOf(i)} />
                </div>
                <p className="text-[13px] text-muted-foreground">Dernier contact {shortDateFr(i.latestMeaningfulActivityAt)} · attendu {shortDateFr(i.nextFollowUpDueAt)} · actions : {actionsLabel(i)}</p>
                <Button asChild size="sm" variant="secondary" className="self-start"><NavLink to={profileLink(i)}>Enregistrer le suivi</NavLink></Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
