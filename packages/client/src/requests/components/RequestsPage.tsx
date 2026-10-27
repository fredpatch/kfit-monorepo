import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Search } from "lucide-react";
import type { AdminServiceRequestSummary } from "@kfit/shared";
import { adminRequestsApiClient } from "../api/admin-requests-api.js";
import { requestErrorMessage } from "../lib/request-error-messages.js";
import {
  requestViewLabels,
  requestViewStatuses,
  requestViews,
  type RequestView,
} from "../lib/request-labels.js";
import { RequestDetail } from "./RequestDetail.js";
import { AdminPage } from "../../app/layout/AdminPage.js";
import { Avatar } from "../../components/ui/avatar.js";
import { Button } from "../../components/ui/button.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { cn } from "../../lib/utils.js";
import { requestStatus, type StatusDescriptor } from "../../lib/status-map.js";
import { familyMeta, familyOfSlug } from "../../lib/families.js";

/** "il y a 2 h" style age, compact for the queue. */
function age(iso: string, now = Date.now()): string {
  const minutes = Math.max(
    0,
    Math.round((now - new Date(iso).getTime()) / 60_000),
  );
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} j`;
}

/** Follow-up flag from the scheduled next action (S3.3 nextActionAt). Display only. */
function flagOf(
  r: AdminServiceRequestSummary,
  now = new Date(),
): StatusDescriptor | null {
  if (!r.nextActionAt || !requestViewStatuses.todo.includes(r.status))
    return null;
  const at = new Date(r.nextActionAt);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  if (at < now) return { label: "Relance en retard", tone: "danger" };
  if (at <= endOfDay) return { label: "Relance aujourd'hui", tone: "warning" };
  return null;
}

/** Service family from its name until the API exposes the family (backlog « Famille d'offre »). */
const familyOfName = (name: string) =>
  familyOfSlug(
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-"),
  );
const viewParam: Record<RequestView, string> = {
  todo: "a-traiter",
  submitted: "nouvelles",
  contacting: "contact",
  qualification: "qualification",
  waitlisted: "attente",
  closed: "cloturees",
};

function QueueItem({
  request,
  selected,
  onSelect,
}: {
  request: AdminServiceRequestSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const flag = flagOf(request);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          selected
            ? "border-[#b9d7ac] bg-[#f5faf2]"
            : "border-transparent hover:bg-muted",
        )}
      >
        <Avatar name={request.prospect.fullName} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-bold">
              {request.prospect.fullName}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {age(request.submittedAt)}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 shrink-0 rounded-[2px]",
                familyMeta[familyOfName(request.service.name)].dotClass,
              )}
            />
            <span className="truncate">
              {request.service.name}
              {request.requestedVariant
                ? ` · ${request.requestedVariant.name}`
                : ""}
            </span>
          </span>
          <span className="flex flex-wrap gap-1.5">
            <StatusPill size="sm" status={requestStatus[request.status]} />
            {flag ? <StatusPill size="sm" status={flag} /> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Demandes (board 05). Data: existing S3 endpoints; queue views filtered client-side in V1. Funnel hidden until S7. */
export function RequestsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["requests", "admin-queue", "all"],
    queryFn: () => adminRequestsApiClient.listQueue(),
    refetchInterval: 60_000,
  });
  const view =
    requestViews.find((v) => viewParam[v] === params.get("vue")) ?? "todo";
  const selectedId = params.get("demande");

  const all = query.data?.requests ?? [];
  const counts = useMemo(
    () =>
      Object.fromEntries(
        requestViews.map((v) => [
          v,
          all.filter((r) => requestViewStatuses[v].includes(r.status)).length,
        ]),
      ) as Record<RequestView, number>,
    [all],
  );
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("fr");
    const digits = term.replace(/[^0-9]/g, "");
    return all.filter((r) => {
      if (!requestViewStatuses[view].includes(r.status)) return false;
      if (!term) return true;
      const haystack =
        `${r.prospect.fullName} ${r.reference} ${r.service.name}`.toLocaleLowerCase(
          "fr",
        );
      return (
        haystack.includes(term) ||
        (digits.length >= 3 &&
          r.prospect.whatsapp.replace(/[^0-9]/g, "").includes(digits))
      );
    });
  }, [all, view, search]);

  const update = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next))
      v === null ? merged.delete(k) : merged.set(k, v);
    setParams(merged, { replace: true });
  };

  const newCount = counts.submitted ?? 0;
  const inProgress = (counts.contacting ?? 0) + (counts.qualification ?? 0);

  return (
    <AdminPage
      title="Demandes"
      description={
        query.data
          ? `${newCount} nouvelle(s) à contacter · ${inProgress} en cours de traitement`
          : "Demandes reçues et suivi des contacts"
      }
      actions={
        <Button
          variant="secondary"
          onClick={() => update({ vue: viewParam.waitlisted, demande: null })}
        >
          Liste d'attente · {counts.waitlisted ?? 0}
        </Button>
      }
    >
      {query.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Chargement des demandes…
        </p>
      ) : query.isError ? (
        <EmptyState
          title="Impossible de charger les demandes"
          description={requestErrorMessage(query.error)}
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Réessayer
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div
            role="group"
            aria-label="Vues"
            className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1"
          >
            {requestViews.map((v) => {
              const selected = v === view;
              const hot = v === "submitted" && newCount > 0;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    update({ vue: v === "todo" ? null : viewParam[v] })
                  }
                  className={cn(
                    "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-primary font-bold text-foreground"
                      : "border-transparent font-semibold text-muted-foreground hover:text-foreground",
                  )}
                >
                  {requestViewLabels[v]}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                      hot
                        ? "bg-info-soft text-info"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {counts[v] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            <section
              aria-label="File des demandes"
              className={cn(
                "flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-2",
                selectedId ? "hidden lg:flex" : "",
              )}
            >
              <label className="m-1 flex h-9 items-center gap-2 rounded-md border border-input px-2.5 text-muted-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
                <Search className="size-4 shrink-0" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nom, WhatsApp ou référence…"
                  aria-label="Rechercher une demande"
                  className="h-full w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </label>
              {visible.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
                  {search
                    ? "Aucune demande ne correspond à la recherche."
                    : `Aucune demande dans « ${requestViewLabels[view]} ».`}
                </p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {visible.map((r) => (
                    <QueueItem
                      key={r.id}
                      request={r}
                      selected={r.id === selectedId}
                      onSelect={() => update({ demande: r.id })}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section
              aria-label="Détail de la demande"
              className={cn(
                "min-w-0 rounded-xl border border-border bg-card",
                selectedId ? "" : "hidden lg:block",
              )}
            >
              {selectedId ? (
                <RequestDetail
                  key={selectedId}
                  requestId={selectedId}
                  onBack={() => update({ demande: null })}
                />
              ) : (
                <p className="px-6 py-16 text-center text-sm text-muted-foreground">
                  Sélectionne une demande pour voir le détail.
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
